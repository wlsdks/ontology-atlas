use super::*;
use crate::gray_area_scope::observe_source;
use std::fs;
use std::path::PathBuf;
struct Fixture {
    root: PathBuf,
    vault: PathBuf,
    code: PathBuf,
    basis: EvidenceBasis,
}
impl Fixture {
    fn new() -> Self {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let serial = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "atlas-gray-{}-{nonce}-{serial}",
            std::process::id()
        ));
        fs::create_dir(&root).unwrap();
        let vault = root.join("vault");
        let code = root.join("code");
        fs::create_dir_all(vault.join(".ontology-atlas")).unwrap();
        fs::create_dir_all(code.join("src")).unwrap();
        fs::write(
            vault.join("project.md"),
            "---\nkind: project\nslug: project\n---\n## Uncertainty\nnot read\n",
        )
        .unwrap();
        fs::write(code.join("src/a.ts"), "export const value = true;\n").unwrap();
        let code = crate::canonical_root(code.to_str().unwrap()).unwrap();
        let vault = crate::canonical_root(vault.to_str().unwrap()).unwrap();
        let source_id = crate::source_digest(&[b"folder", code.to_string_lossy().as_bytes()]);
        let binding = json!({"projectSlug":"project","sourceId":source_id,"rootPath":code,"kind":"folder","boundAt":"2026-09-28","receipt":{"projectSlug":"project","sourceId":source_id,"sourceKind":"folder"}});
        fs::write(
            vault.join(".ontology-atlas/project-sources.json"),
            json!({"contractVersion":1,"bindings":[binding]}).to_string(),
        )
        .unwrap();
        let bound = resolve_binding(&vault, "project").unwrap();
        let basis = EvidenceBasis {
            project_slug: "project".into(),
            selected_uids: vec!["node".into()],
            source_id,
            source_fingerprint: observe_source(&code).unwrap().fingerprint,
            source_roots: vec![".".into()],
            graph_digest: "unchanged-graph".into(),
            body_digest: vault_digest(&vault).unwrap(),
            binding_digest: bound.binding_digest,
        };
        Self {
            root,
            vault,
            code,
            basis,
        }
    }
    fn current(&self) -> bool {
        check_basis(self.vault.to_str().unwrap(), &self.basis, &[]).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}
#[test]
fn a_body_only_same_size_same_mtime_edit_invalidates_the_snapshot() {
    let f = Fixture::new();
    assert!(f.current());
    let path = f.vault.join("project.md");
    let time = fs::metadata(&path).unwrap().modified().unwrap();
    let text = fs::read_to_string(&path)
        .unwrap()
        .replace("not read", "now read");
    fs::write(&path, text).unwrap();
    fs::File::open(path)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(time))
        .unwrap();
    assert!(!f.current());
}
#[test]
fn source_content_and_new_scan_limit_invalidate_without_a_git_timestamp() {
    let f = Fixture::new();
    let path = f.code.join("src/a.ts");
    let time = fs::metadata(&path).unwrap().modified().unwrap();
    fs::write(&path, "export const value = null;\n").unwrap();
    fs::File::open(path)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(time))
        .unwrap();
    assert!(!f.current());
    let g = Fixture::new();
    fs::write(g.code.join("src/large.ts"), vec![b'x'; 512 * 1024 + 1]).unwrap();
    assert!(!g.current());
}
#[test]
fn resolver_only_edits_and_negative_candidate_additions_invalidate_currentness() {
    let mut f = Fixture::new();
    let config = f.code.join("tsconfig.json");
    fs::write(
        &config,
        r#"{"compilerOptions":{"paths":{"policy":["src/old.ts"]}}}"#,
    )
    .unwrap();
    f.basis.source_fingerprint = observe_source(&f.code).unwrap().fingerprint;
    let time = fs::metadata(&config).unwrap().modified().unwrap();
    fs::write(
        &config,
        r#"{"compilerOptions":{"paths":{"policy":["src/new.ts"]}}}"#,
    )
    .unwrap();
    fs::File::open(config)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(time))
        .unwrap();
    assert!(!f.current());
    let g = Fixture::new();
    fs::write(g.code.join("src/policy.ts"), "export const policy=true;").unwrap();
    assert!(!g.current());
}
#[test]
fn replacing_a_directory_with_identical_names_and_bytes_invalidates_its_identity() {
    let f = Fixture::new();
    let original = f.code.join("src");
    let moved = f.code.join("previous");
    fs::rename(&original, &moved).unwrap();
    fs::create_dir(&original).unwrap();
    fs::copy(moved.join("a.ts"), original.join("a.ts")).unwrap();
    fs::remove_dir_all(moved).unwrap();
    assert!(!f.current());
}
#[test]
fn a_rebound_root_is_not_the_same_evidence_even_with_identical_code() {
    let f = Fixture::new();
    let path = f.vault.join(".ontology-atlas/project-sources.json");
    let mut data: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    data["bindings"][0]["boundAt"] = json!("2026-09-29");
    fs::write(path, data.to_string()).unwrap();
    assert!(!f.current());
}
#[test]
fn a_picker_rejected_root_never_offers_source_recovery() {
    let f = Fixture::new();
    let sidecar = f.vault.join(".ontology-atlas/project-sources.json");
    let mut data: Value = serde_json::from_slice(&fs::read(&sidecar).unwrap()).unwrap();
    let source_id = crate::source_digest(&[b"folder", b"/"]);
    data["bindings"][0]["rootPath"] = json!("/");
    data["bindings"][0]["sourceId"] = json!(source_id);
    data["bindings"][0]["receipt"]["sourceId"] = json!(source_id);
    fs::write(sidecar, data.to_string()).unwrap();
    let _scope = crate::vault_grants::EnforcedScope::granting(&[f.vault.clone()]);
    assert_eq!(
        preview_gray_area_scope(
            f.vault.to_string_lossy().into_owned(),
            "project".into(),
            None,
            None
        )
        .unwrap_err(),
        json!("vault-root-rejected:filesystem-root")
    );
}
#[test]
fn source_recovery_preserves_the_content_grant_and_binding() {
    let f = Fixture::new();
    let path = f.vault.to_string_lossy().into_owned();
    let before = fs::read(f.vault.join(".ontology-atlas/project-sources.json")).unwrap();
    {
        let _scope = crate::vault_grants::EnforcedScope::granting(&[f.vault.clone()]);
        let error =
            preview_gray_area_scope(path.clone(), "project".into(), None, None).unwrap_err();
        assert_eq!(error["code"], "source-root-not-granted");
        assert_eq!(error["sourcePath"], f.code.to_string_lossy().as_ref());
        assert_eq!(error["bindingDigest"], f.basis.binding_digest);
        assert_eq!(
            read_gray_area_evidence(
                path.clone(),
                "project".into(),
                vec![],
                f.basis.binding_digest.clone()
            )
            .unwrap_err(),
            "vault-root-not-granted"
        );
    }
    {
        let _scope = crate::vault_grants::EnforcedScope::granting(&[f.code.clone()]);
        assert_eq!(
            preview_gray_area_scope(path.clone(), "project".into(), None, None).unwrap_err(),
            json!("vault-root-not-granted")
        );
    }
    {
        let _scope =
            crate::vault_grants::EnforcedScope::granting(&[fs::canonicalize(&f.root).unwrap()]);
        for other in [&f.root, &f.vault, &f.code.join("src")] {
            assert_eq!(
                preview_gray_area_scope(
                    path.clone(),
                    "project".into(),
                    Some(other.to_string_lossy().into_owned()),
                    Some(f.basis.binding_digest.clone())
                )
                .unwrap_err(),
                json!("source_selection_mismatch")
            );
        }
        let selected = f.code.join(".").to_string_lossy().into_owned();
        assert!(preview_gray_area_scope(
            path.clone(),
            "project".into(),
            Some(selected.clone()),
            Some(f.basis.binding_digest.clone())
        )
        .is_ok());
        assert_eq!(
            preview_gray_area_scope(
                path.clone(),
                "project".into(),
                Some(selected),
                Some("old-binding".into())
            )
            .unwrap_err(),
            json!("binding_changed")
        );
    }
    assert_eq!(
        fs::read(f.vault.join(".ontology-atlas/project-sources.json")).unwrap(),
        before
    );
}
#[test]
fn preview_does_not_scan_and_a_changed_approval_is_refused_before_spawning() {
    let f = Fixture::new();
    fs::write(f.code.join("src/large.ts"), vec![b'x'; 512 * 1024 + 1]).unwrap();
    assert!(preview_gray_area_scope(
        f.vault.to_string_lossy().into_owned(),
        "project".into(),
        None,
        None
    )
    .is_ok());
    assert_eq!(
        read_gray_area_evidence(
            f.vault.to_string_lossy().into_owned(),
            "project".into(),
            vec!["node".into()],
            "other-binding".into()
        )
        .unwrap_err(),
        "binding_changed"
    );
}
#[test]
fn credential_names_are_excluded_from_hashing_and_passed_to_the_import_ignore_list() {
    let f = Fixture::new();
    fs::write(f.code.join("src/secrets.ts"), "private value").unwrap();
    let before = observe_source(&f.code).unwrap();
    fs::write(f.code.join("src/secrets.ts"), "changed private value").unwrap();
    let after = observe_source(&f.code).unwrap();
    assert_eq!(before.fingerprint, after.fingerprint);
    assert!(after.ignored_names.contains(&"secrets.ts".into()));
    assert!(!after.files.iter().any(|p| p.contains("secrets")));
}
#[test]
fn unavailable_import_scan_does_not_capture_or_publish_sensitive_authored_paths() {
    let f = Fixture::new();
    fs::create_dir(f.code.join("certs")).unwrap();
    fs::write(f.code.join("src/large.ts"), vec![b'x'; 512 * 1024 + 1]).unwrap();
    for path in [
        "certs/private.PEM",
        "src/privatekey.ts",
        "src/PRIVATEKEY.ts",
    ] {
        fs::write(f.code.join(path), "sensitive sentinel").unwrap();
    }
    let source = observe_source(&f.code).unwrap();
    assert!(source.limited);
    assert!(!source
        .entries
        .iter()
        .any(|entry| entry.text.as_deref() == Some("sensitive sentinel")));
    for path in [
        "certs/private.PEM",
        "src/privatekey.ts",
        "src/PRIVATEKEY.ts",
    ] {
        let witness = source_witness(&f.code, &source, path);
        assert_eq!(witness["status"], "refused", "{path}");
        assert!(witness.get("text").is_none());
    }
    assert_eq!(
        source_witness(&f.code, &source, "src/a.ts")["status"],
        "read"
    );
}
#[test]
fn source_witnesses_refuse_ambiguous_paths_unsupported_types_and_binary_bytes() {
    let f = Fixture::new();
    let paths = [
        "src/a#note.ts",
        "src/a:note.ts",
        "src/a\\note.ts",
        "src/a\n.ts",
        "src/data.json",
        "src/a.exe",
        "src/binary.ts",
        "src/invalid.ts",
    ];
    for path in paths {
        fs::write(f.code.join(path), b"ordinary text").unwrap();
    }
    fs::write(f.code.join("src/binary.ts"), b"sentinel\0binary").unwrap();
    fs::write(f.code.join("src/invalid.ts"), [0xff, 0xff]).unwrap();
    let source = observe_source(&f.code).unwrap();
    for path in paths
        .into_iter()
        .chain(["src//a.ts", "src/./a.ts", "src/../src/a.ts"])
    {
        let witness = source_witness(&f.code, &source, path);
        assert_eq!(witness["status"], "refused", "{path}");
        assert!(witness.get("text").is_none());
    }
    assert!(source
        .entries
        .iter()
        .all(|e| e.text.as_ref().is_none_or(|t| !t.contains('\0'))));
}
#[cfg(unix)]
#[test]
fn symlinked_source_files_and_sidecars_do_not_grant_reads() {
    let f = Fixture::new();
    let outside = f.root.join("outside");
    fs::write(&outside, "private").unwrap();
    std::os::unix::fs::symlink(&outside, f.code.join("src/link.ts")).unwrap();
    assert!(!f.current());
    assert!(observe_source(&f.code)
        .unwrap()
        .entries
        .iter()
        .any(|e| e.path == "src/link.ts" && e.kind == "symlink" && e.text.is_none()));
    let sidecar = f.vault.join(".ontology-atlas/project-sources.json");
    fs::remove_file(&sidecar).unwrap();
    std::os::unix::fs::symlink(outside, sidecar).unwrap();
    assert!(resolve_binding(&f.vault, "project").is_err());
}
