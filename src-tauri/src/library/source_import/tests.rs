use super::*;
use crate::library::file_hashing::hash_path;
use crate::library::fixture_folder::{
    fixture_with_vault, offer_as_picked, plant_file, PLAN_PDF_BYTES,
};
use crate::library::source_discovery::{discover_source_candidates, SourceDiscoveryRoot};
use std::fs;
use std::path::PathBuf;

#[test]
fn an_import_streams_the_copy_and_refuses_the_same_bytes_twice() {
    let root = std::env::temp_dir().join(format!("atlas-import-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let root_path = fs::canonicalize(&root)
        .unwrap()
        .to_string_lossy()
        .to_string();
    let picked = root.join("scan.pdf");
    let body: Vec<u8> = (0..300_000_u32).map(|i| (i % 251) as u8).collect();
    fs::write(&picked, &body).unwrap();

    let vended = offer_as_picked(&picked);
    let first = import_source_files(root_path.clone(), vec![vended.clone()], None).unwrap();
    assert_eq!(first[0].status, "added");
    assert_eq!(first[0].size, Some(body.len() as u64));
    assert_eq!(fs::read(root.join("sources/scan.pdf")).unwrap(), body);
    assert_eq!(
        first[0].sha256,
        hash_path(&root.join("sources/scan.pdf")).ok()
    );

    let vended = offer_as_picked(&picked);
    let second = import_source_files(root_path, vec![vended], None).unwrap();
    assert_eq!(second[0].status, "duplicate");
    assert_eq!(second[0].relative_path.as_deref(), Some("sources/scan.pdf"));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn import_refuses_a_source_the_app_never_offered() {
    let root = std::env::temp_dir().join(format!("atlas-vended-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let root_path = fs::canonicalize(&root)
        .unwrap()
        .to_string_lossy()
        .to_string();

    let chosen = root.join("chosen.pdf");
    fs::write(&chosen, b"%PDF-1.7 chosen\n").unwrap();
    let secret = root.join("stolen.pdf");
    fs::write(&secret, b"%PDF-1.7 secret\n").unwrap();

    let offered = offer_as_picked(&chosen);
    let results = import_source_files(
        root_path.clone(),
        vec![offered.clone(), secret.to_string_lossy().to_string()],
        None,
    )
    .unwrap();
    let outcome = |name: &str| {
        results
            .iter()
            .find(|result| result.picked_name == name)
            .unwrap()
    };
    assert_eq!(outcome("chosen.pdf").status, "added");
    assert_eq!(outcome("stolen.pdf").status, "failed");
    assert_eq!(
        outcome("stolen.pdf").reason.as_deref(),
        Some("source-not-offered")
    );
    assert!(!root.join("sources/stolen.pdf").exists());

    let replay = import_source_files(root_path, vec![offered], None).unwrap();
    assert_eq!(replay[0].status, "failed");
    assert_eq!(replay[0].reason.as_deref(), Some("source-not-offered"));
    let _ = fs::remove_dir_all(&root);
}

fn outcome_rows(results: &[SourceImportResult]) -> Vec<(String, String, Option<String>)> {
    results
        .iter()
        .map(|row| {
            (
                row.picked_name.clone(),
                row.status.clone(),
                row.relative_path.clone(),
            )
        })
        .collect()
}

#[test]
fn the_planning_destination_lands_flat_in_planning_and_never_overwrites() {
    let (fixture, vault) = fixture_with_vault("planning-destination");
    fs::create_dir_all(fixture.join("vault").join("planning").join("research")).unwrap();
    fs::write(
        fixture.join("vault").join("planning").join("Brief.md"),
        b"# Theirs\n",
    )
    .unwrap();
    fs::write(
        fixture
            .join("vault")
            .join("planning")
            .join("research")
            .join("old.png"),
        b"PNG-old",
    )
    .unwrap();
    fs::create_dir_all(fixture.join("picked")).unwrap();
    fs::write(fixture.join("picked").join("brief.md"), b"# Mine\n").unwrap();
    fs::write(fixture.join("picked").join(".screen.png"), b"PNG-new").unwrap();
    fs::write(fixture.join("picked").join("again.png"), b"PNG-old").unwrap();

    let picked = vec![
        offer_as_picked(&fixture.join("picked").join("brief.md")),
        offer_as_picked(&fixture.join("picked").join(".screen.png")),
        offer_as_picked(&fixture.join("picked").join("again.png")),
    ];
    let results = import_source_files(vault, picked, Some(ImportDestination::Planning)).unwrap();
    assert_eq!(
        outcome_rows(&results),
        vec![
            (
                "brief.md".to_string(),
                "renamed".to_string(),
                Some("planning/brief (2).md".to_string())
            ),
            (
                ".screen.png".to_string(),
                "added".to_string(),
                Some("planning/screen.png".to_string())
            ),
            (
                "again.png".to_string(),
                "duplicate".to_string(),
                Some("planning/research/old.png".to_string())
            ),
        ]
    );
    assert_eq!(
        fs::read(fixture.join("vault").join("planning").join("Brief.md")).unwrap(),
        b"# Theirs\n"
    );
    assert_eq!(
        fs::read(fixture.join("vault").join("planning").join("brief (2).md")).unwrap(),
        b"# Mine\n"
    );
    assert_eq!(
        fs::read(fixture.join("vault").join("planning").join("screen.png")).unwrap(),
        b"PNG-new"
    );
    assert!(!fixture.join("vault").join("sources").exists());
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn the_planning_destination_refuses_a_path_the_app_never_offered() {
    let (fixture, vault) = fixture_with_vault("planning-unoffered");
    fs::write(fixture.join("stolen.md"), b"# Secret\n").unwrap();
    let results = import_source_files(
        vault,
        vec![fixture.join("stolen.md").to_string_lossy().into_owned()],
        Some(ImportDestination::Planning),
    )
    .unwrap();
    assert_eq!(results[0].status, "failed");
    assert_eq!(results[0].reason.as_deref(), Some("source-not-offered"));
    assert_eq!(
        fs::read_dir(fixture.join("vault").join("planning"))
            .unwrap()
            .count(),
        0
    );
    fs::remove_dir_all(fixture).unwrap();
}

// The mock runtime links window classes a Windows test binary cannot load.
#[cfg(any(target_os = "macos", target_os = "linux"))]
#[test]
fn an_unknown_destination_is_refused_before_anything_is_created() {
    use tauri::{
        ipc::{CallbackFn, InvokeBody},
        test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY},
        webview::InvokeRequest,
        WebviewWindowBuilder,
    };

    let (fixture, vault) = fixture_with_vault("unknown-destination");
    fs::write(fixture.join("plan.md"), b"# Plan\n").unwrap();
    let offered = offer_as_picked(&fixture.join("plan.md"));
    let app = mock_builder()
        .invoke_handler(tauri::generate_handler![
            crate::library::source_import::import_source_files
        ])
        .build(mock_context(noop_assets()))
        .unwrap();
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    for destination in ["../outside", "/tmp", "Planning", "planning/inner", ""] {
        let response = get_ipc_response(
            &window,
            InvokeRequest {
                cmd: "import_source_files".into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(serde_json::json!({
                    "rootPath": vault,
                    "sourcePaths": [offered],
                    "destination": destination,
                })),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.into(),
            },
        );
        assert!(response.is_err(), "{destination:?} must be refused");
    }
    assert_eq!(fs::read_dir(fixture.join("vault")).unwrap().count(), 0);
    assert!(!fixture.join("outside").exists());

    let accepted = get_ipc_response(
        &window,
        InvokeRequest {
            cmd: "import_source_files".into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "tauri://localhost".parse().unwrap(),
            body: InvokeBody::Json(serde_json::json!({
                "rootPath": vault,
                "sourcePaths": [offered],
                "destination": "planning",
            })),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.into(),
        },
    )
    .unwrap()
    .deserialize::<serde_json::Value>()
    .unwrap();
    assert_eq!(accepted[0]["relativePath"], "planning/plan.md");
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn the_planning_destination_copies_only_what_the_home_scan_lists_and_spends_every_offer() {
    let (fixture, vault) = fixture_with_vault("planning-types");
    fs::create_dir_all(fixture.join("picked")).unwrap();
    for (name, body) in [
        ("plan.pdf", &b"%PDF-1.7\n"[..]),
        ("run.sh", b"#!/bin/sh\n"),
        ("api-token.png", b"PNG-secret"),
        ("api-token.md", b"# Token rotation\n"),
    ] {
        fs::write(fixture.join("picked").join(name), body).unwrap();
    }
    let offered: Vec<String> = ["plan.pdf", "run.sh", "api-token.png", "api-token.md"]
        .iter()
        .map(|name| offer_as_picked(&fixture.join("picked").join(name)))
        .collect();
    let results = import_source_files(
        vault.clone(),
        offered.clone(),
        Some(ImportDestination::Planning),
    )
    .unwrap();
    let reasons: Vec<(&str, Option<&str>)> = results
        .iter()
        .map(|row| (row.status.as_str(), row.reason.as_deref()))
        .collect();
    assert_eq!(
        reasons,
        vec![
            ("failed", Some("unsupported-type")),
            ("failed", Some("unsupported-type")),
            ("failed", Some("unsupported-type")),
            ("added", None),
        ]
    );
    let mut landed: Vec<String> = fs::read_dir(fixture.join("vault").join("planning"))
        .unwrap()
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    landed.sort();
    assert_eq!(landed, vec!["api-token.md".to_string()]);

    let replay = import_source_files(
        vault,
        offered[..3].to_vec(),
        Some(ImportDestination::Planning),
    )
    .unwrap();
    assert!(replay
        .iter()
        .all(|row| row.reason.as_deref() == Some("source-not-offered")));
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn a_document_discovery_offered_is_still_refused_for_planning_when_its_type_is_unlisted() {
    let (fixture, vault) = fixture_with_vault("planning-discovered");
    let project = fixture.join("project");
    fs::create_dir_all(&project).unwrap();
    fs::write(project.join("plan.pdf"), PLAN_PDF_BYTES).unwrap();
    let project = fs::canonicalize(&project).unwrap();
    let _scope =
        crate::vault_grants::EnforcedScope::granting(&[PathBuf::from(&vault), project.clone()]);

    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: project.to_string_lossy().into_owned(),
        label: "project".into(),
        skip_relative: Vec::new(),
        open_folder: false,
    }])
    .unwrap();
    let candidate = &report.candidates[0];
    let offered = format!("{}/{}", candidate.root_path, candidate.relative_path);
    let results =
        import_source_files(vault, vec![offered], Some(ImportDestination::Planning)).unwrap();
    assert_eq!(results[0].reason.as_deref(), Some("unsupported-type"));
    assert_eq!(
        fs::read_dir(fixture.join("vault").join("planning"))
            .unwrap()
            .count(),
        0
    );
    fs::remove_dir_all(fixture).unwrap();
}

/// The page can send any string; one Rust never offered is refused and never opened.
#[test]
fn a_home_ssh_key_the_page_sends_fails_source_not_offered() {
    let (fixture, vault) = fixture_with_vault("ssh-key");
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let key = home
        .join(".ssh")
        .join("id_ed25519")
        .to_string_lossy()
        .into_owned();
    let results = import_sources(
        &vault,
        vec![key],
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert_eq!(results[0].status, "failed");
    assert_eq!(results[0].reason.as_deref(), Some("source-not-offered"));
    assert_eq!(results[0].sha256, None);
    assert!(fs::read_dir(PathBuf::from(&vault).join("sources"))
        .unwrap()
        .next()
        .is_none());
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn stop_ends_an_import_between_files_and_keeps_what_landed() {
    let (fixture, vault) = fixture_with_vault("stop");
    let mut keys = Vec::new();
    for index in 0..5 {
        let file = fixture.join(format!("note-{index}.txt"));
        plant_file(&file, 100 + index);
        keys.push(offer_as_picked(&file));
    }
    let stop = AtomicBool::new(false);
    let seen = std::cell::Cell::new(0);
    let progress = |done: usize, _total: usize| {
        seen.set(done);
        if done == 2 {
            stop.store(true, Ordering::Relaxed);
        }
    };
    let results = import_sources(
        &vault,
        keys,
        ImportDestination::Sources,
        &ImportControl {
            stop: Some(&stop),
            progress: Some(&progress),
        },
    )
    .unwrap();
    assert_eq!(results.len(), 2);
    assert_eq!(seen.get(), 2);
    let landed = fs::read_dir(PathBuf::from(&vault).join("sources"))
        .unwrap()
        .count();
    assert_eq!(landed, 2);
    fs::remove_dir_all(fixture).unwrap();
}
