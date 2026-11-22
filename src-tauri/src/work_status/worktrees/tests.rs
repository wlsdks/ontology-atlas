use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use chrono::{TimeZone, Utc};

use super::lock::{
    judge_lock, parse_lock_reason, process_start, LockState, LockTool, ProcessStart,
};
use super::remote::host_and_slug;
use super::{
    parse_porcelain, read_repository, standing_of, Standing, WorktreeRow, ZeroAheadEvidence,
};
use crate::work_status::agent_processes::{
    credit_to_agents, remember, tool_for_executable, AgentProcess, AgentTool, ProcessFacts,
};

/// Git cannot take a Windows verbatim path (`\\?\C:\...`) as an argument, and the canonical
/// fixture root is one there.
fn git_arg(path: &Path) -> String {
    let text = path.to_string_lossy().into_owned();
    text.strip_prefix(r"\\?\")
        .map(str::to_owned)
        .unwrap_or(text)
}

struct Repo {
    dir: PathBuf,
    main: PathBuf,
}

impl Repo {
    fn new(name: &str) -> Self {
        let dir =
            std::env::temp_dir().join(format!("atlas-work-status-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let main = dir.join("main");
        fs::create_dir_all(&main).unwrap();
        let dir = fs::canonicalize(&dir).unwrap();
        let main = dir.join("main");
        let repo = Repo { dir, main };
        repo.git(&repo.main, &["init", "-q", "-b", "main"]);
        repo.git(
            &repo.main,
            &["config", "user.email", "test@example.invalid"],
        );
        repo.git(&repo.main, &["config", "user.name", "atlas test"]);
        repo.git(&repo.main, &["config", "commit.gpgsign", "false"]);
        repo.commit(&repo.main.clone(), "one.md");
        repo
    }

    fn git(&self, cwd: &Path, args: &[&str]) -> String {
        let out = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
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
        let target = git_arg(&path);
        self.git(
            &self.main,
            &["worktree", "add", "-q", "-b", branch, &target],
        );
        path
    }

    fn lock(&self, path: &Path, reason: &str) {
        let target = git_arg(path);
        self.git(
            &self.main,
            &["worktree", "lock", "--reason", reason, &target],
        );
    }

    fn rows(&self) -> Vec<WorktreeRow> {
        read_repository(&self.main, &[], &[])
            .expect("repository reads")
            .rows
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
    Utc.timestamp_opt(epoch, 0)
        .unwrap()
        .format("%a %b %e %H:%M:%S %Y")
        .to_string()
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
    repo.git(
        &repo.main,
        &["merge", "-q", "--no-ff", "-m", "merge", "feat/merged"],
    );
    let forwarded = repo.worktree("fix/fast-forwarded");
    repo.commit(&forwarded, "forwarded.md");
    repo.git(
        &repo.main,
        &["merge", "-q", "--ff-only", "fix/fast-forwarded"],
    );
    let ahead = repo.worktree("feat/ahead");
    repo.commit(&ahead, "ahead.md");
    let _ = zero;

    let rows = repo.rows();
    assert_eq!(rows.len(), 5);
    let main = rows.iter().find(|row| row.main_checkout).unwrap();
    assert_eq!(main.standing, Standing::Base);
    assert_eq!(row(&rows, "feat/merged").standing, Standing::Merged);
    assert_eq!(row(&rows, "feat/zero-commit").standing, Standing::NoCommits);
    assert_eq!(
        row(&rows, "fix/fast-forwarded").standing,
        Standing::NoCommits
    );
    assert_eq!(row(&rows, "feat/ahead").standing, Standing::Ahead);
    assert_eq!(row(&rows, "feat/ahead").ahead, Some(1));
    assert_eq!(
        row(&rows, "feat/ahead").last_commit_author.as_deref(),
        Some("atlas test")
    );
    let merged_rows = rows
        .iter()
        .filter(|row| row.standing == Standing::Merged)
        .count();
    assert_eq!(merged_rows, 1);
}

#[test]
fn the_standing_rule_never_merges_the_base_and_keeps_zero_commits_apart() {
    let evidence = |on_first_parent, moved_since_created| ZeroAheadEvidence {
        on_first_parent,
        moved_since_created,
    };
    let off_line_moved = evidence(Some(false), true);
    assert_eq!(standing_of(true, Some(0), off_line_moved), Standing::Base);
    assert_eq!(
        standing_of(false, Some(0), evidence(Some(true), true)),
        Standing::NoCommits
    );
    assert_eq!(
        standing_of(false, Some(0), off_line_moved),
        Standing::Merged
    );
    assert_eq!(
        standing_of(false, Some(0), evidence(Some(false), false)),
        Standing::NoCommits
    );
    assert_eq!(
        standing_of(false, Some(0), evidence(None, true)),
        Standing::Unknown
    );
    assert_eq!(standing_of(false, Some(3), off_line_moved), Standing::Ahead);
    assert_eq!(standing_of(false, None, off_line_moved), Standing::Unknown);
}

/// Every commit on this repository's main is a merge, so a branch created at a merged commit
/// sits off the first-parent line with nothing of its own; it never moved, so it is not merged.
#[test]
fn a_branch_that_never_moved_from_a_merged_commit_has_no_commits_rather_than_merged() {
    let repo = Repo::new("never-moved");
    let side = repo.worktree("feat/side");
    repo.commit(&side, "side.md");
    let side_head = repo.git(&side, &["rev-parse", "HEAD"]);
    repo.git(
        &repo.main,
        &["merge", "-q", "--no-ff", "-m", "merge", "feat/side"],
    );
    let created_there = repo.dir.join("main/worktrees/integration");
    let target = git_arg(&created_there);
    repo.git(
        &repo.main,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "integration",
            &target,
            &side_head,
        ],
    );

    let rows = repo.rows();
    assert_eq!(row(&rows, "feat/side").standing, Standing::Merged);
    assert_eq!(row(&rows, "integration").standing, Standing::NoCommits);
}

#[test]
fn a_planted_gitdir_that_leaves_the_folder_by_dot_dot_or_symlink_is_not_shown() {
    let repo = Repo::new("planted");
    let unrelated = repo.dir.join("unrelated");
    fs::create_dir_all(&unrelated).unwrap();
    fs::write(unrelated.join(".git"), "gitdir: /nowhere\n").unwrap();
    let admin = repo.main.join(".git/worktrees");
    let plant = |id: &str, gitdir: PathBuf| {
        let record = admin.join(id);
        fs::create_dir_all(&record).unwrap();
        fs::write(record.join("HEAD"), "ref: refs/heads/main\n").unwrap();
        fs::write(record.join("commondir"), "../..\n").unwrap();
        fs::write(record.join("gitdir"), format!("{}\n", git_arg(&gitdir))).unwrap();
    };
    plant("dotdot", repo.main.join("../unrelated/.git"));
    // Windows needs a privilege to create a directory symlink, so only Unix plants that one.
    #[cfg(unix)]
    {
        let link = repo.main.join("linked");
        std::os::unix::fs::symlink(&unrelated, &link).unwrap();
        plant("symlinked", link.join(".git"));
    }

    let rows = repo.rows();
    assert!(
        rows.iter()
            .all(|row| row.id != "dotdot" && row.id != "symlinked"),
        "{:?}",
        rows.iter().map(|row| &row.path).collect::<Vec<_>>()
    );
}

/// A reason read in local time would be hours off and read stale wherever the zone is not UTC.
#[test]
fn lock_times_are_utc_a_reused_pid_is_stale_and_an_unparsed_reason_is_held() {
    let repo = Repo::new("locks");
    let live = repo.worktree("feat/live");
    let reused = repo.worktree("feat/reused");
    let unparsed = repo.worktree("feat/unparsed");
    let pid = std::process::id();
    let started = own_start();
    repo.lock(
        &live,
        &format!(
            "claude agent agent-a1b2c3 (pid {pid} start {})",
            ctime_utc(started)
        ),
    );
    repo.lock(
        &reused,
        &format!(
            "claude agent agent-d4e5f6 (pid {pid} start {})",
            ctime_utc(started - 3_600)
        ),
    );
    repo.lock(&unparsed, "held by hand while rebasing");

    let rows = repo.rows();
    let live = row(&rows, "feat/live").lock.as_ref().unwrap();
    assert_eq!(live.state, LockState::Live);
    assert_eq!(live.tool, LockTool::ClaudeCode);
    assert_eq!(live.agent_id.as_deref(), Some("a1b2c3"));
    assert_eq!(live.pid, Some(pid));
    assert!(
        live.locked_at.is_some(),
        "the lock time comes from the locked file"
    );
    assert_eq!(
        row(&rows, "feat/reused").lock.as_ref().unwrap().state,
        LockState::Stale
    );
    assert_eq!(
        row(&rows, "feat/unparsed").lock.as_ref().unwrap().state,
        LockState::Unparsed
    );
    assert!(row(&rows, "main").lock.is_none());
}

#[test]
fn a_lock_whose_pid_has_ended_is_stale() {
    let reason = parse_lock_reason("claude agent agent-x (pid 42 start Sat Nov 21 09:47:42 2026)");
    assert_eq!(
        judge_lock(reason.as_ref(), |_| ProcessStart::Gone),
        LockState::Stale
    );
    assert_eq!(
        judge_lock(None, |_| ProcessStart::Gone),
        LockState::Unparsed
    );
}

#[test]
fn a_lock_reason_reads_its_pid_and_utc_start_with_a_space_padded_day() {
    let reason =
        parse_lock_reason("claude agent agent-a163e0c6 (pid 95607 start Sun Nov  1 09:47:42 2026)")
            .unwrap();
    assert_eq!(reason.pid, 95607);
    assert_eq!(reason.agent_id.as_deref(), Some("a163e0c6"));
    assert_eq!(
        reason.started_at,
        Utc.with_ymd_and_hms(2026, 11, 1, 9, 47, 42)
            .unwrap()
            .timestamp()
    );
    assert!(
        parse_lock_reason("claude agent agent-x (pid 0 start Sun Nov  1 09:47:42 2026)").is_none()
    );
    assert!(parse_lock_reason("claude agent agent-x (pid 7 start yesterday)").is_none());
}

#[test]
fn a_record_outside_the_chosen_folder_needs_its_worktree_to_point_back() {
    let repo = Repo::new("outside");
    let outside = repo.dir.join("outside");
    let target = git_arg(&outside);
    repo.git(
        &repo.main,
        &["worktree", "add", "-q", "-b", "feat/outside", &target],
    );
    assert!(repo
        .rows()
        .iter()
        .any(|row| row.branch.as_deref() == Some("feat/outside")));

    fs::write(
        outside.join(".git"),
        "gitdir: /elsewhere/.git/worktrees/other\n",
    )
    .unwrap();
    assert!(repo
        .rows()
        .iter()
        .all(|row| row.branch.as_deref() != Some("feat/outside")));
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
    assert_eq!(
        entries[1].locked.as_deref(),
        Some("claude agent agent-1 (pid 2 start x)")
    );
}

#[test]
fn the_remote_host_never_carries_user_information() {
    assert_eq!(
        host_and_slug("https://user:token@github.com/wlsdks/ontology-atlas.git"),
        (
            Some("github.com".into()),
            Some("wlsdks/ontology-atlas".into())
        )
    );
    assert_eq!(
        host_and_slug("git@github.com:owner/name.git"),
        (Some("github.com".into()), Some("owner/name".into()))
    );
    assert_eq!(host_and_slug("/srv/origin.git"), (None, None));
    assert_eq!(host_and_slug("C:/repos/origin.git"), (None, None));
    assert_eq!(host_and_slug(r"D:\repos\origin.git"), (None, None));
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
    let read = read_repository(crate_dir, &[], &[]).expect("this repository reads");
    let elapsed = started.elapsed();
    println!(
        "work status read {} worktrees in {elapsed:?}",
        read.rows.len()
    );
    assert_eq!(read.rows.len(), expected);
    // Measured: 34 worktrees in 0.7 s at load 50 (2026-11-21), 11 in 0.21 s with six workers (11-22).
    assert!(elapsed < std::time::Duration::from_secs(10), "{elapsed:?}");
}

#[test]
fn an_agent_is_known_by_its_executable_path() {
    let tool = |path: &str| tool_for_executable(Path::new(path));
    assert_eq!(
        tool("/Users/a/.local/bin/claude"),
        Some(AgentTool::ClaudeCode)
    );
    assert_eq!(
        tool("/Users/a/.local/share/claude/versions/2.1.330"),
        Some(AgentTool::ClaudeCode)
    );
    assert_eq!(
        tool("/Users/a/.codex/packages/app-server-daemon/bin/codex"),
        Some(AgentTool::Codex)
    );
    for other in [
        "/usr/bin/node",
        "/opt/x/versions/2.1.0",
        "/bin/zsh",
        "/x/claude-helper",
        "/x/Codex",
    ] {
        assert_eq!(tool(other), None, "{other}");
    }
}

#[test]
fn a_command_is_credited_to_the_agent_session_above_it() {
    let fact = |pid, parent, tool, folder: Option<&str>| ProcessFacts {
        pid,
        parent,
        started_at: Some(i64::from(pid)),
        tool,
        folder: folder.map(PathBuf::from),
    };
    let credited = credit_to_agents(
        &[
            fact(1, 0, None, Some("/")),
            fact(10, 1, Some(AgentTool::Codex), Some("/repo")),
            fact(11, 10, None, Some("/repo/wt/a")),
            fact(12, 11, None, Some("/repo/wt/a/src")),
            fact(13, 11, None, Some("/repo/wt/a")),
            fact(20, 1, None, Some("/repo/wt/b")),
            fact(30, 99, None, Some("/repo/wt/c")),
            fact(40, 1, Some(AgentTool::ClaudeCode), None),
            fact(41, 40, Some(AgentTool::ClaudeCode), Some("/repo/wt/d")),
            fact(50, 1, None, None),
            fact(51, 50, Some(AgentTool::ClaudeCode), Some("/repo/wt/e")),
        ],
        &[50],
    );
    let seen: Vec<(u32, &str)> = credited
        .iter()
        .map(|p| (p.pid, p.folder.to_str().unwrap()))
        .collect();
    assert_eq!(
        seen,
        vec![
            (10, "/repo"),
            (10, "/repo/wt/a"),
            (10, "/repo/wt/a/src"),
            (40, "/repo/wt/d")
        ]
    );
    assert!(credited[..3]
        .iter()
        .all(|p| p.tool == AgentTool::Codex && p.started_at == Some(10)));
}

#[test]
fn an_agent_program_belongs_to_the_deepest_worktree_holding_its_folder() {
    let repo = Repo::new("process-place");
    let nested = repo.worktree("feat/nested");
    let inner = nested.join("src");
    fs::create_dir_all(&inner).unwrap();
    let outside = repo.dir.join("elsewhere");
    fs::create_dir_all(&outside).unwrap();
    let process = |pid, folder: &Path| AgentProcess {
        pid,
        tool: AgentTool::Codex,
        started_at: Some(1),
        folder: folder.to_path_buf(),
    };
    let read = read_repository(
        &repo.main,
        &[],
        &[
            process(7, &inner),
            process(8, &repo.main),
            process(9, &outside),
        ],
    )
    .expect("repository reads");
    let pids = |row: &WorktreeRow| {
        row.agent_processes
            .iter()
            .map(|p| p.pid)
            .collect::<Vec<_>>()
    };
    assert_eq!(pids(row(&read.rows, "feat/nested")), vec![7]);
    let main = read.rows.iter().find(|row| row.main_checkout).unwrap();
    assert_eq!(pids(main), vec![8]);
}

/// A copy of `sleep` named `codex` stands in for the real program: the kernel names a process
/// after its executable, so this is the same evidence a Codex session gives.
#[cfg(any(target_os = "macos", target_os = "linux"))]
#[test]
fn a_running_program_named_codex_is_found_in_its_worktree() {
    let repo = Repo::new("process-live");
    let held = repo.worktree("feat/codex-held");
    let bin = repo.dir.join("bin");
    fs::create_dir_all(&bin).unwrap();
    let codex = bin.join("codex");
    fs::copy("/bin/sleep", &codex).unwrap();
    let mut child = Command::new(&codex)
        .arg("30")
        .current_dir(&held)
        .spawn()
        .expect("the stand-in starts");
    let found = crate::work_status::agent_processes::agent_processes(&[]);
    let _ = child.kill();
    let _ = child.wait();
    let read = read_repository(&repo.main, &[], &found).expect("repository reads");
    let codex_row = row(&read.rows, "feat/codex-held");
    assert!(
        codex_row
            .agent_processes
            .iter()
            .any(|p| p.tool == AgentTool::Codex && p.started_at.is_some()),
        "{:?}",
        codex_row.agent_processes
    );
}

#[test]
fn a_remembered_folder_lasts_ninety_seconds_while_its_agent_runs() {
    use std::collections::HashMap;
    use std::time::{Duration, Instant};
    let process = |pid, started_at, folder: &str| AgentProcess {
        pid,
        tool: AgentTool::Codex,
        started_at: Some(started_at),
        folder: PathBuf::from(folder),
    };
    let alive: HashMap<u32, Option<i64>> = [(1, Some(100)), (2, Some(999))].into();
    let start = Instant::now();
    let mut recent = vec![];
    let seen = remember(
        &mut recent,
        vec![
            process(1, 100, "/wt/a"),
            process(2, 200, "/wt/b"),
            process(1, 100, "/wt/gone"),
        ],
        &alive,
        start,
        |_| true,
    );
    assert_eq!(seen.len(), 3);
    let folders = |list: Vec<AgentProcess>| {
        list.into_iter()
            .map(|p| p.folder.to_string_lossy().into_owned())
            .collect::<Vec<_>>()
    };
    // 60 s later with nothing live: the agent whose start no longer matches and the removed folder go.
    let later = remember(
        &mut recent,
        vec![],
        &alive,
        start + Duration::from_secs(60),
        |folder| !folder.ends_with("gone"),
    );
    assert_eq!(folders(later), vec!["/wt/a"]);
    // Seen again at 80 s, it outlives the first sighting's grace.
    remember(
        &mut recent,
        vec![process(1, 100, "/wt/a")],
        &alive,
        start + Duration::from_secs(80),
        |_| true,
    );
    let held = remember(
        &mut recent,
        vec![],
        &alive,
        start + Duration::from_secs(160),
        |_| true,
    );
    assert_eq!(folders(held), vec!["/wt/a"]);
    let expired = remember(
        &mut recent,
        vec![],
        &alive,
        start + Duration::from_secs(171),
        |_| true,
    );
    assert!(expired.is_empty());
}

#[test]
fn work_in_a_removed_nested_worktree_never_falls_to_the_main_checkout() {
    let repo = Repo::new("process-removed");
    let gone = repo.worktree("feat/gone");
    let inside = gone.join("src");
    fs::remove_dir_all(&gone).unwrap();
    let read = read_repository(
        &repo.main,
        &[],
        &[AgentProcess {
            pid: 5,
            tool: AgentTool::Codex,
            started_at: Some(1),
            folder: inside,
        }],
    )
    .expect("repository reads");
    assert!(read.rows.iter().all(|row| row.agent_processes.is_empty()));
}
