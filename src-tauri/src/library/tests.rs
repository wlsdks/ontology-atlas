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
    let first = import_source_files(root_path.clone(), vec![vended.clone()]).unwrap();
    assert_eq!(first[0].status, "added");
    assert_eq!(first[0].size, Some(body.len() as u64));
    assert_eq!(fs::read(root.join("sources/scan.pdf")).unwrap(), body);
    assert_eq!(
        first[0].sha256,
        hash_path(&root.join("sources/scan.pdf")).ok()
    );

    let vended = vend(&picked);
    let second = import_source_files(root_path, vec![vended]).unwrap();
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

    let replay = import_source_files(root_path, vec![offered]).unwrap();
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
    let results = import_source_files(root_path, vec![offered.clone(), offered]).unwrap();
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
    let results = import_source_files(root_path, vec![offered]).unwrap();
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
        import_source_files(vault.to_string_lossy().to_string(), vec![page_string]).unwrap();
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
            import_source_files(vault.to_string_lossy().into_owned(), vec![offered]).unwrap();
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
