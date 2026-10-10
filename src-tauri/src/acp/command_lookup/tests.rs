use super::*;
use crate::acp::detection::detect_runtimes;
use crate::acp::test_support::{empty_dirs, probe_with};
use std::collections::HashSet;

#[test]
fn path_entries_come_before_our_guesses() {
    // The user's shell choice beats our guesses.
    let files = HashSet::new();
    let dirs = empty_dirs();
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    let path = std::env::join_paths([PathBuf::from("/from/path")]).unwrap();
    let out = candidate_bin_dirs(Some(Path::new("/home/me")), Some(&path), &probe, None, None);
    assert_eq!(out.first(), Some(&PathBuf::from("/from/path")));
    assert!(out.len() > 1, "well-known locations must be appended");
}

#[test]
fn nvm_versions_are_offered_newest_first() {
    // String sorting would put v9 after v24.
    let files = HashSet::new();
    let mut dirs = empty_dirs();
    dirs.insert(
        PathBuf::from("/home/me/.nvm/versions/node"),
        vec![
            "v9.11.2".into(),
            "v24.16.0".into(),
            "v20.11.1".into(),
            "not-a-version".into(),
        ],
    );
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    let out = nvm_bin_dirs(Path::new("/home/me"), &probe);
    assert_eq!(
        out,
        vec![
            PathBuf::from("/home/me/.nvm/versions/node/v24.16.0/bin"),
            PathBuf::from("/home/me/.nvm/versions/node/v20.11.1/bin"),
            PathBuf::from("/home/me/.nvm/versions/node/v9.11.2/bin"),
        ],
        "versions sort numerically descending and non-version names are dropped"
    );
}

/// nvm directories hold stale global CLIs the user's shell never runs.
#[cfg(not(windows))]
#[test]
fn a_stale_copy_in_an_old_nvm_version_does_not_beat_the_real_one() {
    let files: HashSet<PathBuf> = [
        "/home/me/.local/bin/claude",                      // the real one
        "/home/me/.nvm/versions/node/v22.15.0/bin/claude", // the stale copy
        "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
    ]
    .iter()
    .map(PathBuf::from)
    .collect();
    let mut dirs = empty_dirs();
    dirs.insert(
        PathBuf::from("/home/me/.nvm/versions/node"),
        vec!["v22.15.0".into(), "v24.16.0".into()],
    );
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    let out = detect_runtimes(Some(Path::new("/home/me")), None, &probe, None, None);
    let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
    assert_eq!(
        claude.cli_path.as_deref(),
        Some("/home/me/.local/bin/claude"),
        "picked a stale nvm copy, not the binary the user shell runs"
    );
}

/// The nvm default beats the newest, or the adapter runs on a different Node.
#[test]
fn the_nvm_default_alias_wins_over_the_newest_version() {
    let files: HashSet<PathBuf> = [
        "/home/me/.nvm/versions/node/v20.11.1/bin/npx",
        "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
    ]
    .iter()
    .map(PathBuf::from)
    .collect();
    let mut dirs = empty_dirs();
    dirs.insert(
        PathBuf::from("/home/me/.nvm/versions/node"),
        vec!["v20.11.1".into(), "v24.16.0".into()],
    );
    let alias = PathBuf::from("/home/me/.nvm/alias/default");
    let is_exec = |p: &Path| files.contains(p);
    let list = |p: &Path| dirs.get(p).cloned().unwrap_or_default();
    let read = |p: &Path| {
        if p == alias.as_path() {
            Some("v20.11.1\n".to_string())
        } else {
            None
        }
    };
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    let out = nvm_bin_dirs(Path::new("/home/me"), &probe);
    assert_eq!(
        out.first(),
        Some(&PathBuf::from("/home/me/.nvm/versions/node/v20.11.1/bin")),
        "the default version must come first"
    );
}

#[test]
fn resolve_command_returns_none_instead_of_a_guessed_path() {
    let files = HashSet::new();
    let dirs = empty_dirs();
    let (is_exec, list, read) = probe_with(&files, &dirs);
    let probe = FsProbe {
        is_executable: &is_exec,
        list_dir: &list,
        read_text: &read,
        login_ok: &|_, _, _, _| None,
    };
    assert_eq!(
        resolve_command("claude", &[PathBuf::from("/usr/bin")], &probe),
        None
    );
}

#[test]
fn managed_bin_dir_is_last_so_the_users_own_tool_wins() {
    let probe = FsProbe {
        is_executable: &|_: &Path| true,
        list_dir: &|_: &Path| Vec::new(),
        read_text: &|_: &Path| None,
        login_ok: &|_: &str, _: &Path, _: &[&str], _: &str| None,
    };
    let managed = PathBuf::from("/app-data/managed-node/bin");
    let path = std::env::join_paths([Path::new("/usr/local/bin")]).unwrap();
    let dirs = candidate_bin_dirs(None, Some(&path), &probe, Some(&managed), None);

    assert_eq!(
        dirs.last(),
        Some(&managed),
        "the app-managed directory is not last"
    );
    assert!(dirs.len() > 1);
}
