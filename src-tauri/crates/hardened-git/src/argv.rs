//! The argument list of a hardened `git` run.

use std::ffi::OsString;
use std::path::Path;

use crate::filter_overrides::filter_overrides_for;
use crate::HardeningError;

/// `safe.bareRepository=explicit` refuses a bare or embedded repository committed as tracked files
/// (which would also deliver that repository's config); `core.fsmonitor=false` blocks the
/// fsmonitor hook that fires on `status` with no click.
pub(crate) const BASE_HARDENING: [&str; 4] = [
    "-c",
    "safe.bareRepository=explicit",
    "-c",
    "core.fsmonitor=false",
];

/// Every path handed to `git` is a name a vault, repository or page chose, never pathspec magic or
/// a glob. `git` refuses this beside an inherited glob, noglob or icase setting, so a run is
/// spawned with [`crate::git_env`].
pub(crate) const LITERAL_PATHSPECS: &str = "--literal-pathspecs";

/// A person's `log.follow=true` makes `git log -- <one path>` follow renames, so a file's history
/// would silently include the history of the file it was renamed from. Every read asks for the
/// history of the name it gave, whatever the person configured.
const LOG_HARDENING: [&str; 2] = ["-c", "log.follow=false"];

/// Repository hooks run a repository-controlled command (`post-index-change` on `status`,
/// `post-checkout` on `restore`, `post-merge` on `pull`), so they are disabled for every verb
/// except the snapshot commit, which must run the person's own pre-commit hook.
const HOOKS_HARDENING: [&str; 2] = ["-c", "core.hooksPath=/dev/null"];

/// `ext::` transports run an arbitrary command; a hostile remote URL must not reach one.
const NETWORK_HARDENING: [&str; 2] = ["-c", "protocol.ext.allow=never"];

const DIFF_FAMILY: [&str; 3] = ["diff", "log", "show"];
const SIGNATURE_FAMILY: [&str; 2] = ["log", "show"];
const NETWORK_SUBCOMMANDS: [&str; 5] = ["fetch", "pull", "push", "clone", "ls-remote"];

/// The first token that is not an option: the `git` subcommand. `-c key=value` pairs are skipped.
pub fn subcommand_of<S: AsRef<str>>(args: &[S]) -> Option<&str> {
    let mut skip_value = false;
    for arg in args {
        let arg = arg.as_ref();
        if skip_value {
            skip_value = false;
            continue;
        }
        if arg == "-c" {
            skip_value = true;
            continue;
        }
        if arg.starts_with('-') {
            continue;
        }
        return Some(arg);
    }
    None
}

/// `diff`, `log` and `show` honour `diff.external`, per-driver `textconv` and (for `log` and
/// `show`) a signature program, all commands the repository's config supplies; each is disabled
/// right after the subcommand.
pub fn with_diff_family_guard<S: AsRef<str>>(args: &[S]) -> Vec<String> {
    let mut out: Vec<String> = Vec::with_capacity(args.len() + 3);
    let mut guarded = false;
    let mut skip_value = false;
    for arg in args {
        let arg = arg.as_ref();
        out.push(arg.to_string());
        if guarded {
            continue;
        }
        if skip_value {
            skip_value = false;
            continue;
        }
        if arg == "-c" {
            skip_value = true;
            continue;
        }
        if arg.starts_with('-') {
            continue;
        }
        if DIFF_FAMILY.contains(&arg) {
            out.push("--no-ext-diff".to_string());
            out.push("--no-textconv".to_string());
        }
        if SIGNATURE_FAMILY.contains(&arg) {
            out.push("--no-show-signature".to_string());
        }
        guarded = true;
    }
    out
}

/// The full argument list for a hardened `git` run against `cwd`. `args` is the subcommand and its
/// arguments, without a leading `-C`. Fails when the repository's config cannot be read in time.
pub fn hardened_git_argv<S: AsRef<str>>(
    cwd: &Path,
    args: &[S],
    network: bool,
) -> Result<Vec<OsString>, HardeningError> {
    let subcommand = subcommand_of(args);
    let is_network = network || subcommand.is_some_and(|name| NETWORK_SUBCOMMANDS.contains(&name));
    let mut argv: Vec<OsString> = Vec::with_capacity(args.len() + 16);
    argv.extend(BASE_HARDENING.iter().map(OsString::from));
    argv.push(OsString::from(LITERAL_PATHSPECS));
    argv.extend(LOG_HARDENING.iter().map(OsString::from));
    if subcommand != Some("commit") {
        argv.extend(HOOKS_HARDENING.iter().map(OsString::from));
    }
    if is_network {
        argv.extend(NETWORK_HARDENING.iter().map(OsString::from));
    }
    argv.extend(filter_overrides_for(cwd)?.iter().map(OsString::from));
    argv.push(OsString::from("-C"));
    argv.push(cwd.as_os_str().to_os_string());
    argv.extend(with_diff_family_guard(args).into_iter().map(OsString::from));
    Ok(argv)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(argv: &[OsString]) -> Vec<String> {
        argv.iter()
            .map(|item| item.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn the_subcommand_is_the_first_token_that_is_not_an_option_or_a_config_value() {
        assert_eq!(
            subcommand_of(&["-c", "core.quotepath=false", "status"]),
            Some("status")
        );
        assert_eq!(
            subcommand_of(&["--no-optional-locks", "log", "-1"]),
            Some("log")
        );
        assert_eq!(subcommand_of::<&str>(&[]), None);
        assert_eq!(subcommand_of(&["--version"]), None);
    }

    #[test]
    fn diff_log_and_show_lose_their_repository_supplied_programs() {
        assert_eq!(
            with_diff_family_guard(&["diff", "--cached"]),
            ["diff", "--no-ext-diff", "--no-textconv", "--cached"]
        );
        assert_eq!(
            with_diff_family_guard(&["-c", "a=b", "log", "-1"]),
            [
                "-c",
                "a=b",
                "log",
                "--no-ext-diff",
                "--no-textconv",
                "--no-show-signature",
                "-1"
            ]
        );
        assert_eq!(
            with_diff_family_guard(&["show", "HEAD"]),
            [
                "show",
                "--no-ext-diff",
                "--no-textconv",
                "--no-show-signature",
                "HEAD"
            ]
        );
    }

    #[test]
    fn a_word_that_names_a_diff_verb_after_the_subcommand_is_left_alone() {
        assert_eq!(
            with_diff_family_guard(&["status", "--", "diff", "log"]),
            ["status", "--", "diff", "log"]
        );
        assert_eq!(
            with_diff_family_guard(&["rev-parse", "show"]),
            ["rev-parse", "show"]
        );
    }

    #[test]
    fn option_like_and_magic_paths_stay_verbatim_after_the_dash_dash_and_the_folder() {
        let hostile = [
            "--output=/tmp/planted",
            "-rf",
            ":(top)x",
            ":(attr:filter=evil)*",
            "*.md",
            "--upload-pack=touch /tmp/planted",
        ];
        let mut args = vec!["ls-files", "-z", "--"];
        args.extend(hostile);
        let cwd = std::env::temp_dir();
        let argv = strings(&hardened_git_argv(&cwd, &args, false).expect("argv"));
        let literal = argv
            .iter()
            .position(|a| a == "--literal-pathspecs")
            .expect("literal");
        let folder = argv.iter().position(|a| a == "-C").expect("-C");
        let subcommand = argv
            .iter()
            .position(|a| a == "ls-files")
            .expect("subcommand");
        assert!(
            literal < folder && folder < subcommand,
            "global options precede the subcommand"
        );
        assert_eq!(argv[folder + 1], cwd.to_string_lossy());
        assert_eq!(argv[subcommand..], args);
    }

    #[test]
    fn a_folder_that_looks_like_an_option_is_one_value_of_dash_c() {
        let argv = strings(
            &hardened_git_argv(Path::new("--git-dir=/etc"), &["status"], false).expect("argv"),
        );
        let folder = argv.iter().position(|a| a == "-C").expect("-C");
        assert_eq!(argv[folder + 1], "--git-dir=/etc");
        assert_eq!(argv[folder + 2], "status");
    }

    #[test]
    fn every_verb_but_the_snapshot_commit_runs_with_hooks_off() {
        let cwd = std::env::temp_dir();
        let status = strings(&hardened_git_argv(&cwd, &["status"], false).expect("argv"));
        assert!(status.contains(&"core.hooksPath=/dev/null".to_string()));
        let commit =
            strings(&hardened_git_argv(&cwd, &["commit", "-m", "x"], false).expect("argv"));
        assert!(!commit.contains(&"core.hooksPath=/dev/null".to_string()));
        // A global option before the subcommand does not make `commit` look like another verb.
        let spaced =
            strings(&hardened_git_argv(&cwd, &["-c", "a=b", "commit"], false).expect("argv"));
        assert!(!spaced.contains(&"core.hooksPath=/dev/null".to_string()));
    }

    #[test]
    fn a_network_verb_cannot_reach_an_ext_transport() {
        let cwd = std::env::temp_dir();
        for verb in ["fetch", "pull", "push", "clone", "ls-remote"] {
            let argv = strings(&hardened_git_argv(&cwd, &[verb], false).expect("argv"));
            assert!(
                argv.contains(&"protocol.ext.allow=never".to_string()),
                "{verb}"
            );
        }
        let status = strings(&hardened_git_argv(&cwd, &["status"], false).expect("argv"));
        assert!(!status.contains(&"protocol.ext.allow=never".to_string()));
        let forced = strings(&hardened_git_argv(&cwd, &["status"], true).expect("argv"));
        assert!(forced.contains(&"protocol.ext.allow=never".to_string()));
    }

    #[test]
    fn every_run_refuses_a_bare_repository_the_fsmonitor_hook_and_a_followed_rename() {
        let argv =
            strings(&hardened_git_argv(&std::env::temp_dir(), &["status"], false).expect("argv"));
        assert!(argv.starts_with(&[
            "-c".to_string(),
            "safe.bareRepository=explicit".to_string(),
            "-c".to_string(),
            "core.fsmonitor=false".to_string(),
        ]));
        assert!(argv.contains(&"log.follow=false".to_string()));
    }
}
