use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::read_merged_count;

const DAY_S: i64 = 86_400;

fn git_at(cwd: &Path, args: &[&str], date: Option<i64>) -> String {
    let mut command = Command::new("git");
    command.args(args).current_dir(cwd);
    if let Some(date) = date {
        let stamp = format!("@{date} +0000");
        command
            .env("GIT_AUTHOR_DATE", &stamp)
            .env("GIT_COMMITTER_DATE", &stamp);
    }
    let out = command.output().unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn git(cwd: &Path, args: &[&str]) -> String {
    git_at(cwd, args, None)
}

fn commit(cwd: &Path, file: &str, message: &str, date: Option<i64>) {
    fs::write(cwd.join(file), message).unwrap();
    git(cwd, &["add", file]);
    git_at(cwd, &["commit", "-qm", message], date);
}

struct Fixture {
    dir: PathBuf,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

fn repository(name: &str) -> Fixture {
    let dir = std::env::temp_dir().join(format!("atlas-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let fixture = Fixture {
        dir: fs::canonicalize(&dir).unwrap(),
    };
    let repo = &fixture.dir;
    git(repo, &["init", "-q", "-b", "main"]);
    git(repo, &["config", "user.email", "test@example.invalid"]);
    git(repo, &["config", "user.name", "atlas test"]);
    git(repo, &["config", "commit.gpgsign", "false"]);
    fixture
}

fn now_s() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

#[test]
fn a_merge_and_a_squash_since_the_moment_count_one_each_and_older_work_is_left_out() {
    let fixture = repository("merged-count");
    let repo = &fixture.dir;
    commit(repo, "base.md", "chore: start", Some(now_s() - 2 * DAY_S));
    git(repo, &["switch", "-q", "-c", "feat/lines"]);
    commit(repo, "a.md", "feat: first line", None);
    commit(repo, "b.md", "feat: second line", None);
    git(repo, &["switch", "-q", "main"]);
    git(
        repo,
        &[
            "merge",
            "-q",
            "--no-ff",
            "-m",
            "feat: lines (#1)",
            "feat/lines",
        ],
    );
    commit(repo, "c.md", "fix: squashed (#2)", None);

    assert_eq!(read_merged_count(repo, "main", now_s() - DAY_S), Some(2));
    assert_eq!(
        read_merged_count(repo, "main", now_s() - 3 * DAY_S),
        Some(3)
    );
    assert_eq!(read_merged_count(repo, "main", 0), Some(3));
    assert_eq!(read_merged_count(repo, "main", now_s() + DAY_S), Some(0));
}

#[test]
fn a_revision_or_option_in_place_of_a_branch_name_reads_nothing() {
    let fixture = repository("merged-count-names");
    let repo = &fixture.dir;
    commit(repo, "base.md", "chore: start", None);
    for name in [
        "--output=/tmp/x",
        "main..evil",
        "main^",
        "main~1",
        "main@{0}",
        "feat/lines...main",
        "main:base.md",
        "",
    ] {
        assert!(
            read_merged_count(repo, name, now_s() - DAY_S).is_none(),
            "{name}"
        );
    }
    assert!(read_merged_count(repo, "main", -1).is_none());
    // A plain folder inside the repository is not the repository: nothing is read upward.
    fs::create_dir_all(repo.join("notes")).unwrap();
    assert!(read_merged_count(&repo.join("notes"), "main", now_s() - DAY_S).is_none());
}

/// Pull requests merge on the remote and the local base is often left behind; a fetched
/// `origin/main` that contains it is the line counted, and a local base with unpushed commits
/// stays the base.
#[test]
fn the_fetched_remote_base_wins_unless_the_local_base_is_ahead() {
    let fixture = repository("merged-count-remote");
    let repo = &fixture.dir;
    commit(repo, "base.md", "chore: start", None);
    let behind = git(repo, &["rev-parse", "HEAD"]);
    commit(repo, "a.md", "fix: merged on the remote (#1)", None);
    let remote = git(repo, &["rev-parse", "HEAD"]);
    git(repo, &["update-ref", "refs/remotes/origin/main", &remote]);
    git(repo, &["update-ref", "refs/heads/main", &behind]);
    assert_eq!(read_merged_count(repo, "main", now_s() - DAY_S), Some(2));

    git(repo, &["update-ref", "refs/heads/main", &remote]);
    commit(repo, "b.md", "fix: not pushed yet", None);
    assert_eq!(
        read_merged_count(repo, "main", now_s() - 3 * DAY_S),
        Some(3)
    );
    assert_eq!(read_merged_count(repo, "main", 0), Some(3));
}
