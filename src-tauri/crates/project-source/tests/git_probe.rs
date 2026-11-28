//! The probe of a Git folder against a real repository: the fingerprint moves with the index and
//! with the bytes of a changed file only, the vault inside the source does not count, and a tree
//! of tens of thousands of files is listed whole.
#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "a test builds its repository with the standard library and the installed git"
)]

use std::path::Path;
use std::process::Command;

use project_source::{inspect_project_source, SourceKind};

fn git(folder: &Path, arguments: &[&str]) {
    let status = Command::new("git")
        .args(["-c", "user.name=t", "-c", "user.email=t@example.com"])
        .args(arguments)
        .current_dir(folder)
        .env("GIT_CONFIG_GLOBAL", if cfg!(windows) { "NUL" } else { "/dev/null" })
        .env("GIT_CONFIG_SYSTEM", if cfg!(windows) { "NUL" } else { "/dev/null" })
        .status()
        .expect("git runs");
    assert!(status.success(), "git {arguments:?}");
}

fn repository() -> tempfile::TempDir {
    let folder = tempfile::tempdir().expect("folder");
    git(folder.path(), &["init", "-q"]);
    std::fs::create_dir_all(folder.path().join("src")).expect("src");
    std::fs::write(folder.path().join("src/a.go"), "package a\n").expect("file");
    git(folder.path(), &["add", "."]);
    git(folder.path(), &["commit", "-q", "-m", "first"]);
    folder
}

#[test]
fn the_fingerprint_is_stable_until_a_file_changes_and_then_follows_its_bytes() {
    let folder = repository();
    let clean = inspect_project_source(folder.path(), None).expect("probe");
    assert_eq!(clean.kind, SourceKind::Git);
    assert_eq!(clean.dirty, Some(false));
    assert_eq!(
        inspect_project_source(folder.path(), None).expect("again").fingerprint,
        clean.fingerprint
    );

    std::fs::write(folder.path().join("src/a.go"), "package b\n").expect("edit");
    let edited = inspect_project_source(folder.path(), None).expect("probe");
    assert_eq!(edited.dirty, Some(true));
    assert_ne!(edited.fingerprint, clean.fingerprint);

    std::fs::write(folder.path().join("src/a.go"), "package c\n").expect("edit again");
    let other_bytes = inspect_project_source(folder.path(), None).expect("probe");
    assert_ne!(other_bytes.fingerprint, edited.fingerprint, "same size, other bytes");
}

#[test]
fn a_vault_folder_inside_the_source_leaves_the_fingerprint_alone() {
    let folder = repository();
    let vault = folder.path().join("docs/ontology");
    std::fs::create_dir_all(&vault).expect("vault");
    let before = inspect_project_source(folder.path(), Some(&vault)).expect("probe");
    std::fs::write(vault.join("node.md"), "---\nkind: domain\n---\n").expect("note");
    let after = inspect_project_source(folder.path(), Some(&vault)).expect("probe");
    assert_eq!(after.fingerprint, before.fingerprint);
    assert!(!after.files.iter().any(|file| file.starts_with("docs/ontology/")));
}

#[test]
fn a_tree_past_the_old_sixteen_thousand_file_cut_is_listed_whole() {
    let folder = tempfile::tempdir().expect("folder");
    git(folder.path(), &["init", "-q"]);
    let many = folder.path().join("many");
    std::fs::create_dir_all(&many).expect("folder");
    for index in 0..16_500 {
        std::fs::write(many.join(format!("f{index:05}.txt")), "").expect("file");
    }
    git(folder.path(), &["add", "."]);
    let probe = inspect_project_source(folder.path(), None).expect("probe");
    assert!(!probe.truncated);
    assert_eq!(probe.files.len(), 16_500);
}
