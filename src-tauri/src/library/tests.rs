use super::*;

fn vend(path: &Path) -> String {
    let vended = path.to_string_lossy().to_string();
    remember_source_path(vended.clone(), fs::canonicalize(path).unwrap());
    vended
}

#[test]
fn discovery_refuses_the_files_local_first_forbids_reading() {
    for name in [
        ".env",
        ".env.local",
        "id_rsa",
        "credentials.json",
        "credentials.csv",
        "server.pem",
        "api_key.txt",
        "secrets.xlsx",
        ".hidden.pdf",
    ] {
        assert!(
            !discovery_accepts_file(name),
            "{name} must never be proposed as a candidate"
        );
    }
}

#[test]
fn discovery_accepts_ordinary_project_documents() {
    for name in [
        "Requirements.pdf",
        "quarter plan.docx",
        "numbers.xlsx",
        "notes.txt",
        "deck.pptx",
    ] {
        assert!(discovery_accepts_file(name), "{name} should be a candidate");
    }
}

#[test]
fn discovery_refuses_code_and_markdown() {
    for name in ["index.ts", "README.md", "Cargo.toml", "data.json"] {
        assert!(!discovery_accepts_file(name), "{name} is not a document");
    }
}

/// Over the 64-byte floor, so discovery offers it.
const PLAN_PDF_BYTES: &[u8] = &[b'x'; 64];

const DISCOVERY_CASES: &str = include_str!("../../../tests/fixtures/source-discovery-cases.json");

fn discovery_cases() -> serde_json::Value {
    serde_json::from_str(DISCOVERY_CASES).unwrap()
}

/// Plants each row as a file of its size and returns what the real walk offers.
fn offered_by_the_walk(label: &str, rows: &[serde_json::Value]) -> Vec<String> {
    let (fixture, vault) = fresh_fixture(label);
    let project = fixture.join("project");
    for row in rows {
        let file = row["path"]
            .as_str()
            .unwrap()
            .split('/')
            .fold(project.clone(), |path, segment| path.join(segment));
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        let bytes = usize::try_from(row["bytes"].as_u64().unwrap()).unwrap();
        fs::write(&file, vec![b'x'; bytes]).unwrap();
    }
    let project = fs::canonicalize(&project).unwrap();
    let _scope =
        crate::vault::grants::EnforcedScope::granting(&[PathBuf::from(&vault), project.clone()]);
    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: project.to_string_lossy().into_owned(),
        label: "project".into(),
        skip_relative: Vec::new(),
        open_folder: false,
    }])
    .unwrap();
    fs::remove_dir_all(fixture).unwrap();
    let mut offered: Vec<String> = report
        .candidates
        .into_iter()
        .map(|candidate| candidate.relative_path)
        .collect();
    offered.sort();
    offered
}

#[test]
fn the_owners_three_junk_files_yield_no_suggestion() {
    let cases = discovery_cases();
    let offered = offered_by_the_walk("owner-report", cases["ownerReport"].as_array().unwrap());
    assert_eq!(offered, Vec::<String>::new());
}

#[test]
fn the_shared_discovery_table_holds_for_the_native_walk() {
    let cases = discovery_cases();
    let rows = cases["files"].as_array().unwrap();
    let mut expected: Vec<String> = rows
        .iter()
        .filter(|row| row["offered"].as_bool().unwrap())
        .map(|row| row["path"].as_str().unwrap().to_string())
        .collect();
    expected.sort();
    assert_eq!(offered_by_the_walk("discovery-table", rows), expected);
}

#[test]
fn the_shared_directory_table_holds_with_either_separator() {
    let cases = discovery_cases();
    for row in cases["directories"].as_array().unwrap() {
        let path = row["path"].as_str().unwrap();
        assert_eq!(
            discovery_accepts_directory(path),
            row["descends"].as_bool().unwrap(),
            "{path:?}"
        );
    }
}

// Asserts what this build compiled: either writer must land bytes inside the
// sources folder and nowhere else.
#[test]
fn the_platform_writer_lands_inside_sources_and_nowhere_else() {
    let root = std::env::temp_dir().join(format!("atlas-lib-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join(SOURCES_DIR)).unwrap();
    let root_path = fs::canonicalize(&root)
        .unwrap()
        .to_string_lossy()
        .to_string();

    let (hash, length, name) = copy_source_into(
        &root_path,
        "sources",
        std::iter::once("plan.pdf".to_string()),
        &mut &b"%PDF-1.7\n"[..],
    )
    .unwrap()
    .unwrap();
    assert_eq!(name, "plan.pdf");
    assert_eq!(
        fs::read(root.join("sources/plan.pdf")).unwrap(),
        b"%PDF-1.7\n".to_vec()
    );
    assert_eq!(length, 9);
    assert_eq!(hash, hash_path(&root.join("sources/plan.pdf")).unwrap());

    assert!(copy_source_into(
        &root_path,
        "..",
        std::iter::once("escaped.pdf".to_string()),
        &mut &b"x"[..]
    )
    .is_err());

    let _ = fs::remove_dir_all(&root);
}

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

    let vended = vend(&picked);
    let first = import_source_files(root_path.clone(), vec![vended.clone()], None).unwrap();
    assert_eq!(first[0].status, "added");
    assert_eq!(first[0].size, Some(body.len() as u64));
    assert_eq!(fs::read(root.join("sources/scan.pdf")).unwrap(), body);
    assert_eq!(
        first[0].sha256,
        hash_path(&root.join("sources/scan.pdf")).ok()
    );

    let vended = vend(&picked);
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

    let offered = vend(&chosen);
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

#[test]
fn the_same_offered_file_ticked_twice_reports_one_add_and_one_duplicate() {
    let root = std::env::temp_dir().join(format!("atlas-twice-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let root_path = fs::canonicalize(&root)
        .unwrap()
        .to_string_lossy()
        .to_string();
    let picked = root.join("once.pdf");
    fs::write(&picked, b"%PDF-1.7 once\n").unwrap();

    let offered = vend(&picked);
    let results = import_source_files(root_path, vec![offered.clone(), offered], None).unwrap();
    assert_eq!(results[0].status, "added");
    assert_eq!(results[1].status, "duplicate");
    assert_eq!(
        results[1].relative_path.as_deref(),
        Some("sources/once.pdf")
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn an_offered_file_that_has_since_gone_missing_says_so() {
    let root = std::env::temp_dir().join(format!("atlas-gone-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let root_path = fs::canonicalize(&root)
        .unwrap()
        .to_string_lossy()
        .to_string();
    let picked = root.join("gone.pdf");
    fs::write(&picked, b"%PDF-1.7 gone\n").unwrap();

    let offered = vend(&picked);
    fs::remove_file(&picked).unwrap();
    let results = import_source_files(root_path, vec![offered], None).unwrap();
    assert_eq!(results[0].status, "failed");
    assert_eq!(results[0].reason.as_deref(), Some("source-missing"));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn a_discovered_candidate_imports_through_the_string_the_page_builds() {
    let base = std::env::temp_dir().join(format!("atlas-disc-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let vault = base.join("vault");
    let project = base.join("project");
    fs::create_dir_all(&vault).unwrap();
    fs::create_dir_all(&project).unwrap();
    fs::write(project.join("plan.pdf"), PLAN_PDF_BYTES).unwrap();
    let root_path = format!("{}/", project.to_string_lossy());
    let vault = fs::canonicalize(&vault).unwrap();
    let project = fs::canonicalize(&project).unwrap();

    let _scope = crate::vault::grants::EnforcedScope::granting(&[vault.clone(), project.clone()]);

    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: root_path.clone(),
        label: "project".into(),
        skip_relative: Vec::new(),
        open_folder: false,
    }])
    .unwrap();
    assert_eq!(report.candidates.len(), 1);
    let candidate = &report.candidates[0];
    assert_eq!(candidate.root_path, root_path);
    let page_string = format!("{}/{}", candidate.root_path, candidate.relative_path);

    let results =
        import_source_files(vault.to_string_lossy().to_string(), vec![page_string], None).unwrap();
    assert_eq!(results[0].status, "added");
    assert!(vault.join("sources/plan.pdf").is_file());
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn discovery_refuses_a_source_root_the_vault_gate_forbids() {
    let base = std::env::temp_dir().join(format!("atlas-badroot-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let bundle = base.join("thing.app");
    fs::create_dir_all(&bundle).unwrap();
    fs::write(bundle.join("plan.pdf"), b"%PDF-1.7\n").unwrap();
    let bundle = fs::canonicalize(&bundle).unwrap();

    let _scope = crate::vault::grants::EnforcedScope::granting(std::slice::from_ref(&bundle));

    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: bundle.to_string_lossy().to_string(),
        label: "bundle".into(),
        skip_relative: Vec::new(),
        open_folder: false,
    }])
    .unwrap();
    assert!(report.candidates.is_empty());
    assert_eq!(report.unreadable_roots, vec!["bundle".to_string()]);
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn source_names_cannot_escape_the_sources_folder() {
    assert_eq!(safe_source_file_name("a.pdf").as_deref(), Some("a.pdf"));
    assert_eq!(safe_source_file_name("../a.pdf"), None);
    assert_eq!(safe_source_file_name("dir/a.pdf"), None);
    assert_eq!(safe_source_file_name("..").as_deref(), None);
    assert_eq!(
        safe_source_file_name(".hidden.pdf").as_deref(),
        Some("hidden.pdf")
    );
}

#[test]
fn exhausted_source_names_preserve_originals_and_the_last_free_slot_still_works() {
    for occupied in [999, 998] {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let fixture = std::env::temp_dir().join(format!(
            "atlas-source-name-limit-{}-{nonce}-{occupied}",
            std::process::id()
        ));
        let vault = fixture.join("vault");
        let sources = vault.join(SOURCES_DIR);
        fs::create_dir_all(&sources).unwrap();
        for index in 1..=occupied {
            let name = if index == 1 {
                "source.txt".to_string()
            } else {
                format!("source ({index}).txt")
            };
            fs::write(sources.join(name), b"preserved original").unwrap();
        }
        let picked = fixture.join("source.txt");
        fs::write(&picked, b"new selected original").unwrap();
        let offered = vend(&picked);
        let outcome =
            import_source_files(vault.to_string_lossy().into_owned(), vec![offered], None).unwrap();
        for index in 1..=occupied {
            let name = if index == 1 {
                "source.txt".to_string()
            } else {
                format!("source ({index}).txt")
            };
            assert_eq!(fs::read(sources.join(name)).unwrap(), b"preserved original");
        }
        if occupied == 999 {
            assert_eq!(outcome[0].status, "failed");
            assert_eq!(outcome[0].relative_path, None);
            assert_eq!(fs::read_dir(&sources).unwrap().count(), 999);
        } else {
            assert_eq!(outcome[0].status, "renamed");
            assert_eq!(
                outcome[0].relative_path.as_deref(),
                Some("sources/source (999).txt")
            );
            assert_eq!(
                fs::read(sources.join("source (999).txt")).unwrap(),
                b"new selected original"
            );
        }
        fs::remove_dir_all(fixture).unwrap();
    }
}

fn fresh_fixture(label: &str) -> (PathBuf, String) {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("atlas-{label}-{}-{nonce}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("vault")).unwrap();
    let vault = fs::canonicalize(root.join("vault"))
        .unwrap()
        .to_string_lossy()
        .into_owned();
    (root, vault)
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
    let (fixture, vault) = fresh_fixture("planning-destination");
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
        vend(&fixture.join("picked").join("brief.md")),
        vend(&fixture.join("picked").join(".screen.png")),
        vend(&fixture.join("picked").join("again.png")),
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
    let (fixture, vault) = fresh_fixture("planning-unoffered");
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

#[cfg(unix)]
#[test]
fn a_linked_planning_folder_is_not_followed() {
    let (fixture, vault) = fresh_fixture("planning-link");
    let outside = fixture.join("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("known.md"), b"# Known\n").unwrap();
    std::os::unix::fs::symlink(&outside, fixture.join("vault").join("planning")).unwrap();
    fs::write(fixture.join("known.md"), b"# Known\n").unwrap();
    fs::write(fixture.join("fresh.md"), b"# Fresh\n").unwrap();

    let picked = vec![
        vend(&fixture.join("known.md")),
        vend(&fixture.join("fresh.md")),
    ];
    let refused = import_source_files(vault, picked, Some(ImportDestination::Planning));
    assert_eq!(
        refused.err().as_deref(),
        Some("import-destination-not-a-folder")
    );
    let mut outside_names: Vec<String> = fs::read_dir(&outside)
        .unwrap()
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    outside_names.sort();
    assert_eq!(outside_names, vec!["known.md".to_string()]);

    fs::remove_file(fixture.join("vault").join("planning")).unwrap();
    let replay = import_source_files(
        fixture.join("vault").to_string_lossy().into_owned(),
        vec![fixture.join("fresh.md").to_string_lossy().into_owned()],
        Some(ImportDestination::Planning),
    )
    .unwrap();
    assert_eq!(replay[0].reason.as_deref(), Some("source-not-offered"));
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn only_the_two_folder_names_parse_as_a_destination() {
    let parse = |value: &str| serde_json::from_value::<ImportDestination>(serde_json::json!(value));
    assert_eq!(parse("sources").unwrap(), ImportDestination::Sources);
    assert_eq!(parse("planning").unwrap(), ImportDestination::Planning);
    for refused in [
        "../outside",
        "/tmp",
        "C:\\Users",
        "Planning",
        "planning/inner",
        "",
    ] {
        assert!(parse(refused).is_err(), "{refused:?} must be refused");
    }
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

    let (fixture, vault) = fresh_fixture("unknown-destination");
    fs::write(fixture.join("plan.md"), b"# Plan\n").unwrap();
    let offered = vend(&fixture.join("plan.md"));
    let app = mock_builder()
        .invoke_handler(tauri::generate_handler![
            crate::library::import_source_files
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
    let (fixture, vault) = fresh_fixture("planning-types");
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
        .map(|name| vend(&fixture.join("picked").join(name)))
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
    let (fixture, vault) = fresh_fixture("planning-discovered");
    let project = fixture.join("project");
    fs::create_dir_all(&project).unwrap();
    fs::write(project.join("plan.pdf"), PLAN_PDF_BYTES).unwrap();
    let project = fs::canonicalize(&project).unwrap();
    let _scope =
        crate::vault::grants::EnforcedScope::granting(&[PathBuf::from(&vault), project.clone()]);

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

/// Reveal reaches Explorer, so the vault guard must refuse Windows path syntax before
/// anything is handed to the shell: a parent hop, a drive prefix and a UNC prefix. Only
/// refusals are exercised, because an accepted path would open a real Explorer window.
#[cfg(windows)]
#[test]
fn reveal_refuses_windows_path_escapes_before_the_shell() {
    let root = std::env::temp_dir().join(format!("atlas-reveal-guard-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("vault\\docs")).unwrap();
    fs::write(root.join("outside.md"), "outside").unwrap();
    let vault = root.join("vault").to_string_lossy().to_string();
    for escape in [
        "..\\outside.md",
        "docs\\..\\..\\outside.md",
        "C:\\Windows\\win.ini",
        "\\\\server\\share\\note.md",
        "\\Windows\\win.ini",
    ] {
        assert_eq!(
            reveal_vault_file_blocking(vault.clone(), escape.into()).unwrap_err(),
            "relative path must stay inside the selected vault",
            "{escape}"
        );
    }
    fs::remove_dir_all(root).ok();
}

/// Reveal selects one existing vault file and nothing else: a URL, a program name or a file
/// URL is a path inside the vault that does not exist, so it never reaches the file manager.
#[test]
fn reveal_refuses_a_url_or_a_program_before_the_shell() {
    let root = std::env::temp_dir().join(format!("atlas-reveal-url-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let vault = root.to_string_lossy().to_string();
    for target in [
        "https://example.com/note.md",
        "file:///etc/hosts",
        "calc.exe",
        "xdg-open",
        "",
    ] {
        assert!(
            reveal_vault_file_blocking(vault.clone(), target.into()).is_err(),
            "{target:?} reached the file manager"
        );
    }
    fs::remove_dir_all(root).ok();
}

/// The plugin's reveal is called as a plain function, so this shows the Windows shell call
/// itself succeeds. It opens a real Explorer window, so it runs only on CI runners.
#[cfg(windows)]
#[test]
fn reveal_selects_a_real_vault_file_through_the_windows_shell_on_ci() {
    if std::env::var_os("CI").is_none() {
        return;
    }
    let root = std::env::temp_dir().join(format!("atlas-reveal-real-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("docs")).unwrap();
    fs::write(root.join("docs\\note.md"), "note").unwrap();
    let vault = root.to_string_lossy().to_string();
    reveal_vault_file_blocking(vault, "docs\\note.md".into()).unwrap();
    fs::remove_dir_all(root).ok();
}

/// On every platform an absolute path and a folder stop before the file manager is called.
#[test]
fn reveal_refuses_an_absolute_path_and_a_folder_before_the_shell() {
    let root = std::env::temp_dir().join(format!("atlas-reveal-folder-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("docs")).unwrap();
    let vault = root.to_string_lossy().to_string();
    let outside = std::env::temp_dir().to_string_lossy().to_string();
    assert!(reveal_vault_file_blocking(vault.clone(), outside).is_err());
    assert_eq!(
        reveal_vault_file_blocking(vault, "docs".into()).unwrap_err(),
        "reveal target must be a file"
    );
    fs::remove_dir_all(root).ok();
}

/// Stored library hashes stay valid only while this digest is byte-for-byte unchanged.
#[test]
fn copy_hashing_keeps_the_recorded_sha256_across_chunks() {
    let input: Vec<u8> = (0..200_000_u32).map(|i| (i % 251) as u8).collect();
    let mut copied = Vec::new();
    let (hash, length) = copy_hashing(&mut input.as_slice(), &mut copied).unwrap();
    assert_eq!(
        hash,
        "e24bc62381f1224fbbb74688663f8f9743b9680b193edd666835e97b06e730eb"
    );
    assert_eq!(length, 200_000);
    assert_eq!(copied, input);
}

/// Drops share one "last drop" slot, so tests that drop take turns.
fn drop_turn() -> std::sync::MutexGuard<'static, ()> {
    static TURN: Mutex<()> = Mutex::new(());
    TURN.lock().unwrap_or_else(|err| err.into_inner())
}

fn plant(path: &Path, bytes: usize) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let body: Vec<u8> = path.to_string_lossy().bytes().cycle().take(bytes).collect();
    fs::write(path, body).unwrap();
}

#[test]
fn a_dropped_folder_copies_only_documents_and_counts_what_it_skipped() {
    let _turn = drop_turn();
    let (fixture, vault) = fresh_fixture("drop-folder");
    let dropped = fixture.join("contracts");
    for (name, bytes) in [
        (".env", 200),
        ("id_rsa", 400),
        ("LICENSE.txt", 900),
        ("node_modules/x.md", 300),
        (".DS_Store", 300),
        ("lease.pdf", 500),
        ("notes/renewal.md", 300),
    ] {
        plant(&dropped.join(name), bytes);
    }

    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&dropped));
    let mut landing: Vec<&str> = offer
        .files
        .iter()
        .map(|f| f.relative_path.as_str())
        .collect();
    landing.sort();
    assert_eq!(
        landing,
        vec!["contracts/lease.pdf", "contracts/notes/renewal.md"]
    );
    let mut skipped: Vec<(&str, SkipReason)> = offer
        .skipped
        .iter()
        .map(|s| (s.relative_path.as_str(), s.reason))
        .collect();
    skipped.sort_by_key(|(path, _)| *path);
    assert_eq!(
        skipped,
        vec![
            ("contracts/.env", SkipReason::SecretName),
            ("contracts/LICENSE.txt", SkipReason::Licence),
            ("contracts/id_rsa", SkipReason::SecretName),
        ]
    );
    assert_eq!(offer.total_bytes, 800);

    let keys = offer.files.iter().map(|f| f.path.clone()).collect();
    let results = import_sources(
        &vault,
        keys,
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert!(
        results.iter().all(|row| row.status == "added"),
        "{results:?}"
    );
    let vault = PathBuf::from(&vault);
    assert!(vault.join("sources/contracts/lease.pdf").is_file());
    assert!(vault.join("sources/contracts/notes/renewal.md").is_file());
    assert!(!vault.join("sources/contracts/LICENSE.txt").exists());
    fs::remove_dir_all(fixture).unwrap();
}

/// Windows paths come back with `\`; what lands under `sources/` is `/`-joined everywhere.
#[test]
fn a_dropped_folder_records_landing_paths_with_forward_slashes() {
    let _turn = drop_turn();
    let (fixture, _vault) = fresh_fixture("drop-slashes");
    let dropped = fixture.join("meetings");
    plant(&dropped.join("2026").join("weekly.txt"), 300);
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&dropped));
    assert_eq!(offer.files.len(), 1);
    assert_eq!(offer.files[0].relative_path, "meetings/2026/weekly.txt");
    fs::remove_dir_all(fixture).unwrap();
}

/// Dropping one file is the person's explicit choice, so its format is not judged.
#[test]
fn a_single_dropped_file_is_offered_whatever_its_format() {
    let _turn = drop_turn();
    let (fixture, vault) = fresh_fixture("drop-file");
    let photo = fixture.join("whiteboard.png");
    plant(&photo, 30);
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&photo));
    assert_eq!(offer.files.len(), 1);
    assert_eq!(offer.files[0].relative_path, "whiteboard.png");
    let results = import_sources(
        &vault,
        vec![offer.files[0].path.clone()],
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert_eq!(
        results[0].relative_path.as_deref(),
        Some("sources/whiteboard.png")
    );
    fs::remove_dir_all(fixture).unwrap();
}

/// A new drop withdraws the last one, so an old drop's paths stop being importable.
#[test]
fn a_new_drop_withdraws_the_previous_drops_offers() {
    let _turn = drop_turn();
    let (fixture, vault) = fresh_fixture("drop-withdraw");
    let first = fixture.join("first.pdf");
    let second = fixture.join("second.pdf");
    plant(&first, 100);
    plant(&second, 100);
    let earlier = dropped::offer_dropped_paths(std::slice::from_ref(&first));
    dropped::offer_dropped_paths(std::slice::from_ref(&second));
    let results = import_sources(
        &vault,
        vec![earlier.files[0].path.clone()],
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert_eq!(results[0].reason.as_deref(), Some("source-not-offered"));
    fs::remove_dir_all(fixture).unwrap();
}

#[cfg(unix)]
#[test]
fn a_dropped_folder_never_follows_a_link_out_of_it() {
    let _turn = drop_turn();
    let (fixture, _vault) = fresh_fixture("drop-link");
    let outside = fixture.join("outside");
    plant(&outside.join("private.pdf"), 300);
    let dropped = fixture.join("shared");
    plant(&dropped.join("agenda.pdf"), 300);
    std::os::unix::fs::symlink(&outside, dropped.join("linked")).unwrap();
    std::os::unix::fs::symlink(outside.join("private.pdf"), dropped.join("alias.pdf")).unwrap();
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&dropped));
    let landing: Vec<&str> = offer
        .files
        .iter()
        .map(|f| f.relative_path.as_str())
        .collect();
    assert_eq!(landing, vec!["shared/agenda.pdf"]);

    let linked_root = fixture.join("linked-root");
    std::os::unix::fs::symlink(&outside, &linked_root).unwrap();
    let refused = dropped::offer_dropped_paths(std::slice::from_ref(&linked_root));
    assert!(refused.files.is_empty());
    assert_eq!(refused.skipped.len(), 1);
    fs::remove_dir_all(fixture).unwrap();
}

/// An offer's recorded path is checked again at import: no segment may climb out.
#[test]
fn an_offered_landing_path_cannot_climb_out_of_sources() {
    let (fixture, vault) = fresh_fixture("traversal");
    let original = fixture.join("plan.pdf");
    plant(&original, 200);
    let canonical = fs::canonicalize(&original).unwrap();
    let mut keys = Vec::new();
    for (index, relative) in [
        "../escape.pdf",
        "a/../../escape.pdf",
        "/abs.pdf",
        "a//b.pdf",
        "..",
    ]
    .into_iter()
    .enumerate()
    {
        let key = format!("traversal-{index}-{}", fixture.display());
        remember_source_offer(
            key.clone(),
            SourceOffer::of_file(canonical.clone(), relative.into()).unwrap(),
        );
        keys.push(key);
    }
    let results = import_sources(
        &vault,
        keys,
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert_eq!(results.len(), 5);
    for row in &results {
        assert_eq!(row.reason.as_deref(), Some("unusable-file-name"), "{row:?}");
    }
    assert!(!fixture.join("escape.pdf").exists());
    assert!(!PathBuf::from(&vault).join("escape.pdf").exists());
    fs::remove_dir_all(fixture).unwrap();
}

#[cfg(unix)]
#[test]
fn a_linked_folder_inside_sources_is_refused_not_followed() {
    let (fixture, vault) = fresh_fixture("linked-sub");
    let outside = fixture.join("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::create_dir_all(PathBuf::from(&vault).join("sources")).unwrap();
    std::os::unix::fs::symlink(&outside, PathBuf::from(&vault).join("sources/meetings")).unwrap();
    let original = fixture.join("weekly.pdf");
    plant(&original, 200);
    let key = format!("linked-sub-{}", fixture.display());
    remember_source_offer(
        key.clone(),
        SourceOffer::of_file(
            fs::canonicalize(&original).unwrap(),
            "meetings/weekly.pdf".into(),
        )
        .unwrap(),
    );
    let results = import_sources(
        &vault,
        vec![key],
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert_eq!(
        results[0].reason.as_deref(),
        Some("import-destination-not-a-folder")
    );
    assert!(!outside.join("weekly.pdf").exists());
    fs::remove_dir_all(fixture).unwrap();
}

/// The page can send any string; one Rust never offered is refused and never opened.
#[test]
fn a_home_ssh_key_the_page_sends_fails_source_not_offered() {
    let (fixture, vault) = fresh_fixture("ssh-key");
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
fn found_files_keep_their_folders_and_vault_folders_are_never_walked() {
    let (fixture, vault) = fresh_fixture("keep-folders");
    let vault_path = PathBuf::from(&vault);
    for name in [
        "meetings/weekly.md",
        "contracts/weekly.md",
        "contracts/sub/weekly.md",
        "sources/old.pdf",
        "wiki/page.md",
        "README.md",
    ] {
        plant(&vault_path.join(name), 200);
    }
    let _scope = crate::vault::grants::EnforcedScope::granting(std::slice::from_ref(&vault_path));
    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: vault.clone(),
        label: "vault".into(),
        skip_relative: Vec::new(),
        open_folder: true,
    }])
    .unwrap();
    let mut found: Vec<String> = report
        .candidates
        .iter()
        .map(|c| c.relative_path.clone())
        .collect();
    found.sort();
    assert_eq!(
        found,
        vec![
            "contracts/sub/weekly.md",
            "contracts/weekly.md",
            "meetings/weekly.md"
        ]
    );
    let keys = report
        .candidates
        .iter()
        .map(|c| format!("{}/{}", c.root_path, c.relative_path))
        .collect();
    let results = import_sources(
        &vault,
        keys,
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert!(
        results.iter().all(|row| row.status == "added"),
        "{results:?}"
    );
    for landed in [
        "sources/meetings/weekly.md",
        "sources/contracts/weekly.md",
        "sources/contracts/sub/weekly.md",
    ] {
        assert!(vault_path.join(landed).is_file(), "{landed}");
    }
    fs::remove_dir_all(fixture).unwrap();
}

/// A bound code root's Markdown is developer documentation, never a suggestion.
#[test]
fn markdown_is_offered_only_from_the_open_folder() {
    let (fixture, vault) = fresh_fixture("markdown-roots");
    let project = fixture.join("project");
    plant(&project.join("docs/design.md"), 300);
    plant(&project.join("docs/design.pdf"), 300);
    let project = fs::canonicalize(&project).unwrap();
    let _scope =
        crate::vault::grants::EnforcedScope::granting(&[PathBuf::from(&vault), project.clone()]);
    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: project.to_string_lossy().into_owned(),
        label: "project".into(),
        skip_relative: Vec::new(),
        open_folder: false,
    }])
    .unwrap();
    let found: Vec<&str> = report
        .candidates
        .iter()
        .map(|c| c.relative_path.as_str())
        .collect();
    assert_eq!(found, vec!["docs/design.pdf"]);
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn stop_ends_an_import_between_files_and_keeps_what_landed() {
    let (fixture, vault) = fresh_fixture("stop");
    let mut keys = Vec::new();
    for index in 0..5 {
        let file = fixture.join(format!("note-{index}.txt"));
        plant(&file, 100 + index);
        keys.push(vend(&file));
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

#[test]
fn stop_reaches_only_a_running_import() {
    assert!(!stop_source_import("never-started".into()));
}

fn import_offered(vault: &str, keys: Vec<String>) -> Vec<SourceImportResult> {
    import_sources(
        vault,
        keys,
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap()
}

#[cfg(unix)]
fn files_under(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).into_iter().flatten().flatten() {
            let path = entry.path();
            if entry.file_type().unwrap().is_dir() {
                stack.push(path);
            } else {
                found.push(path);
            }
        }
    }
    found
}

/// A `git pull` may turn an offered file into a link to a key between the offer and the copy.
#[cfg(unix)]
#[test]
fn an_offered_file_swapped_for_a_link_to_a_secret_copies_nothing() {
    let _turn = drop_turn();
    let (fixture, vault) = fresh_fixture("swap-link");
    let secret = fixture.join("home/.ssh/id_ed25519");
    plant(&secret, 400);
    let dropped = fixture.join("docs");
    let spec = dropped.join("spec.pdf");
    plant(&spec, 400);
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&dropped));
    assert_eq!(offer.files.len(), 1);

    fs::remove_file(&spec).unwrap();
    std::os::unix::fs::symlink(&secret, &spec).unwrap();
    let results = import_offered(&vault, vec![offer.files[0].path.clone()]);
    assert_eq!(
        results[0].reason.as_deref(),
        Some("source-changed-since-offered")
    );
    let secret_bytes = fs::read(&secret).unwrap();
    for landed in files_under(&PathBuf::from(&vault)) {
        assert_ne!(fs::read(&landed).unwrap(), secret_bytes, "{landed:?}");
    }
    fs::remove_dir_all(fixture).unwrap();
}

/// A parent folder swapped for a link reaches another file, whose identity differs.
#[cfg(unix)]
#[test]
fn an_offered_files_folder_swapped_for_a_link_copies_nothing() {
    let _turn = drop_turn();
    let (fixture, vault) = fresh_fixture("swap-parent");
    let planted = fixture.join("home/.ssh/spec.pdf");
    plant(&planted, 400);
    let dropped = fixture.join("docs");
    plant(&dropped.join("inner/spec.pdf"), 400);
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&dropped));
    assert_eq!(offer.files.len(), 1);

    fs::remove_dir_all(dropped.join("inner")).unwrap();
    std::os::unix::fs::symlink(planted.parent().unwrap(), dropped.join("inner")).unwrap();
    let results = import_offered(&vault, vec![offer.files[0].path.clone()]);
    assert_eq!(
        results[0].reason.as_deref(),
        Some("source-changed-since-offered")
    );
    assert!(files_under(&PathBuf::from(&vault)).is_empty());
    fs::remove_dir_all(fixture).unwrap();
}

#[cfg(unix)]
fn make_fifo(path: &Path) {
    use std::os::unix::ffi::OsStrExt;
    let name = std::ffi::CString::new(path.as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
}

/// Opening a FIFO for reading waits for a writer forever; neither a drop nor a copy may.
#[cfg(unix)]
#[test]
fn a_fifo_is_never_offered_and_one_swapped_in_never_hangs_the_copy() {
    let _turn = drop_turn();
    let (fixture, vault) = fresh_fixture("fifo");
    let pipe = fixture.join("pipe.pdf");
    make_fifo(&pipe);
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&pipe));
    assert!(offer.files.is_empty());
    assert_eq!(offer.skipped_counts.not_document, 1);

    let spec = fixture.join("spec.pdf");
    plant(&spec, 400);
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&spec));
    fs::remove_file(&spec).unwrap();
    make_fifo(&spec);
    let results = import_offered(&vault, vec![offer.files[0].path.clone()]);
    assert_eq!(
        results[0].reason.as_deref(),
        Some("source-changed-since-offered")
    );
    fs::remove_dir_all(fixture).unwrap();
}

/// `sources/` is read by agents and may be pushed, so even a deliberate drop of a key is held back.
#[test]
fn a_single_dropped_file_named_like_a_secret_is_skipped() {
    let _turn = drop_turn();
    let (fixture, _vault) = fresh_fixture("drop-secret");
    let key = fixture.join("id_rsa");
    plant(&key, 400);
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&key));
    assert!(offer.files.is_empty());
    assert_eq!(offer.skipped[0].reason, SkipReason::SecretName);
    assert_eq!(offer.skipped_counts.secret_name, 1);
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn a_dropped_folder_that_is_or_holds_the_open_folder_is_refused_whole() {
    let _turn = drop_turn();
    let (fixture, vault) = fresh_fixture("drop-vault");
    let vault_path = PathBuf::from(&vault);
    plant(&vault_path.join("notes/plan.pdf"), 400);
    plant(&fixture.join("elsewhere/plan.pdf"), 400);
    let _scope = crate::vault::grants::EnforcedScope::granting(std::slice::from_ref(&vault_path));
    for dropped in [fixture.clone(), vault_path.clone()] {
        let offer = dropped::offer_dropped_paths(std::slice::from_ref(&dropped));
        assert!(offer.files.is_empty(), "{dropped:?}");
        assert_eq!(offer.holds_open_folder.len(), 1, "{dropped:?}");
    }
    let inside = dropped::offer_dropped_paths(&[vault_path.join("notes")]);
    assert_eq!(inside.files.len(), 1);
    let beside = dropped::offer_dropped_paths(&[fixture.join("elsewhere")]);
    assert_eq!(beside.files.len(), 1);
    assert!(beside.holds_open_folder.is_empty());
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn a_dropped_folder_names_a_thousand_skipped_files_and_counts_every_one() {
    let _turn = drop_turn();
    let (fixture, _vault) = fresh_fixture("drop-skip-cap");
    let dropped = fixture.join("keys");
    fs::create_dir_all(&dropped).unwrap();
    for index in 0..1_005 {
        fs::write(dropped.join(format!("secret-{index}.txt")), [b'x'; 80]).unwrap();
    }
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&dropped));
    assert_eq!(offer.skipped.len(), 1_000);
    assert_eq!(offer.skipped_counts.secret_name, 1_005);
    fs::remove_dir_all(fixture).unwrap();
}

/// A slow walk of an earlier drop must not replace, or reach the page after, a newer one.
#[test]
fn only_the_newest_drop_remembers_its_offers() {
    let _turn = drop_turn();
    let (fixture, vault) = fresh_fixture("drop-race");
    let older = fixture.join("older.pdf");
    let newer = fixture.join("newer.pdf");
    plant(&older, 200);
    plant(&newer, 200);
    dropped::arm_source_drop(true);
    let first = dropped::begin_armed_drop().unwrap();
    let second = dropped::begin_armed_drop().unwrap();
    dropped::arm_source_drop(false);
    let published = dropped::offer_drop(second, std::slice::from_ref(&newer), |offer| offer);
    assert!(published.is_some());
    assert!(dropped::offer_drop(first, std::slice::from_ref(&older), |offer| offer).is_none());
    let results = import_offered(&vault, vec![older.to_string_lossy().into_owned()]);
    assert_eq!(results[0].reason.as_deref(), Some("source-not-offered"));
    let results = import_offered(&vault, vec![newer.to_string_lossy().into_owned()]);
    assert_eq!(results[0].status, "added");
    fs::remove_dir_all(fixture).unwrap();
}

/// A reload never runs the stage's cleanup, so loading a page disarms the drop.
#[test]
fn a_drop_after_the_page_reloads_walks_nothing() {
    let _turn = drop_turn();
    dropped::arm_source_drop(true);
    dropped::disarm_source_drop();
    assert_eq!(dropped::begin_armed_drop(), None);
}

/// On a case-insensitive disk `Meetings/weekly.md` is `meetings/weekly.md`; it must not be replaced.
#[test]
fn a_copy_never_replaces_a_source_in_a_folder_named_in_another_case() {
    let _turn = drop_turn();
    let (fixture, vault) = fresh_fixture("case-folder");
    let vault_path = PathBuf::from(&vault);
    let existing = vault_path.join("sources/meetings/weekly.md");
    plant(&existing, 300);
    let before = fs::read(&existing).unwrap();
    let dropped = fixture.join("Meetings");
    fs::create_dir_all(&dropped).unwrap();
    fs::write(dropped.join("weekly.md"), [b'n'; 300]).unwrap();
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&dropped));
    let results = import_offered(&vault, vec![offer.files[0].path.clone()]);
    assert_eq!(results[0].status, "renamed", "{results:?}");
    assert_eq!(
        results[0].relative_path.as_deref(),
        Some("sources/meetings/weekly (2).md")
    );
    assert_eq!(fs::read(&existing).unwrap(), before);
    let folders: Vec<String> = fs::read_dir(vault_path.join("sources"))
        .unwrap()
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(folders, vec!["meetings"]);
    fs::remove_dir_all(fixture).unwrap();
}

/// Publishing links under a free name; a name taken after the check is passed over, never replaced.
#[cfg(unix)]
#[test]
fn publishing_passes_over_a_name_taken_since_the_check_and_a_failed_fill_leaves_it_alone() {
    use std::io::Write;
    let (fixture, _vault) = fresh_fixture("no-replace");
    let folder = fixture.join("folder");
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("a.md"), b"kept").unwrap();
    let parent = fs::File::open(&folder).unwrap();
    let names = ["a.md", "a (2).md"].map(|name| std::ffi::CString::new(name).unwrap());

    let published = crate::confined_files::create_first_free_entry_with(
        &parent,
        names.clone(),
        0o666,
        |file| file.write_all(b"new"),
    )
    .unwrap();
    assert_eq!(published.unwrap().1.to_str().unwrap(), "a (2).md");
    assert_eq!(fs::read(folder.join("a.md")).unwrap(), b"kept");

    let refused =
        crate::confined_files::create_first_free_entry_with(&parent, names, 0o666, |_| {
            Err::<(), _>(std::io::Error::other("disk full"))
        });
    assert!(refused.is_err());
    assert_eq!(fs::read(folder.join("a.md")).unwrap(), b"kept");
    let mut left: Vec<String> = fs::read_dir(&folder)
        .unwrap()
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    left.sort();
    assert_eq!(left, vec!["a (2).md", "a.md"]);
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn a_second_copy_into_the_same_folder_waits_for_the_first() {
    let (fixture, vault) = fresh_fixture("one-copy");
    let first = ImportingFolder::claim(PathBuf::from(&vault)).unwrap();
    assert!(ImportingFolder::claim(PathBuf::from(&vault)).is_none());
    drop(first);
    assert!(ImportingFolder::claim(PathBuf::from(&vault)).is_some());
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn the_open_folders_own_folders_are_skipped_in_any_letter_case() {
    let (fixture, vault) = fresh_fixture("owned-case");
    let vault_path = PathBuf::from(&vault);
    for name in ["Sources/old.pdf", "WIKI/page.pdf", "notes/plan.pdf"] {
        plant(&vault_path.join(name), 200);
    }
    let _scope = crate::vault::grants::EnforcedScope::granting(std::slice::from_ref(&vault_path));
    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: vault.clone(),
        label: "vault".into(),
        skip_relative: Vec::new(),
        open_folder: true,
    }])
    .unwrap();
    let found: Vec<&str> = report
        .candidates
        .iter()
        .map(|c| c.relative_path.as_str())
        .collect();
    assert_eq!(found, vec!["notes/plan.pdf"]);
    fs::remove_dir_all(fixture).unwrap();
}
