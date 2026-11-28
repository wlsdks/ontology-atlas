//! The history the validation keeps between calls follows the repository: kept while no commit
//! lands, read again as soon as one does.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests start git and plant the files a repository holds"
)]

use std::path::{Path, PathBuf};
use std::process::Command;

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
            .remove(0)
            .expect("a commit touched it")
    };
    assert_eq!(dated(&kept).commit.as_str(), first);
    assert_eq!(
        dated(&kept).commit.as_str(),
        first,
        "asked again with no commit"
    );

    let second = commit(&folder, "a.ts", "export const a = 2;\n", "2026-02-10");
    assert_eq!(
        dated(&kept).commit.as_str(),
        second,
        "the new commit is seen"
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
    let revisions = |kept: &KeptHistory| {
        kept.node_revisions(&repository, &RepoPath::root(), &["domains/billing"])
            .get("domains/billing")
            .map_or(0, Vec::len)
    };
    assert_eq!(revisions(&kept), 1);
    assert_eq!(revisions(&kept), 1);

    commit(
        &folder,
        node,
        "---\nkind: domain\ncapabilities: [a, b]\n---\nBody\n",
        "2026-02-10",
    );
    assert_eq!(revisions(&kept), 2, "the new commit is seen");
}
