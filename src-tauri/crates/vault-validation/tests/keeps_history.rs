//! The history the validation keeps between calls follows the repository: kept while no commit
//! lands, read again as soon as one does.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests start git and plant the files a repository holds"
)]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

use hardened_git::{RepoPath, Repository};
use source_scan::{Dating, WantedPath, DATING_WINDOW_COMMITS};
use vault_validation::KeptHistory;

const NULL_DEVICE: &str = if cfg!(windows) { "NUL" } else { "/dev/null" };

fn git(folder: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args([
            "-c",
            "user.name=test",
            "-c",
            "user.email=test@example.invalid",
            "-c",
            "commit.gpgsign=false",
        ])
        .args(args)
        .current_dir(folder)
        .env("GIT_CONFIG_GLOBAL", NULL_DEVICE)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn commit(folder: &Path, name: &str, text: &str, at: &str) -> String {
    std::fs::write(folder.join(name), text).expect("write");
    git(folder, &["add", "-A"]);
    let date = format!("{at}T09:00:00+00:00");
    let output = Command::new("git")
        .args([
            "-c",
            "user.name=test",
            "-c",
            "user.email=test@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-q",
            "-m",
            "change",
        ])
        .current_dir(folder)
        .env("GIT_CONFIG_GLOBAL", NULL_DEVICE)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_AUTHOR_DATE", &date)
        .env("GIT_COMMITTER_DATE", &date)
        .output()
        .expect("git runs");
    assert!(output.status.success());
    git(folder, &["rev-parse", "HEAD"])
}

fn repository() -> (tempfile::TempDir, PathBuf) {
    let scratch = tempfile::tempdir().expect("scratch");
    let folder = scratch.path().join("repo");
    std::fs::create_dir_all(folder.join("domains")).expect("folder");
    git(&folder, &["init", "-q", "-b", "main"]);
    (scratch, folder)
}

fn wanted(path: &str) -> Vec<WantedPath> {
    vec![WantedPath {
        key: path.to_string(),
        resolved: RepoPath::new(path).expect("a path"),
        dating: Dating::NewestCommit,
    }]
}

#[test]
fn what_the_history_said_is_kept_until_a_commit_lands_and_then_read_again() {
    let (_scratch, folder) = repository();
    let first = commit(&folder, "a.ts", "export const a = 1;\n", "2026-01-10");
    let repository = Repository::at(&folder);
    let kept = KeptHistory::default();

    let dated = |kept: &KeptHistory| {
        kept.dating(&repository, &wanted("a.ts"), DATING_WINDOW_COMMITS)
            .expect("dated")
    };
    let before = dated(&kept);
    assert_eq!(
        before[0].as_ref().expect("a commit touched it").commit.as_str(),
        first
    );
    assert!(
        Arc::ptr_eq(&before, &dated(&kept)),
        "asked again with no commit, the kept answer is handed back"
    );

    let second = commit(&folder, "a.ts", "export const a = 2;\n", "2026-02-10");
    let after = dated(&kept);
    assert!(!Arc::ptr_eq(&before, &after), "the new commit is read");
    assert_eq!(
        after[0].as_ref().expect("a commit touched it").commit.as_str(),
        second
    );
}

#[test]
fn the_revisions_of_a_node_are_kept_until_a_commit_lands_and_then_read_again() {
    let (_scratch, folder) = repository();
    let node = "domains/billing.md";
    commit(
        &folder,
        node,
        "---\nkind: domain\ncapabilities: [a]\n---\nBody\n",
        "2026-01-10",
    );
    let repository = Repository::at(&folder);
    let kept = KeptHistory::default();
    let revisions =
        |kept: &KeptHistory| kept.node_revisions(&repository, &RepoPath::root(), &["domains/billing"]);
    let first = revisions(&kept);
    assert_eq!(first.by_slug["domains/billing"].len(), 1);
    assert!(Arc::ptr_eq(&first, &revisions(&kept)));

    commit(
        &folder,
        node,
        "---\nkind: domain\ncapabilities: [a, b]\n---\nBody\n",
        "2026-02-10",
    );
    let second = revisions(&kept);
    assert!(!Arc::ptr_eq(&first, &second), "the new commit is read");
    assert_eq!(second.by_slug["domains/billing"].len(), 2);
}

#[test]
fn an_answer_with_a_node_git_could_not_be_asked_about_is_never_kept() {
    let (_scratch, folder) = repository();
    let head = commit(
        &folder,
        "domains/billing.md",
        "---\nkind: domain\ncapabilities: [a]\n---\nBody\n",
        "2026-01-10",
    );
    let repository = Repository::at(&folder);
    let kept = KeptHistory::default();
    let revisions =
        |kept: &KeptHistory| kept.node_revisions(&repository, &RepoPath::root(), &["domains/billing"]);
    assert!(revisions(&kept).is_complete());

    // The history still names a commit, but its object is gone: `git log` fails where the cheap
    // state check does not.
    let (folder_of_object, name) = head.split_at(2);
    let object = folder.join(".git/objects").join(folder_of_object).join(name);
    std::fs::remove_file(&object).expect("the commit object is loose");
    let fresh = KeptHistory::default();
    let broken = revisions(&fresh);
    assert!(!broken.is_complete(), "the node was not read");
    assert!(
        !Arc::ptr_eq(&broken, &revisions(&fresh)),
        "an answer with a gap is read again, not kept"
    );
}
