use std::path::PathBuf;
use std::time::{Duration, Instant};

use super::pace::{Pace, CHANGE_GAP, STEADY_GAP};
use super::parse::{parse_sessions, session_state, ListedSession, SessionState};
use super::{claude_sessions, join};
use crate::work_status::agent_processes::{AgentProcess, AgentTool};

const PLANTED: &str = "ATLAS_PLANTED_7f3c";

fn entry(fields: &str) -> String {
    format!(
        r#"{{"pid":41,"cwd":"/repo","kind":"interactive","startedAt":1700000005000,"name":"{PLANTED}","sessionId":"{PLANTED}",{fields}}}"#
    )
}

fn only_state(fields: &str) -> Option<SessionState> {
    let listed = parse_sessions(&format!("[{}]", entry(fields)))?;
    listed.first().map(|session| session.state)
}

#[test]
fn each_known_value_gives_its_room_state() {
    let cases = [
        (
            r#""status":"waiting","waitingFor":"permission prompt""#,
            SessionState::WaitingApproval,
        ),
        (
            r#""status":"waiting","waitingFor":"sandbox request""#,
            SessionState::WaitingApproval,
        ),
        (
            r#""status":"waiting","waitingFor":"input needed""#,
            SessionState::WaitingAnswer,
        ),
        (
            r#""status":"waiting","waitingFor":"dialog open""#,
            SessionState::WaitingAnswer,
        ),
        (
            r#""status":"waiting","waitingFor":"worker request""#,
            SessionState::WaitingAnswer,
        ),
        (
            r#""status":"idle","state":"blocked","id":"a1""#,
            SessionState::WaitingAnswer,
        ),
        (r#""status":"busy""#, SessionState::Working),
        (r#""state":"working","id":"a1""#, SessionState::Working),
        (r#""status":"idle""#, SessionState::Replied),
        (r#""state":"done","id":"a1""#, SessionState::Replied),
        (r#""state":"failed","id":"a1""#, SessionState::Failed),
    ];
    for (fields, expected) in cases {
        assert_eq!(only_state(fields), Some(expected), "{fields}");
    }
}

#[test]
fn a_value_outside_its_list_means_unknown() {
    for fields in [
        r#""status":"paused""#,
        r#""status":"waiting","waitingFor":"a new reason""#,
        r#""status":"waiting""#,
        r#""status":"busy","state":"exploded""#,
        r#""state":"stopped""#,
        r#""status":"busy","mood":"fine""#,
        r#""status":7"#,
    ] {
        assert_eq!(only_state(fields), None, "{fields}");
    }
    assert_eq!(session_state(None, None, None), None);
    let other_kind = entry(r#""status":"busy""#).replace("interactive", "remote");
    assert_eq!(parse_sessions(&format!("[{other_kind}]")), Some(vec![]));
}

#[test]
fn one_unknown_entry_leaves_the_others() {
    let text = format!(
        "[{},{},17,{}]",
        entry(r#""status":"busy""#),
        entry(r#""status":"busy","extra":true"#),
        entry(r#""status":"idle""#).replace(r#""pid":41"#, r#""pid":42"#),
    );
    let listed = parse_sessions(&text).expect("a list");
    let pids: Vec<u32> = listed.iter().map(|session| session.pid).collect();
    assert_eq!(pids, [41, 42]);
}

#[test]
fn output_that_is_not_a_list_is_unreadable() {
    let whole = format!("[{}]", entry(r#""status":"busy""#));
    assert_eq!(parse_sessions(&whole[..whole.len() - 9]), None);
    assert_eq!(parse_sessions(r#"{"error":"not signed in"}"#), None);
    assert_eq!(parse_sessions(""), None);
}

#[test]
fn a_name_and_a_session_id_reach_no_value() {
    let text = format!(
        "[{}]",
        entry(r#""status":"busy","id":"ATLAS_PLANTED_7f3c""#)
    );
    let listed = parse_sessions(&text).expect("a list");
    assert_eq!(listed.len(), 1);
    assert!(!format!("{listed:?}").contains(PLANTED));
    let rows = join(
        &listed,
        &[(41, Some(1_700_000_000))],
        &[(PathBuf::from("/repo"), "main".into())],
    );
    let sent = serde_json::to_string(&rows).expect("rows serialize");
    assert_eq!(
        sent,
        r#"[{"worktreeId":"main","pid":41,"state":"working"}]"#
    );
}

fn listed(pid: u32, started_at_ms: i64, folder: &str) -> ListedSession {
    ListedSession {
        pid,
        started_at_ms,
        folder: PathBuf::from(folder),
        state: SessionState::WaitingApproval,
    }
}

#[test]
fn an_entry_counts_only_for_a_shown_session_in_a_listed_worktree() {
    let worktrees = [
        (PathBuf::from("/repo"), "main".to_string()),
        (PathBuf::from("/repo/.worktrees/fix"), "fix".to_string()),
    ];
    let sessions = [
        (41, Some(1_700_000_000)),
        (42, Some(1_700_000_100)),
        (43, None),
    ];
    let list = [
        // The session began 37 s after its process: still that process.
        listed(41, 1_700_000_037_000, "/repo/.worktrees/fix/src"),
        // The process with this pid started after the session did: another program took the pid.
        listed(42, 1_700_000_090_000, "/repo"),
        // A process whose start is unknown proves nothing.
        listed(43, 1_700_000_000_000, "/repo"),
        // No process Atlas shows.
        listed(44, 1_700_000_000_000, "/repo"),
        // A folder outside every worktree.
        listed(41, 1_700_000_037_000, "/elsewhere"),
    ];
    let rows = join(&list, &sessions, &worktrees);
    assert_eq!(
        serde_json::to_string(&rows).expect("rows serialize"),
        r#"[{"worktreeId":"fix","pid":41,"state":"waitingApproval"}]"#
    );
}

#[test]
fn only_claude_code_programs_are_sessions() {
    let process = |pid, tool, folder: &str| AgentProcess {
        pid,
        tool,
        started_at: Some(5),
        folder: PathBuf::from(folder),
    };
    let sessions = claude_sessions(&[
        process(9, AgentTool::ClaudeCode, "/repo/b"),
        process(3, AgentTool::Codex, "/repo"),
        process(9, AgentTool::ClaudeCode, "/repo/a"),
        process(4, AgentTool::ClaudeCode, "/repo"),
    ]);
    assert_eq!(sessions, [(4, Some(5)), (9, Some(5))]);
}

/// One visible hour, asked once a second: at least as often as the page asks.
fn reads_in_an_hour(
    pace: &mut Pace,
    start: Instant,
    sessions_at: impl Fn(u64) -> Vec<(u32, Option<i64>)>,
) -> Vec<u64> {
    (0..3600)
        .filter(|second| {
            pace.take_turn(start + Duration::from_secs(*second), &sessions_at(*second))
        })
        .collect()
}

#[test]
fn a_steady_hour_reads_at_most_once_in_ten_seconds() {
    let start = Instant::now();
    let reads = reads_in_an_hour(&mut Pace::default(), start, |_| vec![(41, Some(1))]);
    assert_eq!(reads.len(), 360);
    assert!(reads
        .windows(2)
        .all(|pair| pair[1] - pair[0] >= STEADY_GAP.as_secs()));
}

#[test]
fn an_hour_with_no_session_reads_nothing() {
    let reads = reads_in_an_hour(&mut Pace::default(), Instant::now(), |_| vec![]);
    assert_eq!(reads, Vec::<u64>::new());
}

#[test]
fn a_new_session_is_read_within_two_seconds() {
    let start = Instant::now();
    let reads = reads_in_an_hour(&mut Pace::default(), start, |second| {
        if second < 23 {
            vec![(41, Some(1))]
        } else {
            vec![(41, Some(1)), (77, Some(20))]
        }
    });
    assert_eq!(&reads[..4], [0, 10, 20, 23]);
    assert!(CHANGE_GAP <= Duration::from_secs(2));
    // The change is spent: the next read waits the steady gap again.
    assert_eq!(reads[4], 33);
}

#[test]
fn the_status_reaches_the_page_in_its_own_words() {
    use super::ReadStatus::*;
    let words: Vec<String> = [
        Pending,
        NoSession,
        Read,
        NotFound,
        TimedOut,
        Failed,
        UnknownForm,
        Unsupported,
    ]
    .iter()
    .map(|status| serde_json::to_string(status).expect("a word"))
    .collect();
    assert_eq!(
        words,
        [
            r#""pending""#,
            r#""noSession""#,
            r#""read""#,
            r#""notFound""#,
            r#""timedOut""#,
            r#""failed""#,
            r#""unknownForm""#,
            r#""unsupported""#
        ]
    );
}

#[test]
fn a_read_switched_back_on_waits_out_the_change_gap() {
    let start = Instant::now();
    let mut pace = Pace::default();
    let sessions = [(41, Some(5))];
    assert!(pace.take_turn(start, &sessions));
    pace.expect_change();
    assert!(!pace.take_turn(start + CHANGE_GAP / 2, &sessions));
    assert!(pace.take_turn(start + CHANGE_GAP, &sessions));
}

/// A repository whose Git folder records three linked worktrees: one under it, one elsewhere that
/// names the record in its own `.git` file, and one elsewhere that does not.
#[cfg(unix)]
#[test]
fn a_stray_worktree_record_brings_no_folder_in() {
    use super::worktree_folders;
    let base = std::env::temp_dir().join(format!("atlas-session-worktrees-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    let write = |path: PathBuf, text: String| {
        std::fs::create_dir_all(path.parent().expect("a parent")).expect("folder");
        std::fs::write(path, text).expect("file");
    };
    let repo = base.join("repo");
    let records = repo.join(".git/worktrees");
    for (id, folder, points_back) in [
        ("inside", repo.join("trees/inside"), false),
        ("away", base.join("away"), true),
        ("stray", base.join("stray"), false),
    ] {
        std::fs::create_dir_all(&folder).expect("worktree folder");
        write(
            records.join(id).join("gitdir"),
            format!("{}\n", folder.join(".git").display()),
        );
        if points_back {
            write(
                folder.join(".git"),
                format!("gitdir: {}\n", records.join(id).display()),
            );
        }
    }

    let mut ids: Vec<String> = worktree_folders(&repo)
        .into_iter()
        .map(|(_, id)| id)
        .collect();
    ids.sort();
    assert_eq!(ids, ["away", "inside", "main"]);
    let _ = std::fs::remove_dir_all(&base);
}

#[cfg(target_os = "macos")]
mod the_call {
    use std::ffi::OsStr;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};
    use std::time::{Duration, Instant};

    use super::super::call::{
        installed_program, list_command, run_capped, CallFailure, OUTPUT_CAP_BYTES, TIME_LIMIT,
    };
    use super::super::parse::parse_sessions;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "atlas-agent-sessions-{name}-{}",
                std::process::id()
            ));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("scratch folder");
            Self(fs::canonicalize(&dir).expect("scratch path"))
        }

        /// A stand-in `claude` that runs `script` whatever its arguments.
        fn program(&self, script: &str) -> PathBuf {
            let path = self.0.join("claude");
            fs::write(&path, format!("#!/bin/sh\n{script}\n")).expect("stub written");
            fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).expect("stub runnable");
            path
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn each_way_a_read_goes_has_its_own_status() {
        use super::super::{listed_from, ReadStatus};
        let list = br#"[{"pid":41,"cwd":"/repo","kind":"interactive","startedAt":1700000005000,"status":"busy"}]"#;
        assert_eq!(
            listed_from(Ok(list.to_vec())).map(|listed| listed.len()),
            Ok(1)
        );
        assert_eq!(
            listed_from(Ok(b"[]".to_vec())).map(|listed| listed.len()),
            Ok(0)
        );
        assert_eq!(
            listed_from(Ok(b"Usage: claude".to_vec())),
            Err(ReadStatus::UnknownForm)
        );
        assert_eq!(
            listed_from(Ok(vec![0xff, 0xfe])),
            Err(ReadStatus::UnknownForm)
        );
        assert_eq!(
            listed_from(Err(CallFailure::TimedOut)),
            Err(ReadStatus::TimedOut)
        );
        assert_eq!(
            listed_from(Err(CallFailure::Failed)),
            Err(ReadStatus::Failed)
        );
    }

    /// A hand probe of this Mac's own Claude Code: `cargo test real_session_list -- --ignored --nocapture`.
    #[test]
    #[ignore = "runs the installed Claude Code"]
    fn real_session_list_is_read_and_understood() {
        let home = PathBuf::from(std::env::var_os("HOME").expect("a home folder"));
        let program = installed_program(&home).expect("Claude Code is installed");
        let scratch = Scratch::new("real");
        let started = Instant::now();
        let output = run_capped(
            list_command(&program, &home, &scratch.0),
            TIME_LIMIT,
            OUTPUT_CAP_BYTES,
        )
        .expect("the list is printed");
        let raw: Vec<serde_json::Value> = serde_json::from_slice(&output).expect("a JSON list");
        let listed = parse_sessions(std::str::from_utf8(&output).expect("text")).expect("a list");
        let states: Vec<_> = listed.iter().map(|session| session.state).collect();
        println!(
            "{} entries, {} understood, in {:?}: {states:?}",
            raw.len(),
            listed.len(),
            started.elapsed()
        );
        assert_eq!(listed.len(), raw.len());
    }

    #[test]
    fn the_call_is_fixed_and_carries_two_variables() {
        let command = list_command(
            Path::new("/Users/someone/.local/bin/claude"),
            Path::new("/Users/someone"),
            Path::new("/data"),
        );
        assert_eq!(command.get_program(), "/usr/bin/sandbox-exec");
        let arguments: Vec<&OsStr> = command.get_args().collect();
        assert_eq!(
            arguments,
            [
                "-p",
                "(version 1)(allow default)(deny network*)",
                "/Users/someone/.local/bin/claude",
                "agents",
                "--json"
            ]
        );
        let mut variables: Vec<(&OsStr, Option<&OsStr>)> = command.get_envs().collect();
        variables.sort();
        assert_eq!(
            variables,
            [
                (
                    OsStr::new("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"),
                    Some(OsStr::new("1"))
                ),
                (OsStr::new("HOME"), Some(OsStr::new("/Users/someone"))),
            ]
        );
        assert_eq!(command.get_current_dir(), Some(Path::new("/data")));
        assert_eq!(TIME_LIMIT, Duration::from_secs(5));
        assert_eq!(OUTPUT_CAP_BYTES, 1024 * 1024);
    }

    #[test]
    fn the_program_comes_from_the_home_install_never_the_search_path() {
        let scratch = Scratch::new("install");
        let home = scratch.0.join("home");
        fs::create_dir_all(home.join(".local/bin")).expect("install folder");
        let installed = home.join(".local/bin/claude");
        fs::write(&installed, "").expect("installed program");
        assert_eq!(installed_program(&home), Some(installed));

        // With no install in the home folder only the two system paths can answer: this process's
        // own search path, which names a `claude` wherever Claude Code is installed, is not asked.
        let bare_home = scratch.0.join("bare");
        fs::create_dir_all(&bare_home).expect("bare home");
        let system = ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"].map(PathBuf::from);
        assert!(installed_program(&bare_home).is_none_or(|found| system.contains(&found)));

        // The program is named whole and given its own environment, so nothing inherited reaches it.
        let real = scratch.0.join("real");
        fs::write(&real, "#!/bin/sh\nenv\n").expect("real program");
        fs::set_permissions(&real, fs::Permissions::from_mode(0o755)).expect("runnable");
        let command = list_command(&real, &home, &scratch.0);
        let printed = run_capped(command, TIME_LIMIT, OUTPUT_CAP_BYTES).expect("the program ran");
        let printed = String::from_utf8_lossy(&printed);
        assert!(printed.contains("HOME="));
        // Cargo's own variables are in this process's environment; none reaches the program.
        assert!(std::env::vars().any(|(name, _)| name.starts_with("CARGO")));
        assert!(!printed.contains("CARGO"));
    }

    #[test]
    fn a_recorded_list_is_read_through_the_call() {
        let scratch = Scratch::new("recorded");
        let program = scratch.program(
            r#"printf '%s' '[{"pid":41,"cwd":"/repo","kind":"interactive","startedAt":1700000005000,"sessionId":"s","name":"n","status":"waiting","waitingFor":"permission prompt"}]'"#,
        );
        let output = run_capped(
            list_command(&program, &scratch.0, &scratch.0),
            TIME_LIMIT,
            OUTPUT_CAP_BYTES,
        )
        .expect("the stub prints a list");
        let listed = parse_sessions(std::str::from_utf8(&output).expect("text")).expect("a list");
        assert_eq!(listed.len(), 1);
    }

    #[test]
    fn two_mebibytes_of_output_are_refused() {
        let scratch = Scratch::new("large");
        let program = scratch.program("head -c 2097152 /dev/zero");
        let started = Instant::now();
        let output = run_capped(
            list_command(&program, &scratch.0, &scratch.0),
            TIME_LIMIT,
            OUTPUT_CAP_BYTES,
        );
        assert_eq!(output, Err(CallFailure::Failed));
        assert!(started.elapsed() < TIME_LIMIT);
    }

    #[test]
    fn a_program_that_fails_gives_nothing() {
        let scratch = Scratch::new("failing");
        let program = scratch.program("printf '[]'; exit 3");
        let output = run_capped(
            list_command(&program, &scratch.0, &scratch.0),
            TIME_LIMIT,
            OUTPUT_CAP_BYTES,
        );
        assert_eq!(output, Err(CallFailure::Failed));
    }

    /// Long enough for the sandbox to start the stub, short enough to end a test soon.
    const SHORT_LIMIT: Duration = Duration::from_secs(2);

    /// The pid the stub wrote for the child it left running.
    fn left_child(scratch: &Scratch) -> libc::pid_t {
        let text = fs::read_to_string(scratch.0.join("child")).expect("the stub wrote its child");
        text.trim().parse().expect("a pid")
    }

    /// Waits for the process to be gone; a process still there after ten seconds was never killed.
    fn assert_ended(pid: libc::pid_t) {
        let hang = Instant::now() + Duration::from_secs(10);
        // SAFETY: signal 0 sends nothing; it only asks whether the pid names a process.
        while unsafe { libc::kill(pid, 0) } == 0 {
            assert!(Instant::now() < hang, "process {pid} is still running");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn a_sleeper_is_killed_with_what_it_started() {
        let scratch = Scratch::new("sleeper");
        let program = scratch.program("sleep 30 >/dev/null &\necho $! > child\nsleep 30");
        let output = run_capped(
            list_command(&program, &scratch.0, &scratch.0),
            SHORT_LIMIT,
            OUTPUT_CAP_BYTES,
        );
        assert_eq!(output, Err(CallFailure::TimedOut));
        assert_ended(left_child(&scratch));
    }

    #[test]
    fn a_child_holding_the_output_open_ends_the_call_at_its_limit() {
        let scratch = Scratch::new("holder");
        let program = scratch.program("sleep 30 &\necho $! > child\nprintf '[]'");
        let output = run_capped(
            list_command(&program, &scratch.0, &scratch.0),
            SHORT_LIMIT,
            OUTPUT_CAP_BYTES,
        );
        assert_eq!(output, Err(CallFailure::TimedOut));
        assert_ended(left_child(&scratch));
    }

    #[test]
    fn a_child_left_behind_ends_with_a_call_that_went_well() {
        let scratch = Scratch::new("left-behind");
        let program = scratch.program("sleep 30 >/dev/null 2>&1 &\necho $! > child\nprintf '[]'");
        let output = run_capped(
            list_command(&program, &scratch.0, &scratch.0),
            TIME_LIMIT,
            OUTPUT_CAP_BYTES,
        );
        assert_eq!(output.as_deref(), Ok(&b"[]"[..]));
        assert_ended(left_child(&scratch));
    }

    #[test]
    fn the_program_cannot_open_a_connection() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("a local port");
        listener.set_nonblocking(true).expect("non-blocking accept");
        let port = listener.local_addr().expect("the port").port();
        let scratch = Scratch::new("network");
        let program = scratch.program(&format!(
            "/usr/bin/nc -z -w 2 127.0.0.1 {port} && printf reached || printf refused"
        ));

        // Outside the sandbox the same stub reaches the listener, so the refusal below is the
        // sandbox's and not a closed port.
        let outside = std::process::Command::new(&program)
            .output()
            .expect("the stub runs");
        assert_eq!(String::from_utf8_lossy(&outside.stdout), "reached");
        assert!(listener.accept().is_ok());

        let output = run_capped(
            list_command(&program, &scratch.0, &scratch.0),
            TIME_LIMIT,
            OUTPUT_CAP_BYTES,
        )
        .expect("the stub ends");
        assert_eq!(String::from_utf8_lossy(&output), "refused");
        assert!(listener.accept().is_err());
    }
}
