//! The typed read API against real repositories: it answers what `git` says, takes names only as
//! typed values, and every read runs under the hardening, so a repository whose config would run
//! code on a read runs none through any method.

#![allow(
    dead_code,
    reason = "the support module is shared with the other test file"
)]

mod support;

use std::path::Path;

use hardened_git::{
    clear_filter_cache, BlobAt, ChangeKind, CommitId, RepoPath, Repository, UntrackedFiles,
};
use support::{commit_note, isolated_environment, new_repository, plain_git, TempDir};

fn repository(path: &Path) -> Repository {
    Repository::at(path).with_environment(isolated_environment())
}

fn path(text: &str) -> RepoPath {
    RepoPath::new(text).expect("a valid repository path")
}

fn head_of(repo: &Path) -> CommitId {
    CommitId::new(&plain_git(repo, &["rev-parse", "HEAD"])).expect("a commit id")
}

#[test]
fn every_read_answers_what_git_says_about_a_repository() {
    let base = TempDir::new("typed-answers");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    plain_git(&repo, &["checkout", "-q", "-b", "main"]);
    commit_note(&repo);
    let first = head_of(&repo);
    std::fs::create_dir_all(repo.join("docs")).expect("docs");
    std::fs::write(repo.join("docs/guide.md"), "guide\n").expect("guide");
    std::fs::write(repo.join("note.md"), "# two\n").expect("note");
    plain_git(&repo, &["add", "-A"]);
    plain_git(&repo, &["commit", "-qm", "two: a\u{1f}b"]);
    let second = head_of(&repo);
    std::fs::write(repo.join("note.md"), "# three, uncommitted\n").expect("edit");
    std::fs::write(repo.join("untracked file.md"), "new\n").expect("untracked");
    std::fs::remove_file(repo.join("docs/guide.md")).expect("delete");
    let reader = repository(&repo);

    assert_eq!(reader.head().expect("head"), Some(second.clone()));
    assert_eq!(reader.branch().expect("branch").as_deref(), Some("main"));
    assert!(!reader.is_shallow().expect("shallow"));
    assert_eq!(reader.operation_in_progress().expect("operation"), None);
    let top = reader
        .top_level()
        .expect("top")
        .expect("inside a repository");
    assert_eq!(
        std::fs::canonicalize(&top).expect("real"),
        std::fs::canonicalize(&repo).expect("real")
    );

    let mut rows: Vec<(String, ChangeKind, bool, bool)> = reader
        .status(None, UntrackedFiles::All)
        .expect("status")
        .into_iter()
        .map(|row| (row.path, row.kind, row.staged, row.unstaged))
        .collect();
    rows.sort_by(|left, right| left.0.cmp(&right.0));
    assert_eq!(
        rows,
        [
            (
                "docs/guide.md".to_string(),
                ChangeKind::Deleted,
                false,
                true
            ),
            ("note.md".to_string(), ChangeKind::Modified, false, true),
            (
                "untracked file.md".to_string(),
                ChangeKind::Untracked,
                false,
                true
            ),
        ]
    );
    let scoped = reader
        .status(Some(&path("docs")), UntrackedFiles::All)
        .expect("scoped status");
    assert_eq!(scoped.len(), 1);

    let history = reader.log(&path("."), 10).expect("log");
    assert_eq!(
        history
            .iter()
            .map(|commit| commit.subject.as_str())
            .collect::<Vec<_>>(),
        ["two: a\u{1f}b", "one"]
    );
    assert_eq!(history[0].hash, second.as_str());
    assert_eq!(reader.log(&path("docs"), 10).expect("scoped log").len(), 1);
    assert_eq!(reader.log(&path("."), 1).expect("limited").len(), 1);

    let commits = reader
        .file_commits(&path("note.md"), 5)
        .expect("file commits");
    assert_eq!(
        commits
            .iter()
            .map(|(commit, _)| commit.clone())
            .collect::<Vec<_>>(),
        [second.clone(), first.clone()]
    );
    assert!(
        commits[0].1.contains('T'),
        "an ISO author time: {}",
        commits[0].1
    );

    let old = BlobAt {
        commit: first.clone(),
        path: path("note.md"),
    };
    assert_eq!(
        reader.show_blob(&old).expect("show"),
        Some(b"# one\n".to_vec())
    );
    let absent = BlobAt {
        commit: first.clone(),
        path: path("docs/guide.md"),
    };
    assert_eq!(reader.show_blob(&absent).expect("show"), None);

    let asked = [
        old.clone(),
        absent.clone(),
        BlobAt {
            commit: second.clone(),
            path: path("docs/guide.md"),
        },
    ];
    assert_eq!(
        reader.blobs(&asked).expect("blobs"),
        [Some(b"# one\n".to_vec()), None, Some(b"guide\n".to_vec())]
    );
    assert_eq!(
        reader.blob_sizes(&asked).expect("sizes"),
        [Some(6), None, Some(6)]
    );
    assert_eq!(
        reader.blobs(&[]).expect("none"),
        Vec::<Option<Vec<u8>>>::new()
    );

    let mut changed = reader
        .changed_names_since_head(&path("."))
        .expect("changed");
    changed.sort();
    assert_eq!(changed, ["docs/guide.md", "note.md"]);
    let mut listed = reader.listed_files(&path(".")).expect("listed");
    listed.sort();
    assert_eq!(listed, ["docs/guide.md", "note.md", "untracked file.md"]);
}

#[test]
fn a_folder_outside_a_repository_has_no_top_level_head_or_history() {
    let base = TempDir::new("typed-none");
    let folder = base.join("plain");
    std::fs::create_dir_all(&folder).expect("folder");
    let reader = repository(&folder);
    assert_eq!(reader.top_level().expect("top"), None);
    assert_eq!(reader.head().expect("head"), None);
    assert_eq!(reader.branch().expect("branch"), None);
    assert!(reader.status(None, UntrackedFiles::Normal).is_err());
    assert_eq!(reader.log(&path("."), 5).expect("log"), vec![]);
}

#[test]
fn a_repository_before_its_first_commit_has_no_head_and_an_empty_history() {
    let base = TempDir::new("typed-unborn");
    let repo = new_repository(&base, "repo");
    let reader = repository(&repo);
    assert_eq!(reader.head().expect("head"), None);
    assert_eq!(reader.log(&path("."), 5).expect("log"), vec![]);
    assert!(reader.top_level().expect("top").is_some());
}

#[test]
fn a_file_named_like_an_option_or_a_glob_is_a_name_under_the_typed_reads() {
    let base = TempDir::new("typed-names");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    std::fs::write(repo.join("a.md"), "a\n").expect("a");
    std::fs::write(repo.join("b.md"), "b\n").expect("b");
    plain_git(&repo, &["add", "-A"]);
    plain_git(&repo, &["commit", "-qm", "seed"]);
    std::fs::write(repo.join("a.md"), "a changed\n").expect("edit");
    let reader = repository(&repo);
    // A glob is a name, not a pattern: nothing is called `*.md`.
    let globbed = reader
        .status(Some(&path("*.md")), UntrackedFiles::All)
        .expect("status");
    assert_eq!(globbed, vec![]);
    let magic = reader
        .status(Some(&path(":(top)a.md")), UntrackedFiles::All)
        .expect("status");
    assert_eq!(magic, vec![]);
    assert_eq!(
        reader
            .status(Some(&path("a.md")), UntrackedFiles::All)
            .expect("status")
            .len(),
        1
    );
    // An option-like name is refused as a value, before any process is started.
    assert_eq!(RepoPath::new("--output=planted.txt"), None);
    assert!(!repo.join("planted.txt").exists());
}

#[cfg(unix)]
mod hostile_config {
    use super::*;
    use support::plain_git_lenient;

    /// A repository whose local config makes `git` run a command whenever it asks the file
    /// system monitor, which `status`, `diff` and other index reads do.
    fn weapon(base: &TempDir) -> (std::path::PathBuf, std::path::PathBuf) {
        let repo = new_repository(base, "repo");
        commit_note(&repo);
        std::fs::create_dir_all(repo.join("docs")).expect("docs");
        std::fs::write(repo.join("docs/a.md"), "a\n").expect("a");
        plain_git(&repo, &["add", "-A"]);
        plain_git(&repo, &["commit", "-qm", "two"]);
        let marker = base.join("FSMONITOR_EXECUTED");
        plain_git(
            &repo,
            &[
                "config",
                "core.fsmonitor",
                &format!("touch {}; false", marker.display()),
            ],
        );
        std::fs::write(repo.join("note.md"), "# changed\n").expect("edit");
        (repo, marker)
    }

    #[test]
    fn no_typed_read_runs_a_program_the_repositorys_config_names() {
        let base = TempDir::new("typed-weapon");
        clear_filter_cache();
        let (repo, marker) = weapon(&base);
        plain_git_lenient(&repo, &["status", "--porcelain"]);
        assert!(
            marker.exists(),
            "fixture precondition: unhardened git runs the config"
        );
        std::fs::remove_file(&marker).expect("remove marker");

        let reader = repository(&repo);
        let head = head_of(&repo);
        let blob = BlobAt {
            commit: head.clone(),
            path: path("note.md"),
        };
        reader.top_level().expect("top");
        reader.head().expect("head");
        reader.branch().expect("branch");
        reader.is_shallow().expect("shallow");
        reader.operation_in_progress().expect("operation");
        reader.status(None, UntrackedFiles::All).expect("status");
        reader
            .status(Some(&path("docs")), UntrackedFiles::Normal)
            .expect("status");
        reader.log(&path("."), 5).expect("log");
        reader
            .file_commits(&path("note.md"), 5)
            .expect("file commits");
        reader.show_blob(&blob).expect("show");
        reader.blobs(std::slice::from_ref(&blob)).expect("blobs");
        reader
            .blob_sizes(std::slice::from_ref(&blob))
            .expect("sizes");
        reader
            .changed_names_since_head(&path("."))
            .expect("changed");
        reader.listed_files(&path(".")).expect("listed");
        assert!(
            !marker.exists(),
            "a typed read must never run a program the repository's config names"
        );
    }
}
