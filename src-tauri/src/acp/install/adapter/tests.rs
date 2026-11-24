use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;

fn npx_launch(args: &[&str]) -> AcpLaunch {
    AcpLaunch {
        program: PathBuf::from("/usr/local/bin/npx"),
        args: args.iter().map(|arg| arg.to_string()).collect(),
        path_env: "/usr/local/bin".to_string(),
    }
}

/// A fetch the test releases by hand, so "while one is in flight" is a real state.
fn held_fetch(
    runs: &Arc<AtomicUsize>,
) -> (
    impl FnOnce() -> FetchOutcome + Send + 'static,
    mpsc::Sender<FetchOutcome>,
) {
    let (release, held) = mpsc::channel::<FetchOutcome>();
    let runs = Arc::clone(runs);
    let run = move || {
        runs.fetch_add(1, Ordering::SeqCst);
        held.recv()
            .unwrap_or_else(|_| Err("released-without-outcome".to_string()))
    };
    (run, release)
}

fn wait_until(condition: impl Fn() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while !condition() {
        assert!(Instant::now() < deadline, "condition never held");
        std::thread::sleep(Duration::from_millis(5));
    }
}

#[test]
fn a_second_request_joins_the_fetch_in_flight_instead_of_starting_another() {
    let fetches = AdapterFetches::default();
    let runs = Arc::new(AtomicUsize::new(0));
    let (run, release) = held_fetch(&runs);

    let first = {
        let fetches = fetches.clone();
        std::thread::spawn(move || fetches.ensure("claude-acp", || CacheCheck::Fetch, run))
    };
    wait_until(|| fetches.is_fetching("claude-acp"));

    let checks = Arc::new(AtomicUsize::new(0));
    let second = {
        let fetches = fetches.clone();
        let checks = Arc::clone(&checks);
        let runs = Arc::clone(&runs);
        std::thread::spawn(move || {
            fetches.ensure(
                "claude-acp",
                || {
                    checks.fetch_add(1, Ordering::SeqCst);
                    CacheCheck::Fetch
                },
                move || {
                    runs.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                },
            )
        })
    };
    std::thread::sleep(Duration::from_millis(50));
    assert!(
        !second.is_finished(),
        "the joining request must wait for the fetch in flight"
    );

    release.send(Ok(())).unwrap();
    assert_eq!(first.join().unwrap(), Ok(AdapterReadiness::Fetched));
    assert_eq!(second.join().unwrap(), Ok(AdapterReadiness::Fetched));
    assert_eq!(
        runs.load(Ordering::SeqCst),
        1,
        "two npx downloads of one adapter ran"
    );
    assert_eq!(
        checks.load(Ordering::SeqCst),
        0,
        "a joining request must not run the cache check, whose heal would delete the entry being written"
    );
    assert!(!fetches.is_fetching("claude-acp"));
}

#[test]
fn the_fetch_finishes_when_the_request_that_started_it_is_gone() {
    // The chat panel closing drops its pending request; the download it started keeps going.
    let fetches = AdapterFetches::default();
    let runs = Arc::new(AtomicUsize::new(0));
    let (run, release) = held_fetch(&runs);
    let finished = Arc::new(AtomicUsize::new(0));
    let finished_in_run = Arc::clone(&finished);
    let run = move || {
        let outcome = run();
        finished_in_run.fetch_add(1, Ordering::SeqCst);
        outcome
    };

    let abandoned = {
        let fetches = fetches.clone();
        std::thread::spawn(move || {
            let _ = fetches.ensure("codex-acp", || CacheCheck::Fetch, run);
        })
    };
    wait_until(|| fetches.is_fetching("codex-acp"));
    drop(abandoned);

    release.send(Ok(())).unwrap();
    wait_until(|| finished.load(Ordering::SeqCst) == 1);
    wait_until(|| !fetches.is_fetching("codex-acp"));
}

#[test]
fn a_runtime_the_session_start_refuses_never_fetches() {
    // A page bug or injected script could ask for any registry id; npm would then install an
    // unverified package with no cutoff and the app's whole environment.
    let fetches = AdapterFetches::default();
    for refused in ["agoragentic-acp", "amp-acp", "no-such-runtime"] {
        let answer = fetches.ensure(
            refused,
            move || panic!("the cache check heals on disk and must not run for {refused}"),
            move || panic!("must not fetch {refused}"),
        );
        assert_eq!(answer, Ok(AdapterReadiness::NotApplicable));
    }
}

#[test]
fn a_ready_cache_is_reused_without_a_fetch() {
    let fetches = AdapterFetches::default();
    let answer = fetches.ensure(
        "claude-acp",
        || CacheCheck::Ready,
        || panic!("must not fetch"),
    );
    assert_eq!(answer, Ok(AdapterReadiness::Ready));
    let answer = fetches.ensure(
        "claude-acp",
        || CacheCheck::NotApplicable,
        || panic!("must not fetch"),
    );
    assert_eq!(answer, Ok(AdapterReadiness::NotApplicable));
}

#[test]
fn a_failed_fetch_reaches_every_waiter_and_the_next_request_tries_again() {
    let fetches = AdapterFetches::default();
    let runs = Arc::new(AtomicUsize::new(0));
    let (run, release) = held_fetch(&runs);
    let first = {
        let fetches = fetches.clone();
        std::thread::spawn(move || fetches.ensure("claude-acp", || CacheCheck::Fetch, run))
    };
    wait_until(|| fetches.is_fetching("claude-acp"));
    let second = {
        let fetches = fetches.clone();
        std::thread::spawn(move || fetches.ensure("claude-acp", || CacheCheck::Fetch, || Ok(())))
    };
    std::thread::sleep(Duration::from_millis(20));
    release
        .send(Err(
            "adapter-fetch-failed:npm error code ENOTFOUND".to_string()
        ))
        .unwrap();
    let failure = Err("adapter-fetch-failed:npm error code ENOTFOUND".to_string());
    assert_eq!(first.join().unwrap(), failure);
    assert_eq!(second.join().unwrap(), failure);

    let retried = fetches.ensure("claude-acp", || CacheCheck::Fetch, || Ok(()));
    assert_eq!(
        retried,
        Ok(AdapterReadiness::Fetched),
        "a failure must not stick"
    );
}

#[test]
fn a_panicking_fetch_still_wakes_its_waiters() {
    let fetches = AdapterFetches::default();
    let answer = fetches.ensure("claude-acp", || CacheCheck::Fetch, || panic!("boom"));
    assert_eq!(answer, Err("adapter-fetch-failed:panicked".to_string()));
    assert!(!fetches.is_fetching("claude-acp"));
}

#[test]
fn runtimes_fetch_independently() {
    let fetches = AdapterFetches::default();
    let runs = Arc::new(AtomicUsize::new(0));
    let (run, release) = held_fetch(&runs);
    let claude = {
        let fetches = fetches.clone();
        std::thread::spawn(move || fetches.ensure("claude-acp", || CacheCheck::Fetch, run))
    };
    wait_until(|| fetches.is_fetching("claude-acp"));
    let codex = fetches.ensure("codex-acp", || CacheCheck::Fetch, || Ok(()));
    assert_eq!(
        codex,
        Ok(AdapterReadiness::Fetched),
        "codex waited on claude's download"
    );
    release.send(Ok(())).unwrap();
    assert_eq!(claude.join().unwrap(), Ok(AdapterReadiness::Fetched));
}

#[test]
fn the_fetch_fills_the_entry_the_session_launches_from_and_runs_no_agent() {
    let launch = npx_launch(&[
        "-y",
        "--before=2026-11-23T11:15:03.788Z",
        "@agentclientprotocol/claude-agent-acp@0.110.0",
        "--acp",
    ]);
    assert_eq!(
        fetch_args(&launch).unwrap(),
        vec![
            "-y",
            "--before=2026-11-23T11:15:03.788Z",
            "--package=@agentclientprotocol/claude-agent-acp@0.110.0",
            "--",
            "node",
            "--version",
        ],
        "npx keys its cache by the spec; the hardening flags must stay and the adapter must not run"
    );
    let installed = AcpLaunch {
        program: PathBuf::from("/usr/local/bin/claude-agent-acp"),
        args: vec![],
        path_env: String::new(),
    };
    assert_eq!(
        fetch_args(&installed),
        None,
        "a global install has nothing to fetch"
    );
}

#[test]
fn only_a_download_or_a_healed_entry_asks_for_a_fetch() {
    assert_eq!(
        CacheCheck::from_preflight(&NpxCachePreflight::FirstDownload),
        CacheCheck::Fetch
    );
    assert_eq!(
        CacheCheck::from_preflight(&NpxCachePreflight::HealedBrokenEntry {
            reason: "bin-links-missing"
        }),
        CacheCheck::Fetch
    );
    assert_eq!(
        CacheCheck::from_preflight(&NpxCachePreflight::CacheReady),
        CacheCheck::Ready
    );
    for passthrough in [
        NpxCachePreflight::NotNpx,
        NpxCachePreflight::CacheUnknown,
        NpxCachePreflight::HealFailed {
            reason: "bin-links-missing",
            error: "denied".to_string(),
        },
    ] {
        assert_eq!(
            CacheCheck::from_preflight(&passthrough),
            CacheCheck::NotApplicable
        );
    }
}

#[test]
fn a_failure_names_npm_s_error_not_its_log_path() {
    let lines: Vec<String> = [
        "npm warn exec The following package was not found and will be installed",
        "npm error code ENOTFOUND",
        "npm error network request to https://registry.npmjs.org/x failed",
        "npm error A complete log of this run can be found in: /Users/x/.npm/_logs/1.log",
    ]
    .map(String::from)
    .to_vec();
    assert_eq!(
        failure_line(&lines),
        "npm error code ENOTFOUND · npm error network request to https://registry.npmjs.org/x failed"
    );
    assert_eq!(failure_line(&["  killed  ".to_string()]), "killed");
    assert_eq!(failure_line(&[]), "exit-without-output");
}

#[test]
fn readiness_reaches_the_screen_under_its_serialized_name() {
    assert_eq!(
        serde_json::to_value(AdapterReadiness::NotApplicable).unwrap(),
        "not-applicable"
    );
    assert_eq!(
        serde_json::to_value(AdapterReadiness::Ready).unwrap(),
        "ready"
    );
    assert_eq!(
        serde_json::to_value(AdapterReadiness::Fetched).unwrap(),
        "fetched"
    );
}

#[cfg(unix)]
fn fake_npx(dir: &std::path::Path, body: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let program = dir.join("npx");
    std::fs::write(&program, format!("#!/bin/sh\n{body}\n")).unwrap();
    std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
    program
}

#[cfg(unix)]
fn plan_for(program: PathBuf, dir: &std::path::Path) -> FetchPlan {
    FetchPlan {
        runtime_id: "claude-acp".to_string(),
        launch: AcpLaunch {
            program,
            args: vec![
                "-y".into(),
                "@agentclientprotocol/claude-agent-acp@0.110.0".into(),
            ],
            path_env: "/usr/bin:/bin".to_string(),
        },
        entry: dir.join("entry"),
        working_dir: dir.to_path_buf(),
    }
}

#[cfg(unix)]
#[test]
fn the_runner_passes_the_fetch_arguments_and_reports_npm_s_failure() {
    let dir = crate::acp::test_support::scratch("adapter-fetch");
    let seen = dir.join("seen-args");
    let program = fake_npx(
        &dir,
        &format!(
            "printf '%s\\n' \"$@\" > '{}'\necho 'npm error code E404' >&2\necho 'npm error A complete log' >&2\nexit 1",
            seen.display()
        ),
    );
    let outcome = run_fetch(&plan_for(program, &dir), &|_| {}, &|_| {});
    assert_eq!(
        outcome,
        Err("adapter-fetch-failed:npm error code E404 · npm error A complete log".to_string())
    );
    assert_eq!(
        std::fs::read_to_string(&seen).unwrap(),
        "-y\n--package=@agentclientprotocol/claude-agent-acp@0.110.0\n--\nnode\n--version\n"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[cfg(unix)]
#[test]
fn the_runner_reports_the_bytes_received_while_npm_runs() {
    let dir = crate::acp::test_support::scratch("adapter-fetch-progress");
    let entry = dir.join("entry");
    let program = fake_npx(
        &dir,
        &format!(
            "mkdir -p '{entry}'\nhead -c 4096 /dev/zero > '{entry}/blob'\nsleep 1.5\nexit 0",
            entry = entry.display()
        ),
    );
    let reported = Mutex::new(Vec::new());
    let outcome = run_fetch(&plan_for(program, &dir), &|_| {}, &|bytes| {
        reported.lock().unwrap().push(bytes);
    });
    assert_eq!(outcome, Ok(()));
    assert!(
        reported.lock().unwrap().contains(&4096),
        "progress never measured the entry: {:?}",
        reported.lock().unwrap()
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_closing_app_starts_no_new_fetch() {
    let fetches = AdapterFetches::default();
    fetches.terminate_all();
    assert_eq!(
        fetches.ensure(
            "claude-acp",
            || CacheCheck::Fetch,
            || panic!("must not fetch")
        ),
        Err(APP_CLOSING.to_string())
    );
    assert_eq!(
        fetches.ensure(
            "claude-acp",
            || CacheCheck::Ready,
            || panic!("must not fetch")
        ),
        Ok(AdapterReadiness::Ready),
        "a ready cache still answers while closing"
    );
}

#[test]
fn a_vault_or_repo_package_bin_never_reaches_the_fetch_path() {
    assert_eq!(
        path_without_package_bins(
            "/vault/node_modules/.bin:/usr/local/bin::/repo/sub/node_modules/.bin:/opt/.bin:/usr/bin"
        ),
        "/usr/local/bin:/opt/.bin:/usr/bin"
    );
}

#[cfg(unix)]
#[test]
fn the_fetch_child_gets_the_session_s_environment_not_the_app_s() {
    let dir = crate::acp::test_support::scratch("adapter-fetch-env");
    let seen = dir.join("seen-env");
    // A key that would change the session's auth or registry if it leaked.
    std::env::set_var("ATLAS_ADAPTER_FETCH_PLANTED_KEY", "leaked");
    let program = fake_npx(&dir, &format!("/usr/bin/env > '{}'", seen.display()));
    let mut plan = plan_for(program, &dir);
    plan.launch.path_env = "/vault/node_modules/.bin:/usr/bin:/bin".to_string();
    assert_eq!(run_fetch(&plan, &|_| {}, &|_| {}), Ok(()));
    let env = std::fs::read_to_string(&seen).unwrap();
    assert!(
        !env.contains("ATLAS_ADAPTER_FETCH_PLANTED_KEY"),
        "the app environment leaked:\n{env}"
    );
    assert!(
        env.lines().any(|line| line == "PATH=/usr/bin:/bin"),
        "PATH kept a package bin:\n{env}"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[cfg(unix)]
#[test]
fn the_app_s_exit_ends_a_running_fetch_and_its_children() {
    let dir = crate::acp::test_support::scratch("adapter-fetch-exit");
    // npx stands in for npm: it forks a long-lived child, as an install does.
    let forked = dir.join("forked-pid");
    let program = fake_npx(
        &dir,
        &format!(
            "exec >/dev/null 2>&1\nsleep 30 &\necho $! > '{}'\nsleep 30",
            forked.display()
        ),
    );
    let plan = plan_for(program, &dir);
    let fetches = AdapterFetches::default();
    let recorder = fetches.clone();
    let waiter = {
        let fetches = fetches.clone();
        std::thread::spawn(move || {
            fetches.ensure(
                "claude-acp",
                || CacheCheck::Fetch,
                move || {
                    run_fetch(
                        &plan,
                        &|pid| recorder.record_pid("claude-acp", pid),
                        &|_| {},
                    )
                },
            )
        })
    };
    let recorded_pid = || {
        fetches
            .in_flight
            .lock()
            .unwrap()
            .get("claude-acp")
            .and_then(|job| *job.pid.lock().unwrap())
    };
    wait_until(|| recorded_pid().is_some());
    wait_until(|| {
        std::fs::read_to_string(&forked).is_ok_and(|text| text.trim().parse::<i32>().is_ok())
    });
    let forked_pid: libc::pid_t = std::fs::read_to_string(&forked)
        .unwrap()
        .trim()
        .parse()
        .unwrap();

    fetches.terminate_all();
    let outcome = waiter.join().unwrap();
    assert!(
        outcome.is_err(),
        "a killed fetch must not report success: {outcome:?}"
    );
    assert!(!fetches.is_fetching("claude-acp"));
    // Signal 0 probes whether npm's own child outlived the kill (only the group reaches it).
    wait_until(|| unsafe { libc::kill(forked_pid, 0) } != 0);
    let _ = std::fs::remove_dir_all(&dir);
}
