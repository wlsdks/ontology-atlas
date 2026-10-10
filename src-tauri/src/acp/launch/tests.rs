use super::*;
use crate::acp::npx_cache::npx_launch_package;
use crate::acp::registry::snapshot;
use crate::acp::test_support::{
    empty_dirs, npx_package, probe_with, test_bin, test_path_env,
};
use std::collections::HashSet;

#[test]
fn launch_prefers_an_installed_adapter_and_falls_back_to_pinned_npx() {
    let mut files: HashSet<PathBuf> = ["claude", "npx"]
        .iter()
        .map(|name| test_bin(name))
        .collect();
    let dirs = empty_dirs();
    let path_env = test_path_env();

    {
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let launch = resolve_launch(
            "claude-acp",
            None,
            Some(path_env.as_os_str()),
            &probe,
            None,
            None,
        )
        .unwrap();
        assert_eq!(launch.program, test_bin("npx"));
        let cutoff = snapshot().npm_dependency_cutoff.as_deref().unwrap();
        assert_eq!(
            launch.args,
            vec![
                "-y".to_string(),
                format!("--before={cutoff}"),
                npx_package("claude-acp").to_string()
            ],
            "without an install, launch through version-pinned npx under the dependency cutoff"
        );
        assert_eq!(npx_launch_package(&launch), Some(npx_package("claude-acp")));
    }

    files.insert(test_bin("claude-agent-acp"));
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    let launch = resolve_launch(
        "claude-acp",
        None,
        Some(path_env.as_os_str()),
        &probe,
        None,
        None,
    )
    .unwrap();
    assert_eq!(launch.program, test_bin("claude-agent-acp"));
    assert!(launch.args.is_empty(), "an installed adapter skips npx");
}

#[cfg(not(windows))]
#[test]
fn launch_hands_the_child_a_path_that_can_find_the_real_cli() {
    // The adapter finds `claude` by name, so it needs the rebuilt PATH.
    let files: HashSet<PathBuf> = [
        "/home/me/.local/bin/claude",
        "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
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
        login_ok: &|_, _, _, _| None,
    };
    let launch = resolve_launch(
        "claude-acp",
        Some(Path::new("/home/me")),
        None,
        &probe,
        None,
        None,
    )
    .unwrap();
    assert!(
        launch.path_env.contains("/home/me/.local/bin"),
        "child PATH lacks the CLI directory: {}",
        launch.path_env
    );
    assert!(
        launch
            .path_env
            .contains("/home/me/.nvm/versions/node/v24.16.0/bin"),
        "child PATH lacks the node directory: {}",
        launch.path_env
    );
}

#[test]
fn launch_reports_which_half_is_missing() {
    let dirs = empty_dirs();
    let path_env = test_path_env();

    let none: HashSet<PathBuf> = HashSet::new();
    let (is_exec, list, read) = probe_with(&none, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    assert!(resolve_launch(
        "claude-acp",
        None,
        Some(path_env.as_os_str()),
        &probe,
        None,
        None
    )
    .unwrap_err()
    .starts_with("cli-missing:"));

    let cli_only: HashSet<PathBuf> = [test_bin("claude")].into_iter().collect();
    let (is_exec, list, read) = probe_with(&cli_only, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    assert_eq!(
        resolve_launch(
            "claude-acp",
            None,
            Some(path_env.as_os_str()),
            &probe,
            None,
            None
        )
        .unwrap_err(),
        "node-missing"
    );

    assert!(
        resolve_launch("nope", None, Some(path_env.as_os_str()), &probe, None, None)
            .unwrap_err()
            .starts_with("unknown-runtime:")
    );
}

#[test]
fn adapter_bin_name_strips_scope_and_version() {
    assert_eq!(
        adapter_bin_name("@agentclientprotocol/claude-agent-acp@0.68.0").as_deref(),
        Some("claude-agent-acp")
    );
    assert_eq!(
        adapter_bin_name("codex-acp@1.3.0").as_deref(),
        Some("codex-acp")
    );
    assert_eq!(adapter_bin_name("plain").as_deref(), Some("plain"));
}
