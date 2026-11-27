//! The environment `git` is spawned with: no setting that conflicts with literal paths or relocates
//! the repository, and no fetch.

use std::ffi::{OsStr, OsString};

/// Refused beside `--literal-pathspecs`: `git` stops with an error when both are set.
const CONFLICTING_PATHSPEC_ENV: [&str; 3] = [
    "GIT_GLOB_PATHSPECS",
    "GIT_NOGLOB_PATHSPECS",
    "GIT_ICASE_PATHSPECS",
];

/// A repository location inherited from the parent (a `git` hook sets them) would point `git` at
/// another repository, index or work tree than the folder `-C` names.
const INHERITED_LOCATION_ENV: [&str; 4] = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
];

/// A local read must never fetch: in a partial clone a missing object is fetched through a
/// transport the repository's config names (`uploadpack`, `core.sshCommand`). The protocol list
/// also covers Git before 2.45.
const LOCAL_READ_ENV: [(&str, &str); 2] = [("GIT_NO_LAZY_FETCH", "1"), ("GIT_ALLOW_PROTOCOL", "")];

fn is_removed(name: &OsStr) -> bool {
    let matches = |listed: &&str| {
        if cfg!(windows) {
            name.to_string_lossy().eq_ignore_ascii_case(listed)
        } else {
            name == OsStr::new(listed)
        }
    };
    CONFLICTING_PATHSPEC_ENV.iter().any(matches) || INHERITED_LOCATION_ENV.iter().any(matches)
}

fn is_local_read_name(name: &OsStr) -> bool {
    LOCAL_READ_ENV.iter().any(|(listed, _)| {
        if cfg!(windows) {
            name.to_string_lossy().eq_ignore_ascii_case(listed)
        } else {
            name == OsStr::new(listed)
        }
    })
}

/// `env` without settings that conflict with literal paths or relocate the repository, and with no
/// fetch, since the server runs no network verb. `runs_user_hooks` (the snapshot commit) keeps
/// transports: its hooks are the person's own and may reach their remote.
pub fn git_env(
    env: impl IntoIterator<Item = (OsString, OsString)>,
    runs_user_hooks: bool,
) -> Vec<(OsString, OsString)> {
    let mut out: Vec<(OsString, OsString)> = env
        .into_iter()
        .filter(|(name, _)| !is_removed(name))
        .collect();
    if !runs_user_hooks {
        out.retain(|(name, _)| !is_local_read_name(name));
        out.extend(
            LOCAL_READ_ENV
                .iter()
                .map(|(name, value)| (OsString::from(name), OsString::from(value))),
        );
    }
    out
}

/// [`git_env`] over this process's own environment.
pub fn git_env_from_process(runs_user_hooks: bool) -> Vec<(OsString, OsString)> {
    git_env(std::env::vars_os(), runs_user_hooks)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pairs(items: &[(&str, &str)]) -> Vec<(OsString, OsString)> {
        items
            .iter()
            .map(|(name, value)| (OsString::from(name), OsString::from(value)))
            .collect()
    }

    fn sorted(mut env: Vec<(OsString, OsString)>) -> Vec<(OsString, OsString)> {
        env.sort();
        env
    }

    const INHERITED: [(&str, &str); 9] = [
        ("PATH", "/usr/bin"),
        ("GIT_TRACE", "0"),
        ("GIT_GLOB_PATHSPECS", "1"),
        ("GIT_NOGLOB_PATHSPECS", "1"),
        ("GIT_ICASE_PATHSPECS", "1"),
        ("GIT_DIR", "/elsewhere/.git"),
        ("GIT_WORK_TREE", "/elsewhere"),
        ("GIT_COMMON_DIR", "/elsewhere/.git"),
        ("GIT_INDEX_FILE", "/elsewhere/.git/index"),
    ];

    #[test]
    fn a_local_read_drops_conflicting_and_relocating_settings_and_cannot_fetch() {
        let env = git_env(pairs(&INHERITED), false);
        assert_eq!(
            sorted(env),
            sorted(pairs(&[
                ("PATH", "/usr/bin"),
                ("GIT_TRACE", "0"),
                ("GIT_NO_LAZY_FETCH", "1"),
                ("GIT_ALLOW_PROTOCOL", ""),
            ]))
        );
    }

    #[test]
    fn the_snapshot_commit_keeps_transports_for_the_persons_own_hooks() {
        let env = git_env(pairs(&INHERITED), true);
        assert_eq!(
            sorted(env),
            sorted(pairs(&[("PATH", "/usr/bin"), ("GIT_TRACE", "0")]))
        );
    }

    #[test]
    fn an_inherited_transport_allowance_is_replaced_not_kept() {
        let env = git_env(
            pairs(&[
                ("GIT_ALLOW_PROTOCOL", "ext:file"),
                ("GIT_NO_LAZY_FETCH", "0"),
            ]),
            false,
        );
        assert_eq!(
            sorted(env),
            sorted(pairs(&[
                ("GIT_NO_LAZY_FETCH", "1"),
                ("GIT_ALLOW_PROTOCOL", "")
            ]))
        );
    }

    #[test]
    fn an_injected_variable_with_a_similar_name_survives() {
        let env = git_env(pairs(&[("GIT_DIRECTORY", "x"), ("MY_GIT_DIR", "y")]), true);
        assert_eq!(env.len(), 2);
    }
}
