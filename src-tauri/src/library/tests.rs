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

    let (hash, length) =
        copy_source_into(&root_path, "sources/plan.pdf", &mut &b"%PDF-1.7\n"[..]).unwrap();
    assert_eq!(
        fs::read(root.join("sources/plan.pdf")).unwrap(),
        b"%PDF-1.7\n".to_vec()
    );
    assert_eq!(length, 9);
    assert_eq!(hash, hash_path(&root.join("sources/plan.pdf")).unwrap());

    assert!(copy_source_into(&root_path, "../escaped.pdf", &mut &b"x"[..]).is_err());

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
    fs::write(project.join("plan.pdf"), b"%PDF-1.7 plan\n").unwrap();
    let root_path = format!("{}/", project.to_string_lossy());
    let vault = fs::canonicalize(&vault).unwrap();
    let project = fs::canonicalize(&project).unwrap();

    let _scope = crate::vault_grants::EnforcedScope::granting(&[vault.clone(), project.clone()]);

    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: root_path.clone(),
        label: "project".into(),
        skip_relative: Vec::new(),
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

    let _scope = crate::vault_grants::EnforcedScope::granting(&[bundle.clone()]);

    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: bundle.to_string_lossy().to_string(),
        label: "bundle".into(),
        skip_relative: Vec::new(),
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
fn naming_the_sources_destination_answers_exactly_as_naming_none() {
    let mut answers = Vec::new();
    for destination in [None, Some(ImportDestination::Sources)] {
        let (fixture, vault) = fresh_fixture("default-destination");
        fs::create_dir_all(fixture.join("vault/sources")).unwrap();
        fs::write(fixture.join("vault/sources/plan.pdf"), b"older").unwrap();
        fs::write(fixture.join("vault/sources/kept.pdf"), b"kept").unwrap();
        fs::write(fixture.join("plan.pdf"), b"newer").unwrap();
        fs::write(fixture.join("kept.pdf"), b"kept").unwrap();
        let picked = vec![
            vend(&fixture.join("plan.pdf")),
            vend(&fixture.join("kept.pdf")),
        ];
        let results = import_source_files(vault, picked, destination).unwrap();
        assert!(!fixture.join("vault/planning").exists());
        assert_eq!(
            fs::read(fixture.join("vault/sources/plan (2).pdf")).unwrap(),
            b"newer"
        );
        answers.push(outcome_rows(&results));
        fs::remove_dir_all(fixture).unwrap();
    }
    assert_eq!(
        answers[0],
        vec![
            (
                "plan.pdf".to_string(),
                "renamed".to_string(),
                Some("sources/plan (2).pdf".to_string())
            ),
            (
                "kept.pdf".to_string(),
                "duplicate".to_string(),
                Some("sources/kept.pdf".to_string())
            ),
        ]
    );
    assert_eq!(answers[0], answers[1]);
}

#[test]
fn the_planning_destination_lands_flat_in_planning_and_never_overwrites() {
    let (fixture, vault) = fresh_fixture("planning-destination");
    fs::create_dir_all(fixture.join("vault/planning/research")).unwrap();
    fs::write(fixture.join("vault/planning/Brief.md"), b"# Theirs\n").unwrap();
    fs::write(fixture.join("vault/planning/research/old.png"), b"PNG-old").unwrap();
    fs::create_dir_all(fixture.join("picked")).unwrap();
    fs::write(fixture.join("picked/brief.md"), b"# Mine\n").unwrap();
    fs::write(fixture.join("picked/.screen.png"), b"PNG-new").unwrap();
    fs::write(fixture.join("picked/again.png"), b"PNG-old").unwrap();

    let picked = vec![
        vend(&fixture.join("picked/brief.md")),
        vend(&fixture.join("picked/.screen.png")),
        vend(&fixture.join("picked/again.png")),
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
        fs::read(fixture.join("vault/planning/Brief.md")).unwrap(),
        b"# Theirs\n"
    );
    assert_eq!(
        fs::read(fixture.join("vault/planning/brief (2).md")).unwrap(),
        b"# Mine\n"
    );
    assert_eq!(
        fs::read(fixture.join("vault/planning/screen.png")).unwrap(),
        b"PNG-new"
    );
    assert!(!fixture.join("vault/sources").exists());
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
        fs::read_dir(fixture.join("vault/planning"))
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
    std::os::unix::fs::symlink(&outside, fixture.join("vault/planning")).unwrap();
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
    fs::remove_dir_all(fixture).unwrap();
}

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
