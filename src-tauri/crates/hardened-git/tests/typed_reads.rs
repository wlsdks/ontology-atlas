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
    clear_filter_cache, BlobAt, ChangeKind, CommitId, HeadState, RepoPath, Repository,
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
    assert_eq!(reader.operation_in_progress().expect("operation"), None);
    let facts = reader.facts().expect("facts").expect("inside a repository");
    assert_eq!(
        facts.top_level,
        dunce::canonicalize(&repo).expect("real"),
        "the top is a real path"
    );
    assert!(!facts.shallow);

    let tree = reader.working_tree(&[]).expect("working tree");
    assert_eq!(
        tree.head,
        HeadState::Branch {
            branch: "main".to_string(),
            commit: second.clone()
        },
        "head and branch come from the same run as the rows"
    );
    let mut rows: Vec<(String, ChangeKind, bool, bool)> = tree
        .rows
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
    let scoped = reader.working_tree(&[path("docs")]).expect("scoped status");
    assert_eq!(scoped.rows.len(), 1);

    let history = reader.history(&path("."), 10).expect("log");
    assert_eq!(
        history
            .iter()
            .map(|commit| commit.subject.as_str())
            .collect::<Vec<_>>(),
        ["two: a\u{1f}b", "one"]
    );
    assert_eq!(history[0].hash, second.as_str());
    assert_eq!(
        reader.history(&path("docs"), 10).expect("scoped log").len(),
        1
    );
    assert_eq!(reader.history(&path("."), 1).expect("limited").len(), 1);

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

/// Git for Windows prints the top of a repository as `C:/Users/me/repo` (forward slashes), and
/// `std::fs::canonicalize` answers a verbatim `\\?\` path on Windows (its documentation), which
/// Windows tools and a person comparing paths do not expect. The top must come back as the plain
/// path both sides name, with no prefix and no line ending left on it.
#[cfg(windows)]
#[test]
fn a_windows_top_level_is_a_plain_path_with_no_prefix_or_line_ending() {
    let base = TempDir::new("typed-windows-top");
    let repo = new_repository(&base, "repo");
    let facts = repository(&repo)
        .facts()
        .expect("facts")
        .expect("inside a repository");
    let printed = facts.top_level.to_string_lossy().into_owned();
    assert!(
        !printed.contains('\r') && !printed.starts_with(r"\\?\"),
        "{printed}"
    );
    assert_eq!(
        facts.top_level,
        dunce::canonicalize(&repo).expect("the real path")
    );
}

#[test]
fn a_folder_outside_a_repository_has_no_facts_head_or_working_tree() {
    let base = TempDir::new("typed-none");
    let folder = base.join("plain");
    std::fs::create_dir_all(&folder).expect("folder");
    let reader = repository(&folder);
    assert_eq!(reader.facts().expect("facts"), None);
    assert_eq!(reader.top_level().expect("top"), None);
    assert_eq!(reader.head().expect("head"), None);
    assert!(reader.working_tree(&[]).is_err());
    assert!(reader.history(&path("."), 5).is_err());
}

#[test]
fn a_repository_before_its_first_commit_names_its_branch_and_has_no_commit() {
    let base = TempDir::new("typed-unborn");
    let repo = new_repository(&base, "repo");
    plain_git(&repo, &["checkout", "-q", "-b", "trunk"]);
    std::fs::write(repo.join("draft.md"), "draft\n").expect("draft");
    let reader = repository(&repo);
    assert_eq!(reader.head().expect("head"), None);
    let tree = reader.working_tree(&[]).expect("working tree");
    assert_eq!(
        tree.head,
        HeadState::Unborn {
            branch: "trunk".to_string()
        }
    );
    assert_eq!(tree.rows.len(), 1);
    assert!(
        reader.history(&path("."), 5).is_err(),
        "no commit is an error the caller turns into an empty list, not a silent empty history"
    );
    assert!(reader.touch_history(&[path("draft.md")], 5).is_err());
    assert!(reader.facts().expect("facts").is_some());
}

#[test]
fn a_rename_is_two_rows_and_odd_names_are_read_whole() {
    let base = TempDir::new("typed-odd");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    std::fs::write(repo.join("old name.md"), "body of the old file\n").expect("old");
    std::fs::write(repo.join("한글 파일.md"), "korean\n").expect("korean");
    plain_git(&repo, &["add", "-A"]);
    plain_git(&repo, &["commit", "-qm", "seed"]);
    plain_git(&repo, &["mv", "old name.md", "new name.md"]);
    // The person's own `status.renames` setting must not decide what the answer holds.
    plain_git(&repo, &["config", "status.renames", "copies"]);
    std::fs::write(repo.join("tab\tname.md"), "x\n").expect("tab");
    let reader = repository(&repo);
    let mut rows: Vec<(String, ChangeKind)> = reader
        .working_tree(&[])
        .expect("working tree")
        .rows
        .into_iter()
        .map(|row| (row.path, row.kind))
        .collect();
    rows.sort_by(|left, right| left.0.cmp(&right.0));
    assert_eq!(
        rows,
        [
            ("new name.md".to_string(), ChangeKind::Added),
            ("old name.md".to_string(), ChangeKind::Deleted),
            ("tab\tname.md".to_string(), ChangeKind::Untracked),
        ]
    );
    let touches = reader
        .touch_history(&[path("한글 파일.md")], 5)
        .expect("touch history");
    assert_eq!(
        touches
            .first()
            .and_then(|commit| commit.touches.first())
            .map(|touch| touch.path.as_str()),
        Some("한글 파일.md"),
        "a non-ASCII name is matched as written, with no C-style quoting to undo"
    );
}

#[test]
fn a_status_read_leaves_the_index_alone_so_it_cannot_make_the_persons_commit_fail() {
    let base = TempDir::new("typed-index");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    std::fs::write(repo.join("a.md"), "a\n").expect("a");
    plain_git(&repo, &["add", "-A"]);
    plain_git(&repo, &["commit", "-qm", "seed"]);
    let index = repo.join(".git/index");
    let mut generation = 0u64;
    let mut stale_stat = || {
        generation += 1_000_000;
        let file = std::fs::File::options()
            .write(true)
            .open(repo.join("a.md"))
            .expect("open");
        file.set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(generation))
            .expect("same bytes, another time");
    };

    stale_stat();
    let before = std::fs::read(&index).expect("index");
    plain_git(&repo, &["status", "--porcelain"]);
    assert_ne!(
        std::fs::read(&index).expect("index"),
        before,
        "fixture precondition: a plain status refreshes and rewrites the index"
    );

    stale_stat();
    let before = std::fs::read(&index).expect("index");
    repository(&repo).working_tree(&[]).expect("status");
    assert_eq!(std::fs::read(&index).expect("index"), before);
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
    let globbed = reader.working_tree(&[path("*.md")]).expect("status");
    assert_eq!(globbed.rows, vec![]);
    let magic = reader.working_tree(&[path(":(top)a.md")]).expect("status");
    assert_eq!(magic.rows, vec![]);
    assert_eq!(
        reader
            .working_tree(&[path("a.md")])
            .expect("status")
            .rows
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
        reader.facts().expect("facts");
        reader.head().expect("head");
        reader.operation_in_progress().expect("operation");
        reader.working_tree(&[]).expect("status");
        reader.working_tree(&[path("docs")]).expect("status");
        reader.history(&path("."), 5).expect("log");
        reader
            .touch_history(&[path("note.md")], 5)
            .expect("touch history");
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
