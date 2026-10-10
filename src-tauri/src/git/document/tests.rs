use super::*;

#[test]
fn a_document_past_the_ceiling_sends_no_diff_at_all() {
    let short = cap_document_diff("a.md".into(), "+one\n+two\n".into(), false);
    assert!(!short.too_large);
    assert_eq!(short.diff, "+one\n+two\n");

    let long: String = (0..MAX_DOCUMENT_DIFF_LINES + 1)
        .map(|i| format!(" line {i}\n"))
        .collect();
    let capped = cap_document_diff("a.md".into(), long, false);
    assert!(capped.too_large);
    assert_eq!(capped.diff, "");
    assert_eq!(capped.path, "a.md");
}

#[test]
fn restore_path_stays_inside_the_vault() {
    assert_eq!(
        vault_document_path("domains/orders.md", ".").unwrap(),
        "domains/orders.md"
    );
    assert_eq!(
        vault_document_path(" domains/orders.md ", ".").unwrap(),
        "domains/orders.md"
    );
    assert_eq!(
        vault_document_path("docs/ontology/domains/orders.md", "docs/ontology").unwrap(),
        "docs/ontology/domains/orders.md"
    );
    for bad in [
        "",
        "/etc/passwd",
        "../outside.md",
        "a/../b.md",
        "a//b.md",
        "./a.md",
        "a\\b.md",
    ] {
        let err = vault_document_path(bad, ".").unwrap_err();
        assert!(err.starts_with("restore-path-invalid"), "{bad}: {err}");
    }
    for outside in ["README.md", "docs/other/x.md", "docs/ontologyx/a.md"] {
        let err = vault_document_path(outside, "docs/ontology").unwrap_err();
        assert!(err.starts_with("restore-path-invalid"), "{outside}: {err}");
    }
}

#[test]
fn restore_source_is_head_or_a_hash() {
    assert_eq!(validate_restore_source("HEAD").unwrap(), "HEAD");
    assert_eq!(validate_restore_source("A1B2C3D").unwrap(), "a1b2c3d");
    for bad in [
        "",
        "HEAD~1",
        "main",
        "abc",
        "--output=x",
        "a1b2c3d..a1b2c3e",
    ] {
        let err = validate_restore_source(bad).unwrap_err();
        assert!(err.starts_with("restore-source-invalid"), "{bad}: {err}");
    }
}

#[test]
fn identity_guard_names_the_field_that_would_change() {
    let now =
        "---\nuid: 11111111\nslug: domains/orders\nmerged_uids: [22222222]\n---\n# Orders\n";
    let same = "---\nuid: \"11111111\"\nslug: 'domains/orders'\nmerged_uids: [22222222]\n---\nolder body\n";
    assert_eq!(
        identity_difference(&read_identity(now), &read_identity(same)),
        None
    );

    let other_uid = "---\nuid: 99999999\nslug: domains/orders\nmerged_uids: [22222222]\n---\n";
    assert_eq!(
        identity_difference(&read_identity(now), &read_identity(other_uid)).as_deref(),
        Some("uid 11111111 -> 99999999")
    );
    let renamed = "---\nuid: 11111111\nslug: domains/order\nmerged_uids: [22222222]\n---\n";
    assert_eq!(
        identity_difference(&read_identity(now), &read_identity(renamed)).as_deref(),
        Some("slug domains/orders -> domains/order")
    );
    let pre_merge = "---\nuid: 11111111\nslug: domains/orders\n---\n";
    assert_eq!(
        identity_difference(&read_identity(now), &read_identity(pre_merge)).as_deref(),
        Some("merged_uids would be dropped")
    );
    assert_eq!(
        identity_difference(&read_identity("# a"), &read_identity("# b")),
        None
    );
}

#[test]
fn a_document_that_cannot_be_read_stops_the_restore() {
    // A read failing for any reason but absence means the guard never ran.
    let dir = std::env::temp_dir().join(format!("atlas-restore-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let git = |args: &[&str]| {
        let out = std::process::Command::new("git")
            .args(args)
            .current_dir(&dir)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    };
    git(&["init", "-q"]);
    git(&["config", "user.email", "test@example.invalid"]);
    git(&["config", "user.name", "atlas test"]);
    git(&["config", "commit.gpgsign", "false"]);
    // autocrlf would return CRLF and fail a test about identity.
    git(&["config", "core.autocrlf", "false"]);
    let file = dir.join("orders.md");
    let committed = "---\nuid: 11111111\nslug: domains/orders\n---\n# Orders\n";
    fs::write(&file, committed).unwrap();
    git(&["add", "orders.md"]);
    git(&["commit", "-qm", "seed"]);

    // 0xff never appears in valid UTF-8.
    let unreadable = [0xffu8, 0xfe, 0xff];
    fs::write(&file, unreadable).unwrap();
    let vault = dir.to_string_lossy().into_owned();
    let err = git_restore_file(vault.clone(), "orders.md".into(), "HEAD".into()).unwrap_err();
    assert!(err.starts_with("restore-identity-check-failed"), "{err}");
    assert_eq!(
        fs::read(&file).unwrap(),
        unreadable,
        "a refusal must leave the document alone"
    );

    fs::write(
        &file,
        "---\nuid: 11111111\nslug: domains/orders\n---\n# Changed\n",
    )
    .unwrap();
    let done = git_restore_file(vault, "orders.md".into(), "HEAD".into()).unwrap();
    assert!(done.restored);
    assert_eq!(fs::read_to_string(&file).unwrap(), committed);
    let _ = fs::remove_dir_all(&dir);
}
