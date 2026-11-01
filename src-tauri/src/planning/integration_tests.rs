use super::{confined::open_root, session::PlanningSession};
use crate::{
    git::briefing::git_source_briefing,
    library::{discover_source_candidates, SourceDiscoveryRoot},
    project_source::inspect_project_source,
    vault::{
        read::read_vault_text_file, scope::canonical_root, walk::list_vault_directory,
        write::write_vault_text_file,
    },
    vault_grants::{self, EnforcedScope},
};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture {
    base: PathBuf,
    root: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let base = PathBuf::from(if cfg!(target_os = "macos") {
            "/private/tmp"
        } else {
            "/tmp"
        })
        .join(format!(
            "atlas-planning-grants-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let root = base.join("root");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("plan.md"), b"PLAN").unwrap();
        Self { base, root }
    }
    fn path(&self) -> String {
        self.root.to_string_lossy().into_owned()
    }
    fn grant(&self, session: &PlanningSession) -> u64 {
        session
            .activate(
                session.begin_selection().unwrap(),
                self.root.clone(),
                open_root(&self.root).unwrap(),
            )
            .unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}

#[test]
fn planning_selection_does_not_grant_existing_vault_or_source_commands() {
    let f = Fixture::new();
    let _scope = EnforcedScope::granting(&[]);
    let session = PlanningSession::default();
    let generation = f.grant(&session);
    assert_eq!(
        session
            .read_with_hook(generation, Path::new("plan.md"), |_| {})
            .unwrap(),
        b"PLAN"
    );
    for root in [f.path(), f.base.to_string_lossy().into_owned()] {
        assert!(read_vault_text_file(root.clone(), "plan.md".into()).is_err());
        assert!(write_vault_text_file(root.clone(), "planted.md".into(), "x".into()).is_err());
        assert!(list_vault_directory(root.clone(), "".into(), None).is_err());
        assert!(inspect_project_source(root.clone()).is_err());
        let briefing =
            serde_json::to_value(git_source_briefing(root.clone(), 0, 1).unwrap()).unwrap();
        assert_eq!(briefing["status"], "ungranted");
        let result = discover_source_candidates(vec![SourceDiscoveryRoot {
            root_path: root,
            label: "selected".into(),
            skip_relative: vec![],
        }])
        .unwrap();
        assert!(result.candidates.is_empty());
        assert_eq!(result.unreadable_roots, vec!["selected"]);
    }
    assert!(!f.root.join("planted.md").exists());
    assert_eq!(fs::read(f.root.join("plan.md")).unwrap(), b"PLAN");
}

#[test]
fn wrong_shared_source_grant_changes_existing_source_access_positive_control() {
    let f = Fixture::new();
    let _scope = EnforcedScope::granting(&[]);
    assert!(inspect_project_source(f.path()).is_err());
    vault_grants::grant_source_root(&f.root);
    assert!(inspect_project_source(f.path()).is_ok());
    assert!(read_vault_text_file(f.path(), "plan.md".into()).is_err());
}

#[test]
fn separately_granted_vault_retains_but_does_not_expand_its_authority() {
    let f = Fixture::new();
    let _scope = EnforcedScope::granting(&[f.root.clone()]);
    assert!(read_vault_text_file(f.path(), "plan.md".into()).is_ok());
    let session = PlanningSession::default();
    f.grant(&session);
    assert!(read_vault_text_file(f.path(), "plan.md".into()).is_ok());
    assert!(canonical_root(&f.base.to_string_lossy()).is_err());
}

#[test]
fn separately_granted_source_survives_planning_revocation_without_parent_or_vault_access() {
    let f = Fixture::new();
    let _scope = EnforcedScope::granting(&[]);
    vault_grants::grant_source_root(&f.root);
    assert!(inspect_project_source(f.path()).is_ok());
    let session = PlanningSession::default();
    f.grant(&session);
    session.revoke().unwrap();
    assert!(inspect_project_source(f.path()).is_ok());
    assert!(inspect_project_source(f.base.to_string_lossy().into_owned()).is_err());
    assert!(read_vault_text_file(f.path(), "plan.md".into()).is_err());
}

#[test]
fn same_size_and_timestamp_replacement_must_not_be_restored_as_same_document() {
    use std::os::unix::fs::MetadataExt;
    let f = Fixture::new();
    let session = PlanningSession::default();
    let generation = f.grant(&session);
    let original = f.root.join("plan.md");
    let old = fs::metadata(&original).unwrap();
    let opened = session
        .open_document(generation, Path::new("plan.md"), None, 1)
        .unwrap();
    let token = std::str::from_utf8(&opened[..32]).unwrap();
    assert_eq!(&opened[32..], b"PLAN");
    let replacement = f.base.join("replacement.md");
    fs::write(&replacement, b"EVIL").unwrap();
    fs::File::options()
        .write(true)
        .open(&replacement)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(old.modified().unwrap()))
        .unwrap();
    fs::rename(&original, f.base.join("parked.md")).unwrap();
    fs::rename(&replacement, &original).unwrap();
    let new = fs::metadata(&original).unwrap();
    assert_eq!(old.len(), new.len());
    assert_eq!(old.modified().unwrap(), new.modified().unwrap());
    assert_ne!(old.ino(), new.ino());
    assert_eq!(
        session
            .open_document(generation, Path::new("plan.md"), Some(token), 2)
            .unwrap_err(),
        "file-changed"
    );
    assert_eq!(
        session
            .open_document(generation, Path::new("plan.md"), Some("forged"), 3)
            .unwrap_err(),
        "file-changed"
    );
    let newly_selected = session
        .open_document(generation, Path::new("plan.md"), None, 4)
        .unwrap();
    assert_ne!(&newly_selected[..32], token.as_bytes());
    assert_eq!(&newly_selected[32..], b"EVIL");
}

#[test]
fn mock_tauri_ipc_requires_planning_session_and_refuses_traversal() {
    use tauri::{
        ipc::{CallbackFn, InvokeBody},
        test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY},
        webview::InvokeRequest,
        WebviewWindowBuilder,
    };

    let f = Fixture::new();
    let session = PlanningSession::default();
    let generation = f.grant(&session);
    let app = mock_builder()
        .manage(session)
        .invoke_handler(tauri::generate_handler![
            crate::planning::commands::planning_supported,
            crate::planning::commands::planning_pick_folder,
            crate::planning::commands::planning_scan,
            crate::planning::commands::planning_read_file,
            crate::planning::commands::planning_open_document,
            crate::planning::commands::planning_revoke
        ])
        .build(mock_context(noop_assets()))
        .unwrap();
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let invoke = |cmd: &str, body: serde_json::Value| {
        get_ipc_response(
            &window,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(body),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.into(),
            },
        )
    };
    let supported = invoke("planning_supported", serde_json::json!({}))
        .unwrap()
        .deserialize::<bool>()
        .unwrap();
    assert_eq!(supported, cfg!(target_os = "macos"));
    let inventory = invoke(
        "planning_scan",
        serde_json::json!({"generation":generation}),
    )
    .unwrap()
    .deserialize::<serde_json::Value>()
    .unwrap();
    assert_eq!(inventory["files"][0]["path"], "plan.md");
    let payload = invoke(
        "planning_read_file",
        serde_json::json!({"generation":generation,"path":"plan.md"}),
    )
    .unwrap();
    assert!(matches!(payload, tauri::ipc::InvokeResponseBody::Raw(_)));
    let bytes = payload.deserialize::<Vec<u8>>().unwrap();
    assert_eq!(bytes, b"PLAN");
    let first = invoke(
        "planning_open_document",
        serde_json::json!({"generation":generation,"path":"plan.md","expectedIdentity":null,"request":1}),
    )
    .unwrap()
    .deserialize::<Vec<u8>>()
    .unwrap();
    let token = String::from_utf8(first[..32].to_vec()).unwrap();
    assert!(invoke(
        "planning_open_document",
        serde_json::json!({"generation":generation,"path":"plan.md","expectedIdentity":"forged","request":2})
    )
    .is_err());
    assert!(invoke(
        "planning_open_document",
        serde_json::json!({"generation":generation + 1,"path":"plan.md","expectedIdentity":token,"request":3})
    )
    .is_err());
    let metadata = fs::metadata(f.root.join("plan.md")).unwrap();
    let replacement = f.base.join("other.md");
    fs::write(&replacement, b"EVIL").unwrap();
    fs::File::options()
        .write(true)
        .open(&replacement)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(metadata.modified().unwrap()))
        .unwrap();
    fs::rename(f.root.join("plan.md"), f.base.join("old.md")).unwrap();
    fs::rename(replacement, f.root.join("plan.md")).unwrap();
    assert!(invoke(
        "planning_open_document",
        serde_json::json!({"generation":generation,"path":"plan.md","expectedIdentity":token,"request":3})
    )
    .is_err());
    fs::write(f.root.join("second.md"), b"SECOND").unwrap();
    let newer = invoke("planning_open_document", serde_json::json!({"generation":generation,"path":"second.md","expectedIdentity":null,"request":4})).unwrap().deserialize::<Vec<u8>>().unwrap();
    let newer_token = String::from_utf8(newer[..32].to_vec()).unwrap();
    assert!(invoke("planning_open_document", serde_json::json!({"generation":generation,"path":"plan.md","expectedIdentity":null,"request":1})).is_err());
    let reread = invoke("planning_open_document", serde_json::json!({"generation":generation,"path":"second.md","expectedIdentity":newer_token,"request":5})).unwrap().deserialize::<Vec<u8>>().unwrap();
    assert_eq!(&reread[32..], b"SECOND");
    assert!(invoke(
        "planning_read_file",
        serde_json::json!({"generation":generation,"path":"../plan.md"})
    )
    .is_err());
    invoke("planning_revoke", serde_json::json!({})).unwrap();
    assert!(invoke(
        "planning_read_file",
        serde_json::json!({"generation":generation,"path":"plan.md"})
    )
    .is_err());
}

#[test]
fn excluded_root_cannot_create_an_ipc_session() {
    use tauri::{
        ipc::{CallbackFn, InvokeBody},
        test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY},
        webview::InvokeRequest,
        WebviewWindowBuilder,
    };
    let f = Fixture::new();
    for name in [".secrets", "node_modules/hidden"] {
        let path = f.base.join(name);
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("plan.md"), b"DO NOT READ").unwrap();
        let session = PlanningSession::default();
        let ticket = session.begin_selection().unwrap();
        assert!(session
            .activate(ticket, path.clone(), open_root(&path).unwrap())
            .is_err());
        assert!(session.scan_with_hook(ticket, 10_000, |_| {}).is_err());
        assert!(session
            .read_with_hook(ticket, Path::new("plan.md"), |_| {})
            .is_err());
        let app = mock_builder()
            .manage(session)
            .invoke_handler(tauri::generate_handler![
                crate::planning::commands::planning_scan,
                crate::planning::commands::planning_open_document
            ])
            .build(mock_context(noop_assets()))
            .unwrap();
        let window = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        for (cmd, body) in [
            ("planning_scan", serde_json::json!({"generation":ticket})),
            (
                "planning_open_document",
                serde_json::json!({"generation":ticket,"path":"plan.md","expectedIdentity":null,"request":1}),
            ),
        ] {
            assert!(get_ipc_response(
                &window,
                InvokeRequest {
                    cmd: cmd.into(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: "tauri://localhost".parse().unwrap(),
                    body: InvokeBody::Json(body),
                    headers: Default::default(),
                    invoke_key: INVOKE_KEY.into()
                }
            )
            .is_err());
        }
    }
}
