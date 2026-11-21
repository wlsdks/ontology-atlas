use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use chrono::{TimeZone, Utc};

use super::lock::{judge_lock, parse_lock_reason, process_start, LockState, LockTool, ProcessStart};
use super::remote::host_and_slug;
use super::{parse_porcelain, read_repository, standing_of, Standing, WorktreeRow};

struct Repo {
    dir: PathBuf,
    main: PathBuf,
}

impl Repo {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("atlas-work-status-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let main = dir.join("main");
        fs::create_dir_all(&main).unwrap();
        let dir = fs::canonicalize(&dir).unwrap();
        let main = dir.join("main");
        let repo = Repo { dir, main };
        repo.git(&repo.main, &["init", "-q", "-b", "main"]);
        repo.git(&repo.main, &["config", "user.email", "test@example.invalid"]);
        repo.git(&repo.main, &["config", "user.name", "atlas test"]);
        repo.git(&repo.main, &["config", "commit.gpgsign", "false"]);
        repo.commit(&repo.main.clone(), "one.md");
        repo
    }

    fn git(&self, cwd: &Path, args: &[&str]) -> String {
        let out = Command::new("git").args(args).current_dir(cwd).output().unwrap();
        assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    fn commit(&self, cwd: &Path, file: &str) {
        fs::write(cwd.join(file), file).unwrap();
        self.git(cwd, &["add", file]);
        self.git(cwd, &["commit", "-qm", file]);
    }

    /// Nested inside the main checkout, as agent worktrees are.
    fn worktree(&self, branch: &str) -> PathBuf {
        let path = self.main.join("worktrees").join(branch.replace('/', "-"));
        let target = path.to_string_lossy().into_owned();
        self.git(&self.main, &["worktree", "add", "-q", "-b", branch, &target]);
        path
    }

    fn lock(&self, path: &Path, reason: &str) {
        let target = path.to_string_lossy().into_owned();
        self.git(&self.main, &["worktree", "lock", "--reason", reason, &target]);
    }

    fn rows(&self) -> Vec<WorktreeRow> {
        read_repository(&self.main, &[]).expect("repository reads").rows
    }
}

impl Drop for Repo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

fn row<'a>(rows: &'a [WorktreeRow], branch: &str) -> &'a WorktreeRow {
    rows.iter()
        .find(|row| row.branch.as_deref() == Some(branch))
        .unwrap_or_else(|| panic!("no row for {branch}"))
}

fn ctime_utc(epoch: i64) -> String {
    Utc.timestamp_opt(epoch, 0).unwrap().format("%a %b %e %H:%M:%S %Y").to_string()
}

fn own_start() -> i64 {
    match process_start(std::process::id()) {
        ProcessStart::StartedAt(started) => started,
        _ => panic!("the test process must be able to read its own start time"),
    }
}

#[test]
fn only_a_head_merged_off_the_first_parent_line_is_merged() {
    let repo = Repo::new("standing");
    let zero = repo.worktree("feat/zero-commit");
    let merged = repo.worktree("feat/merged");
    repo.commit(&merged, "merged.md");
    repo.git(&repo.main, &["merge", "-q", "--no-ff", "-m", "merge", "feat/merged"]);
    let forwarded = repo.worktree("fix/fast-forwarded");
    repo.commit(&forwarded, "forwarded.md");
    repo.git(&repo.main, &["merge", "-q", "--ff-only", "fix/fast-forwarded"]);
    let ahead = repo.worktree("feat/ahead");
    repo.commit(&ahead, "ahead.md");
    let _ = zero;

    let rows = repo.rows();
    assert_eq!(rows.len(), 5);
    let main = rows.iter().find(|row| row.main_checkout).unwrap();
    assert_eq!(main.standing, Standing::Base);
    assert_eq!(row(&rows, "feat/merged").standing, Standing::Merged);
    assert_eq!(row(&rows, "feat/zero-commit").standing, Standing::NoCommits);
    assert_eq!(row(&rows, "fix/fast-forwarded").standing, Standing::NoCommits);
    assert_eq!(row(&rows, "feat/ahead").standing, Standing::Ahead);
    assert_eq!(row(&rows, "feat/ahead").ahead, Some(1));
    assert_eq!(row(&rows, "feat/ahead").last_commit_author.as_deref(), Some("atlas test"));
    let merged_rows = rows.iter().filter(|row| row.standing == Standing::Merged).count();
    assert_eq!(merged_rows, 1);
}

#[test]
fn the_standing_rule_never_merges_the_base_and_keeps_zero_commits_apart() {
    assert_eq!(standing_of(true, Some(0), false), Standing::Base);
    assert_eq!(standing_of(false, Some(0), true), Standing::NoCommits);
    assert_eq!(standing_of(false, Some(0), false), Standing::Merged);
    assert_eq!(standing_of(false, Some(3), false), Standing::Ahead);
    assert_eq!(standing_of(false, None, false), Standing::Unknown);
}

/// Run under `TZ=Asia/Seoul`: a reason read in local time would be nine hours off and read stale.
#[test]
fn lock_times_are_utc_a_reused_pid_is_stale_and_an_unparsed_reason_is_held() {
    let repo = Repo::new("locks");
    let live = repo.worktree("feat/live");
    let reused = repo.worktree("feat/reused");
    let unparsed = repo.worktree("feat/unparsed");
    let pid = std::process::id();
    let started = own_start();
    repo.lock(&live, &format!("claude agent agent-a1b2c3 (pid {pid} start {})", ctime_utc(started)));
    repo.lock(&reused, &format!("claude agent agent-d4e5f6 (pid {pid} start {})", ctime_utc(started - 3_600)));
    repo.lock(&unparsed, "held by hand while rebasing");

    let rows = repo.rows();
    let live = row(&rows, "feat/live").lock.as_ref().unwrap();
    assert_eq!(live.state, LockState::Live);
    assert_eq!(live.tool, LockTool::ClaudeCode);
    assert_eq!(live.agent_id.as_deref(), Some("a1b2c3"));
    assert_eq!(live.pid, Some(pid));
    assert!(live.locked_at.is_some(), "the lock time comes from the locked file");
    assert_eq!(row(&rows, "feat/reused").lock.as_ref().unwrap().state, LockState::Stale);
    assert_eq!(row(&rows, "feat/unparsed").lock.as_ref().unwrap().state, LockState::Unparsed);
    assert!(row(&rows, "main").lock.is_none());
}

#[test]
fn a_lock_whose_pid_has_ended_is_stale() {
    let reason = parse_lock_reason("claude agent agent-x (pid 42 start Sat Nov 21 09:47:42 2026)");
    assert_eq!(judge_lock(reason.as_ref(), |_| ProcessStart::Gone), LockState::Stale);
    assert_eq!(judge_lock(None, |_| ProcessStart::Gone), LockState::Unparsed);
}

#[test]
fn a_lock_reason_reads_its_pid_and_utc_start_with_a_space_padded_day() {
    let reason = parse_lock_reason("claude agent agent-a163e0c6 (pid 95607 start Sun Nov  1 09:47:42 2026)").unwrap();
    assert_eq!(reason.pid, 95607);
    assert_eq!(reason.agent_id.as_deref(), Some("a163e0c6"));
    assert_eq!(reason.started_at, Utc.with_ymd_and_hms(2026, 11, 1, 9, 47, 42).unwrap().timestamp());
    assert!(parse_lock_reason("claude agent agent-x (pid 0 start Sun Nov  1 09:47:42 2026)").is_none());
    assert!(parse_lock_reason("claude agent agent-x (pid 7 start yesterday)").is_none());
}

#[test]
fn a_record_outside_the_chosen_folder_needs_its_worktree_to_point_back() {
    let repo = Repo::new("outside");
    let outside = repo.dir.join("outside");
    let target = outside.to_string_lossy().into_owned();
    repo.git(&repo.main, &["worktree", "add", "-q", "-b", "feat/outside", &target]);
    assert!(repo.rows().iter().any(|row| row.branch.as_deref() == Some("feat/outside")));

    fs::write(outside.join(".git"), "gitdir: /elsewhere/.git/worktrees/other\n").unwrap();
    assert!(repo.rows().iter().all(|row| row.branch.as_deref() != Some("feat/outside")));
}

#[test]
fn a_missing_folder_keeps_its_row() {
    let repo = Repo::new("missing");
    let gone = repo.worktree("feat/gone");
    fs::remove_dir_all(&gone).unwrap();
    let rows = repo.rows();
    assert!(row(&rows, "feat/gone").missing);
}

#[test]
fn porcelain_records_keep_lock_reasons_with_spaces() {
    let text = "worktree /r\0HEAD abc\0branch refs/heads/main\0\0worktree /r/w\0HEAD def\0detached\0locked claude agent agent-1 (pid 2 start x)\0\0";
    let entries = parse_porcelain(text);
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].branch.as_deref(), Some("main"));
    assert_eq!(entries[1].branch, None);
    assert_eq!(entries[1].locked.as_deref(), Some("claude agent agent-1 (pid 2 start x)"));
}

#[test]
fn the_remote_host_never_carries_user_information() {
    assert_eq!(
        host_and_slug("https://user:token@github.com/wlsdks/ontology-atlas.git"),
        (Some("github.com".into()), Some("wlsdks/ontology-atlas".into()))
    );
    assert_eq!(
        host_and_slug("git@github.com:owner/name.git"),
        (Some("github.com".into()), Some("owner/name".into()))
    );
    assert_eq!(host_and_slug("/srv/origin.git"), (None, None));
    assert_eq!(host_and_slug("https://host.example/../../user").1, None);
}

/// Dogfood: the repository this crate lives in, however many worktrees it has today.
#[test]
fn every_worktree_the_listing_reports_appears_in_this_repository() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let listing = Command::new("git")
        .args(["worktree", "list", "--porcelain", "-z"])
        .current_dir(crate_dir)
        .output()
        .unwrap();
    let expected = parse_porcelain(&String::from_utf8_lossy(&listing.stdout)).len();
    let started = std::time::Instant::now();
    let read = read_repository(crate_dir, &[]).expect("this repository reads");
    let elapsed = started.elapsed();
    println!("work status read {} worktrees in {elapsed:?}", read.rows.len());
    assert_eq!(read.rows.len(), expected);
    // Measured 2026-11-21: 34 worktrees in 0.7 s at load 50 on 12 cores; the screen's budget is 2 s.
    assert!(elapsed < std::time::Duration::from_secs(10), "{elapsed:?}");
}
