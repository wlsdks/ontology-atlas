use super::*;
use crate::acp::launch::resolve_launch;
use crate::acp::login_probe::{real_probe, LOGIN_PROBE};
use crate::acp::test_support::{
    empty_dirs, npx_package, probe_with, test_bin, test_path_env,
};
use std::collections::HashSet;

#[cfg(not(windows))]
#[test]
fn detects_a_runtime_that_lives_only_under_nvm() {
    // codex and npx under nvm, claude in ~/.local/bin: both outside a GUI app's PATH.
    let files: HashSet<PathBuf> = [
        "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
        "/home/me/.nvm/versions/node/v24.16.0/bin/codex",
        "/home/me/.local/bin/claude",
    ]
    .iter()
    .map(PathBuf::from)
    .collect();
    let mut dirs = empty_dirs();
    dirs.insert(
        PathBuf::from("/home/me/.nvm/versions/node"),
        vec!["v24.16.0".into()],
    );
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| Some(true),
    };

    let path =
        std::env::join_paths([PathBuf::from("/usr/bin"), PathBuf::from("/bin")]).unwrap();
    let out = detect_runtimes(Some(Path::new("/home/me")), Some(&path), &probe, None, None);

    let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
    assert_eq!(claude.state, "ready", "must be found outside PATH");
    assert_eq!(
        claude.cli_path.as_deref(),
        Some("/home/me/.local/bin/claude")
    );
    assert_eq!(
        claude.adapter_path.as_deref(),
        Some("/home/me/.nvm/versions/node/v24.16.0/bin/npx"),
        "without an installed adapter, launch through npx"
    );
    assert_eq!(
        claude.adapter_package.as_deref(),
        Some(npx_package("claude-acp")),
        "detection must return the package pinned in the registry"
    );

    let codex = out.iter().find(|r| r.id == "codex-acp").unwrap();
    assert_eq!(codex.state, "ready");
}

#[test]
fn missing_cli_and_missing_node_are_different_answers() {
    let mut files: HashSet<PathBuf> = HashSet::new();
    let dirs = empty_dirs();

    {
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, None, &probe, None, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(
            claude.state, "cli-missing",
            "a missing CLI wins because its next step is clearer"
        );
    }

    files.insert(test_bin("claude"));
    let path_env = test_path_env();
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
    let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
    assert_eq!(claude.state, "node-missing");
    assert_eq!(
        claude.cli_path,
        Some(test_bin("claude").to_string_lossy().to_string())
    );
}

/// Installed is not signed in; `ready` must wait for the login probe.
#[test]
fn installed_but_not_logged_in_is_not_ready() {
    let mut files: HashSet<PathBuf> = HashSet::new();
    files.insert(test_bin("claude"));
    files.insert(test_bin("npx"));
    let path_env = test_path_env();
    let dirs = empty_dirs();
    let (is_exec, list, read) = probe_with(&files, &dirs);

    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| Some(true),
    };
    let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
    let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
    assert_eq!(claude.state, "ready");

    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| Some(false),
    };
    let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
    let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
    assert_eq!(
        claude.state, "login-needed",
        "an installed but signed-out CLI must not report ready",
    );

    // Unknown is neither signed out nor ready.
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
    let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
    assert_eq!(
        claude.state, "login-unknown",
        "an unanswered probe is neither signed out nor ready",
    );
}

/// `login-unknown` still carries CLI and adapter paths.
#[test]
fn an_unknown_login_still_leaves_the_tool_launchable() {
    let mut files: HashSet<PathBuf> = HashSet::new();
    files.insert(test_bin("npx"));
    files.insert(test_bin("claude"));
    let path_env = test_path_env();
    let dirs = empty_dirs();
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
    let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
    assert_eq!(claude.state, "login-unknown");
    assert!(
        claude.cli_path.is_some(),
        "the detected CLI path must be kept"
    );
    assert!(
        claude.adapter_path.is_some(),
        "the adapter path must be kept"
    );
}

/// Never-measured runtimes stay `cli-unknown`; only asked ones can be `login-unknown`.
#[test]
fn we_never_asked_is_not_we_could_not_tell() {
    let mut files: HashSet<PathBuf> = HashSet::new();
    files.insert(test_bin("npx"));
    let path_env = test_path_env();
    let dirs = empty_dirs();
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
    assert!(
        out.iter().all(|s| s.state != "login-unknown"),
        "marked sign-in unknown on a runner that was never probed",
    );
}

#[test]
fn we_only_ask_about_runtimes_we_measured() {
    use std::cell::RefCell;
    let asked: RefCell<Vec<String>> = RefCell::new(Vec::new());
    let mut files: HashSet<PathBuf> = HashSet::new();
    files.insert(test_bin("npx"));
    for (id, _) in LOGIN_PROBE {
        let cli = registry()
            .iter()
            .find(|a| &a.id == id)
            .and_then(|a| a.cli.clone())
            .unwrap();
        files.insert(test_bin(&cli));
    }
    files.insert(test_bin("gemini"));
    let path_env = test_path_env();

    let dirs = empty_dirs();
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, path: &Path, _, _| {
            asked.borrow_mut().push(path.to_string_lossy().to_string());
            Some(true)
        },
    };
    detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);

    let asked = asked.borrow();
    assert_eq!(
        asked.len(),
        LOGIN_PROBE.len(),
        "probe count differs from the table: {asked:?}"
    );
    assert!(
        !asked.iter().any(|p| Path::new(p)
            .file_name()
            .is_some_and(|name| name == "gemini")),
        "probed a tool whose status argument was never measured",
    );
}

/// The probe gets the launch PATH, or the `claude` wrapper misses node and reads as signed out.
#[test]
fn login_probe_gets_the_same_path_we_launch_with() {
    use std::cell::RefCell;

    let seen: RefCell<Vec<String>> = RefCell::new(Vec::new());
    let mut files: HashSet<PathBuf> = HashSet::new();
    for (id, _) in LOGIN_PROBE {
        let cli = registry()
            .iter()
            .find(|a| &a.id == id)
            .and_then(|a| a.cli.clone())
            .unwrap();
        files.insert(PathBuf::from(format!("/nvm/bin/{cli}")));
    }

    let dirs = empty_dirs();
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let path_env = std::env::join_paths([PathBuf::from("/nvm/bin")]).unwrap();
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, child_path: &str| {
            seen.borrow_mut().push(child_path.to_string());
            Some(true)
        },
    };
    detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);

    let seen = seen.borrow();
    assert!(!seen.is_empty(), "no tool was probed");
    assert!(
        seen.iter().all(|p| p.contains("/nvm/bin")),
        "the detected location was not passed to the child: {seen:?}",
    );
}

/// Without a known CLI name, never "ready". No count is pinned; the registry grows.
#[test]
fn we_do_not_call_a_runtime_ready_when_we_never_checked_for_it() {
    let mut files: HashSet<PathBuf> = HashSet::new();
    files.insert(test_bin("npx"));
    let path_env = test_path_env();
    let dirs = empty_dirs();
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);

    for status in &out {
        let agent = registry().iter().find(|a| a.id == status.id).unwrap();
        if agent.cli.is_none() {
            // A launch reason such as `binary-missing` is fine; only "ready" is wrong.
            assert_ne!(
                status.state, "ready",
                "{}: reports ready without knowing its wrapped CLI",
                status.id,
            );
        } else {
            assert_eq!(status.state, "cli-missing", "{}", status.id);
        }
    }

    assert_eq!(
        out.iter().filter(|s| s.state == "ready").count(),
        0,
        "a machine with no known CLI reports ready",
    );
    // Guards against running over an empty set.
    assert!(
        out.iter().filter(|s| s.state == "cli-unknown").count() > 0,
        "cli-unknown must be non-zero for this check to guard anything",
    );
}

#[test]
fn an_installed_adapter_wins_over_npx() {
    let files: HashSet<PathBuf> = ["claude", "claude-agent-acp", "npx"]
        .iter()
        .map(|name| test_bin(name))
        .collect();
    let path_env = test_path_env();
    let dirs = empty_dirs();
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| Some(true),
    };
    let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
    let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
    assert_eq!(claude.state, "ready");
    assert_eq!(
        claude.adapter_path,
        Some(test_bin("claude-agent-acp").to_string_lossy().to_string()),
        "the installed adapter must be found"
    );
}

#[cfg(test)]
mod real_machine_probe {
    use super::*;

    /// Diagnostic against the real disk: `cargo test -- --ignored --nocapture`. Prints, never asserts.
    #[test]
    #[ignore]
    fn show_what_this_machine_has() {
        let (is_executable, list_dir, read_text, login_ok) = real_probe();
        let probe = FsProbe {
            is_executable: &is_executable,
            list_dir: &list_dir,
            read_text: &read_text,
            login_ok: &login_ok,
        };
        let home = std::env::var_os("HOME").map(PathBuf::from);
        // A GUI app's minimal PATH, not the terminal's.
        let gui_path =
            std::env::join_paths([PathBuf::from("/usr/bin"), PathBuf::from("/bin")]).unwrap();
        for r in detect_runtimes(home.as_deref(), Some(&gui_path), &probe, None, None) {
            println!(
                "{:>8} · {:<14} cli={:?} adapter={:?} verified={:?}",
                r.state, r.id, r.cli_path, r.adapter_path, r.verified
            );
        }
        println!("--- launch ---");
        for id in ["claude-acp", "codex-acp"] {
            match resolve_launch(id, home.as_deref(), Some(&gui_path), &probe, None, None) {
                Ok(l) => println!("{id}: {:?} {:?}", l.program, l.args),
                Err(e) => println!("{id}: failed {e}"),
            }
        }
    }
}

#[cfg(test)]
mod timing_probe {
    use super::*;

    /// Timing diagnostic; `--ignored` only.
    #[test]
    #[ignore]
    fn how_slow_is_detect() {
        let home = std::env::var_os("HOME").map(PathBuf::from);
        let path = std::env::var_os("PATH");
        let (is_executable, list_dir, read_text, login_ok) = real_probe();

        let skip = |_: &str, _: &Path, _: &[&str], _: &str| None;
        let fast = FsProbe {
            is_executable: &is_executable,
            list_dir: &list_dir,
            read_text: &read_text,
            login_ok: &skip,
        };
        let t = std::time::Instant::now();
        let out = detect_runtimes(home.as_deref(), path.as_deref(), &fast, None, None);
        println!("without probe: {:?} · {}", t.elapsed(), out.len());

        let full = FsProbe {
            is_executable: &is_executable,
            list_dir: &list_dir,
            read_text: &read_text,
            login_ok: &login_ok,
        };
        let t = std::time::Instant::now();
        let out = detect_runtimes(home.as_deref(), path.as_deref(), &full, None, None);
        println!("with probe: {:?} · {}", t.elapsed(), out.len());
    }
}

#[cfg(test)]
mod newcomer_view {
    use crate::acp::test_support::{empty_dirs, probe_with};
    use super::*;
    use std::collections::HashSet;

    /// What the screen shows a machine with nothing installed; diagnostic.
    #[test]
    #[ignore]
    fn what_a_newcomer_sees() {
        let files: HashSet<PathBuf> = HashSet::new(); // Nothing exists
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, None, &probe, None, None);
        let mut by_state: std::collections::BTreeMap<&str, Vec<&str>> = Default::default();
        for s in &out {
            by_state.entry(s.state.as_str()).or_default().push(&s.id);
        }
        println!("-- machine with nothing installed --");
        for (state, ids) in &by_state {
            println!(
                "  {state:16} {}  e.g. {}",
                ids.len(),
                ids.iter().take(3).cloned().collect::<Vec<_>>().join(", ")
            );
        }
        println!(
            "  verified on this computer = {}",
            out.iter().filter(|s| s.state == "ready").count()
        );

        // Only node, common among developers.
        let mut files: HashSet<PathBuf> = HashSet::new();
        files.insert(PathBuf::from("/usr/local/bin/npx"));
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, None, &probe, None, None);
        println!("-- machine with only npx --");
        let mut by_state: std::collections::BTreeMap<&str, usize> = Default::default();
        for s in &out {
            *by_state.entry(s.state.as_str()).or_default() += 1;
        }
        for (state, n) in &by_state {
            println!("  {state:16} {n}");
        }
        println!(
            "  verified = {}",
            out.iter().filter(|s| s.state == "ready").count()
        );
    }
}
