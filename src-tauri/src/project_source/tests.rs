use super::*;
use std::process::Command;
use std::time::UNIX_EPOCH;

#[test]
fn inspect_project_source_returns_a_deterministic_bounded_folder_inventory() {
    let root = std::env::temp_dir().join(format!(
        "ontology-atlas-project-source-folder-{}",
        std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(root.join("src")).unwrap();
    fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
    fs::write(root.join("README.md"), "hello").unwrap();
    fs::write(root.join("src/index.ts"), "export const value = 1;\n").unwrap();
    fs::write(root.join("node_modules/pkg/index.js"), "ignored").unwrap();

    let first = inspect_project_source(root.to_string_lossy().to_string()).unwrap();
    let second = inspect_project_source(root.to_string_lossy().to_string()).unwrap();

    assert_eq!(first.kind, "folder");
    assert_eq!(
        first.root_path,
        fs::canonicalize(&root).unwrap().to_string_lossy()
    );
    assert!(first.source_id.starts_with("sha256:"));
    assert!(first.fingerprint.starts_with("sha256:"));
    assert_eq!(first.revision, first.fingerprint);
    assert_eq!(first.dirty, None);
    assert!(!first.truncated);
    assert_eq!(first.files, ["README.md", "src/index.ts"]);
    assert_eq!(first.fingerprint, second.fingerprint);
    assert_eq!(first.source_id, second.source_id);

    fs::remove_dir_all(root).ok();
}

#[test]
fn inspect_project_source_promotes_a_selected_subfolder_to_its_git_worktree() {
    let root = std::env::temp_dir().join(format!(
        "ontology-atlas-project-source-git-{}",
        std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(root.join("packages/app")).unwrap();
    fs::write(root.join("README.md"), "repo\n").unwrap();
    fs::write(
        root.join("packages/app/index.ts"),
        "export const value = 1;\n",
    )
    .unwrap();

    for args in [
        vec!["init"],
        vec!["config", "user.email", "atlas@example.invalid"],
        vec!["config", "user.name", "Atlas Test"],
        vec!["add", "."],
        vec!["commit", "-m", "initial"],
    ] {
        let output = Command::new("git")
            .args(args)
            .current_dir(&root)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Command::new("git")
        .args([
            "remote",
            "add",
            "origin",
            "git@example.invalid:private/repo.git",
        ])
        .current_dir(&root)
        .output()
        .unwrap();
    let selected = root.join("packages/app");
    let clean = inspect_project_source(selected.to_string_lossy().to_string()).unwrap();
    assert_eq!(clean.dirty, Some(false));

    fs::write(
        root.join("packages/app/index.ts"),
        "export const value = 2;\n",
    )
    .unwrap();
    fs::write(root.join("packages/app/new.ts"), "export {};\n").unwrap();

    let inspection = inspect_project_source(selected.to_string_lossy().to_string()).unwrap();
    let head = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(&root)
        .output()
        .unwrap();

    assert_eq!(inspection.kind, "git");
    assert_eq!(
        inspection.root_path,
        fs::canonicalize(&root).unwrap().to_string_lossy()
    );
    assert_eq!(
        inspection.revision,
        String::from_utf8_lossy(&head.stdout).trim()
    );
    assert_eq!(inspection.dirty, Some(true));
    assert_ne!(inspection.fingerprint, clean.fingerprint);
    assert_eq!(
        inspection.files,
        ["README.md", "packages/app/index.ts", "packages/app/new.ts"]
    );
    assert!(!inspection
        .files
        .iter()
        .any(|path| path.starts_with(".git/")));
    assert!(!inspection.source_id.contains("example.invalid"));
    assert!(!inspection.fingerprint.contains("example.invalid"));

    fs::remove_dir_all(root).ok();
}

#[test]
fn meaning_transition_continuity_excludes_only_target_and_archive() {
    let root = std::env::temp_dir().join(format!(
        "ontology-atlas-continuity-{}",
        std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let vault = root.join("docs/ontology");
    fs::create_dir_all(vault.join("capabilities")).unwrap();
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(vault.join("capabilities/refund.md"), "before\n").unwrap();
    fs::write(root.join("src/index.ts"), "export const value = 1;\n").unwrap();
    for args in [
        vec!["init"],
        vec!["config", "user.email", "atlas@example.invalid"],
        vec!["config", "user.name", "Atlas Test"],
        vec!["add", "."],
        vec!["commit", "-m", "initial"],
    ] {
        let output = Command::new("git")
            .args(args)
            .current_dir(&root)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let observe = || {
        inspect_project_source_continuity(
            root.to_string_lossy().to_string(),
            vault.to_string_lossy().to_string(),
            "capabilities/refund".into(),
        )
        .unwrap()
    };
    let baseline = observe();
    assert_eq!(baseline.source.dirty, Some(false));
    assert_eq!(
        baseline.exclusions.target.as_deref(),
        Some("docs/ontology/capabilities/refund.md")
    );

    fs::write(
        vault.join("capabilities/refund.md"),
        "after meaning write\n",
    )
    .unwrap();
    fs::create_dir_all(vault.join(".ontology-atlas/meaning-transitions/artifacts")).unwrap();
    fs::write(
        vault.join(".ontology-atlas/meaning-transitions/transition.md"),
        "record\n",
    )
    .unwrap();
    let meaning_only = observe();
    assert_eq!(meaning_only.source.fingerprint, baseline.source.fingerprint);
    assert_eq!(meaning_only.source.dirty, Some(false));

    fs::write(vault.join(".ontology-atlas/project-sources.json"), "{}\n").unwrap();
    let config_drift = observe();
    assert_ne!(config_drift.source.fingerprint, baseline.source.fingerprint);
    assert_eq!(config_drift.source.dirty, Some(true));
    fs::remove_file(vault.join(".ontology-atlas/project-sources.json")).unwrap();

    fs::write(root.join("src/index.ts"), "export const value = 2;\n").unwrap();
    assert_ne!(observe().source.fingerprint, baseline.source.fingerprint);
    fs::remove_dir_all(root).ok();
}

#[cfg(unix)]
#[test]
fn meaning_transition_continuity_rejects_traversal_and_symlink_targets() {
    use std::os::unix::fs::symlink;
    let root = std::env::temp_dir().join(format!(
        "ontology-atlas-continuity-link-{}",
        std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let vault = root.join("vault");
    fs::create_dir_all(vault.join("capabilities")).unwrap();
    fs::write(root.join("outside.md"), "outside\n").unwrap();
    symlink(
        root.join("outside.md"),
        vault.join("capabilities/refund.md"),
    )
    .unwrap();
    let source = root.to_string_lossy().to_string();
    let vault_text = vault.to_string_lossy().to_string();
    assert!(inspect_project_source_continuity(
        source.clone(),
        vault_text.clone(),
        "../outside".into()
    )
    .is_err());
    assert!(
        inspect_project_source_continuity(source, vault_text, "capabilities/refund".into())
            .is_err()
    );
    fs::remove_dir_all(root).ok();
}

#[test]
fn inspect_project_source_uses_git_visible_files_instead_of_ignored_inventory_noise() {
    let root = std::env::temp_dir().join(format!(
        "ontology-atlas-project-source-git-ignore-{}",
        std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(root.join("src")).unwrap();
    fs::create_dir_all(root.join("generated")).unwrap();
    fs::write(root.join(".gitignore"), "generated/\n").unwrap();
    fs::write(root.join("src/index.ts"), "export const value = 1;\n").unwrap();
    for index in 0..=SOURCE_INVENTORY_MAX_FILES {
        fs::write(root.join("generated").join(format!("{index:04}.txt")), "x").unwrap();
    }

    for args in [
        vec!["init"],
        vec!["config", "user.email", "atlas@example.invalid"],
        vec!["config", "user.name", "Atlas Test"],
        vec!["add", "."],
        vec!["commit", "-m", "initial"],
    ] {
        let output = Command::new("git")
            .args(args)
            .current_dir(&root)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let inspection = inspect_project_source(root.to_string_lossy().to_string()).unwrap();

    assert!(!inspection.truncated);
    assert_eq!(inspection.files, [".gitignore", "src/index.ts"]);
    assert!(!inspection
        .files
        .iter()
        .any(|path| path.starts_with("generated/")));

    fs::remove_dir_all(root).ok();
}

#[test]
fn inspect_project_source_is_registered_with_the_tauri_invoke_handler() {
    let source = include_str!("../lib.rs");
    let handler = source
        .split(".invoke_handler(tauri::generate_handler![")
        .nth(1)
        .and_then(|rest| rest.split("])").next())
        .expect("Tauri invoke handler");

    assert!(handler.contains("inspect_project_source"));
}

#[test]
fn inspect_project_source_reports_when_the_file_inventory_is_truncated() {
    let root = std::env::temp_dir().join(format!(
        "ontology-atlas-project-source-limit-{}",
        std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    for index in 0..=SOURCE_INVENTORY_MAX_FILES {
        fs::write(root.join(format!("{index:04}.txt")), "x").unwrap();
    }

    let inspection = inspect_project_source(root.to_string_lossy().to_string()).unwrap();

    assert!(inspection.truncated);
    assert_eq!(inspection.files.len(), SOURCE_INVENTORY_MAX_FILES);
    assert_eq!(
        inspection.files.first().map(String::as_str),
        Some("0000.txt")
    );
    assert_eq!(
        inspection.files.last().map(String::as_str),
        Some(format!("{:04}.txt", SOURCE_INVENTORY_MAX_FILES - 1).as_str())
    );

    fs::remove_dir_all(root).ok();
}
