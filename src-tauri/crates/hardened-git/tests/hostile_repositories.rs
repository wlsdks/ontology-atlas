//! Security regression: a hostile repository must not run code its own `git` config asks for when
//! the server spawns `git` in it. Each test first proves the fixture is a live weapon under an
//! unhardened invocation, then that the hardened run leaves no marker. Reintroducing a defect
//! fails them. The markers are `touch`ed by a shell, so those tests run on Unix only.

mod support;

use std::path::Path;
use std::time::Duration;

use hardened_git::{clear_filter_cache, run_git, GitInvocation, GitOutput, GitRunError};
use support::{commit_note, isolated_environment, new_repository, plain_git_lenient, TempDir};

fn hardened(cwd: &Path, args: &[&str]) -> GitOutput {
    let owned: Vec<String> = args.iter().map(ToString::to_string).collect();
    let mut invocation = GitInvocation::new(cwd, &owned);
    invocation.environment = Some(isolated_environment());
    run_git(invocation).expect("hardened git runs")
}

#[cfg(unix)]
mod executing_config {
    use super::support::{plain_git, seed_identity};
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// A repository whose local config binds a clean filter to `*.md`: every `git` that stages a
    /// matching file runs the filter command.
    fn clean_filter_repository(base: &TempDir, marker: &Path) -> std::path::PathBuf {
        let repo = new_repository(base, "repo");
        std::fs::write(repo.join(".gitattributes"), "*.md filter=evil\n").expect("attributes");
        std::fs::write(repo.join("note.md"), "# one\n").expect("note");
        plain_git(&repo, &["add", "-A"]);
        plain_git(&repo, &["commit", "-qm", "one"]);
        plain_git(
            &repo,
            &[
                "config",
                "filter.evil.clean",
                &format!("sh -c 'touch {}; cat'", marker.display()),
            ],
        );
        std::fs::write(repo.join("note.md"), "# two changed\n").expect("changed note");
        repo
    }

    #[test]
    fn a_hostile_embedded_repo_config_does_not_execute_on_status() {
        let base = TempDir::new("embedded");
        clear_filter_cache();
        let upstream = base.join("upstream");
        std::fs::create_dir_all(upstream.join("atlas/objects")).expect("objects");
        std::fs::create_dir_all(upstream.join("atlas/refs/heads")).expect("refs");
        std::fs::write(upstream.join("atlas/objects/.keep"), "").expect("keep");
        std::fs::write(upstream.join("atlas/refs/heads/.keep"), "").expect("keep");
        std::fs::write(upstream.join("atlas/HEAD"), "ref: refs/heads/main\n").expect("head");
        std::fs::write(upstream.join("atlas/README.md"), "# node\n").expect("readme");
        let marker = base.join("EMBEDDED_EXECUTED");
        std::fs::write(
            upstream.join("atlas/config"),
            format!(
                "[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tworktree = .\n\tfsmonitor = \"touch {}; false\"\n",
                marker.display()
            ),
        )
        .expect("config");
        plain_git(&upstream, &["init", "-q"]);
        seed_identity(&upstream);
        plain_git(&upstream, &["add", "-A"]);
        plain_git(&upstream, &["commit", "-qm", "seed"]);
        let clone = base.join("clone");
        plain_git(
            base.path(),
            &[
                "clone",
                "-q",
                upstream.to_str().expect("utf8"),
                clone.to_str().expect("utf8"),
            ],
        );
        let atlas = clone.join("atlas");
        let status = [
            "-c",
            "core.quotepath=false",
            "status",
            "--porcelain",
            "--untracked-files=all",
            "--",
            ".",
        ];

        plain_git_lenient(&atlas, &status);
        assert!(
            marker.exists(),
            "fixture precondition: unhardened git runs the embedded config"
        );
        std::fs::remove_file(&marker).expect("remove marker");

        hardened(&atlas, &status);
        assert!(
            !marker.exists(),
            "hardened git must not execute a hostile embedded repo config"
        );
    }

    #[test]
    fn a_hostile_clean_filter_fires_on_an_unhardened_add_and_not_on_a_hardened_one() {
        let weapon = TempDir::new("filter-weapon");
        let weapon_marker = weapon.join("CLEAN_FILTER_EXECUTED");
        let weapon_repo = clean_filter_repository(&weapon, &weapon_marker);
        plain_git_lenient(&weapon_repo, &["add", "-A", "--", "."]);
        assert!(
            weapon_marker.exists(),
            "fixture precondition: the clean filter fires unhardened"
        );

        let base = TempDir::new("filter-fix");
        clear_filter_cache();
        let marker = base.join("CLEAN_FILTER_EXECUTED");
        let repo = clean_filter_repository(&base, &marker);
        let added = hardened(&repo, &["add", "-A", "--", "."]);
        assert!(
            added.success(),
            "add still succeeds: {}",
            added.stderr_text()
        );
        assert!(
            !marker.exists(),
            "a repo-local clean filter must not run under the hardened run"
        );
        let staged = hardened(&repo, &["diff", "--cached", "--name-only"]);
        assert!(
            staged.stdout_text().contains("note.md"),
            "the file is still staged"
        );
    }

    #[test]
    fn a_hostile_repo_hook_does_not_run_on_a_non_commit_verb() {
        let base = TempDir::new("hook");
        clear_filter_cache();
        let repo = new_repository(&base, "repo");
        commit_note(&repo);
        // `post-checkout` fires deterministically on a path checkout; every verb but commit shares
        // the same hooks-off decision, status included.
        let marker = base.join("POST_CHECKOUT");
        let hook = repo.join(".git/hooks/post-checkout");
        std::fs::write(&hook, format!("#!/bin/sh\ntouch {}\n", marker.display())).expect("hook");
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).expect("chmod");
        std::fs::write(repo.join("note.md"), "# two\n").expect("edit");

        plain_git_lenient(&repo, &["checkout", "--", "note.md"]);
        assert!(
            marker.exists(),
            "fixture: the hook fires on an unhardened checkout"
        );
        std::fs::remove_file(&marker).expect("remove marker");

        std::fs::write(repo.join("note.md"), "# three\n").expect("edit");
        hardened(&repo, &["checkout", "--", "note.md"]);
        assert!(!marker.exists(), "hooks must not run on a non-commit verb");
    }

    #[test]
    fn a_hook_still_runs_on_the_snapshot_commit() {
        let base = TempDir::new("commit-hook");
        clear_filter_cache();
        let repo = new_repository(&base, "repo");
        commit_note(&repo);
        let marker = base.join("PRE_COMMIT");
        let hook = repo.join(".git/hooks/pre-commit");
        std::fs::write(&hook, format!("#!/bin/sh\ntouch {}\n", marker.display())).expect("hook");
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).expect("chmod");
        std::fs::write(repo.join("note.md"), "# two\n").expect("edit");
        plain_git(&repo, &["add", "-A"]);

        let committed = hardened(&repo, &["commit", "-qm", "two"]);
        assert!(committed.success(), "{}", committed.stderr_text());
        assert!(
            marker.exists(),
            "the person's own pre-commit hook must run on a snapshot commit"
        );
    }

    fn hidden_filter_scenario(scope: &str) {
        let base = TempDir::new(scope);
        clear_filter_cache();
        let repo = new_repository(&base, "repo");
        std::fs::write(repo.join(".gitattributes"), "*.md filter=hidden\n").expect("attributes");
        commit_note(&repo);
        let marker = base.join("HIDDEN_FILTER");
        let clean = format!("sh -c 'touch {}; cat'", marker.display());
        if scope == "include" {
            std::fs::write(
                repo.join(".git/extra.cfg"),
                format!("[filter \"hidden\"]\n\tclean = \"{clean}\"\n"),
            )
            .expect("extra config");
            plain_git(&repo, &["config", "--local", "include.path", "extra.cfg"]);
        } else {
            plain_git(
                &repo,
                &["config", "--local", "extensions.worktreeConfig", "true"],
            );
            plain_git(
                &repo,
                &["config", "--worktree", "filter.hidden.clean", &clean],
            );
        }
        std::fs::write(repo.join("note.md"), "# two changed\n").expect("edit");

        let added = hardened(&repo, &["add", "-A", "--", "."]);
        assert!(
            added.success(),
            "add still succeeds: {}",
            added.stderr_text()
        );
        assert!(
            !marker.exists(),
            "a {scope}-scoped filter must be neutralised"
        );
    }

    #[test]
    fn a_filter_reachable_only_through_include_config_is_still_neutralised() {
        hidden_filter_scenario("include");
    }

    #[test]
    fn a_filter_reachable_only_through_worktree_config_is_still_neutralised() {
        hidden_filter_scenario("worktree");
    }

    #[test]
    fn a_required_filter_still_lets_a_hardened_add_succeed() {
        let base = TempDir::new("required");
        clear_filter_cache();
        let repo = new_repository(&base, "repo");
        std::fs::write(repo.join(".gitattributes"), "*.md filter=keep\n").expect("attributes");
        commit_note(&repo);
        plain_git(&repo, &["config", "filter.keep.clean", "sh -c 'cat'"]);
        plain_git(&repo, &["config", "filter.keep.required", "true"]);
        std::fs::write(repo.join("note.md"), "# two changed\n").expect("edit");

        let added = hardened(&repo, &["add", "-A", "--", "."]);
        assert!(
            added.success(),
            "a required filter must still let add succeed: {}",
            added.stderr_text()
        );
    }

    /// A partial clone fetches a missing object through the transport its own config names, here
    /// `remote.origin.uploadpack`; a read such as `ls-files` that needs `.gitignore` triggers it.
    /// Only an attacker-authored `.git` can carry this.
    fn lazy_fetch_repository(base: &TempDir, marker: &Path) -> std::path::PathBuf {
        let repo = new_repository(base, "repo");
        std::fs::write(repo.join(".gitignore"), "target/\n").expect("ignore");
        plain_git(&repo, &["add", ".gitignore"]);
        plain_git(&repo, &["commit", "-qm", "ignore"]);
        let blob = plain_git(&repo, &["rev-parse", "HEAD:.gitignore"])
            .trim()
            .to_string();
        plain_git(&repo, &["update-index", "--skip-worktree", ".gitignore"]);
        std::fs::remove_file(repo.join(".gitignore")).expect("remove ignore");
        let (fan, rest) = blob.split_at(2);
        std::fs::remove_file(repo.join(".git/objects").join(fan).join(rest)).expect("drop object");
        plain_git(&repo, &["config", "core.repositoryformatversion", "1"]);
        plain_git(&repo, &["config", "extensions.partialClone", "origin"]);
        plain_git(
            &repo,
            &[
                "config",
                "remote.origin.url",
                base.join("nowhere").to_str().expect("utf8"),
            ],
        );
        plain_git(&repo, &["config", "remote.origin.promisor", "true"]);
        plain_git(
            &repo,
            &[
                "config",
                "remote.origin.uploadpack",
                &format!("touch {} #", marker.display()),
            ],
        );
        // An untracked file makes the read judge it against `.gitignore`, the missing object.
        std::fs::create_dir_all(repo.join("target")).expect("target");
        std::fs::write(repo.join("target/out.js"), "export {};\n").expect("out");
        repo
    }

    #[test]
    fn a_hostile_partial_clone_cannot_run_its_transport_command_on_a_hardened_read() {
        let base = TempDir::new("lazy");
        clear_filter_cache();
        let marker = base.join("LAZY_FETCH_EXECUTED");
        let repo = lazy_fetch_repository(&base, &marker);
        let read = [
            "ls-files",
            "-z",
            "--others",
            "--ignored",
            "--exclude-standard",
            "--directory",
        ];
        plain_git_lenient(&repo, &read);
        assert!(
            marker.exists(),
            "fixture precondition: unhardened git fetches through the configured command"
        );
        std::fs::remove_file(&marker).expect("remove marker");
        hardened(&repo, &read);
        assert!(
            !marker.exists(),
            "a hardened read must not fetch a missing object"
        );
    }

    #[test]
    fn a_config_that_never_finishes_reading_refuses_the_run_instead_of_hanging() {
        let base = TempDir::new("stall");
        clear_filter_cache();
        let repo = new_repository(&base, "repo");
        let made = std::process::Command::new("mkfifo")
            .arg(repo.join(".git/pipe"))
            .status()
            .expect("mkfifo");
        assert!(made.success());
        plain_git(&repo, &["config", "include.path", "pipe"]);
        let args = vec!["status".to_string()];
        let mut invocation = GitInvocation::new(&repo, &args);
        invocation.environment = Some(isolated_environment());
        let error = run_git(invocation).expect_err("an unreadable config refuses the run");
        assert!(error.to_string().contains("did not finish"), "{error}");
        clear_filter_cache();
    }
}

#[test]
fn a_glob_is_a_name_not_a_pattern_under_the_hardened_run() {
    let base = TempDir::new("glob");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    std::fs::write(repo.join("a.md"), "a\n").expect("a");
    std::fs::write(repo.join("b.md"), "b\n").expect("b");

    let plain = plain_git_lenient(&repo, &["ls-files", "--others", "--", "*.md"]);
    assert!(
        plain.contains("a.md") && plain.contains("b.md"),
        "fixture: the glob matches unhardened"
    );
    let literal = hardened(&repo, &["ls-files", "--others", "--", "*.md"]);
    assert!(
        literal.stdout.is_empty(),
        "a glob names no file: {}",
        literal.stdout_text()
    );
}

#[test]
fn pathspec_magic_is_a_name_not_an_instruction_under_the_hardened_run() {
    let base = TempDir::new("magic");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    std::fs::write(repo.join("a.md"), "a\n").expect("a");

    let plain = plain_git_lenient(&repo, &["ls-files", "--others", "--", ":(glob)*.md"]);
    assert!(
        plain.contains("a.md"),
        "fixture: the magic matches unhardened"
    );
    let literal = hardened(&repo, &["ls-files", "--others", "--", ":(glob)*.md"]);
    assert!(literal.stdout.is_empty(), "{}", literal.stdout_text());
}

#[test]
fn an_option_like_file_name_after_the_dash_dash_is_a_path() {
    let base = TempDir::new("option-like");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    std::fs::write(repo.join("--output=planted"), "x\n").expect("option-like file");

    let listed = hardened(
        &repo,
        &["ls-files", "-z", "--others", "--", "--output=planted"],
    );
    assert_eq!(listed.stdout_text(), "--output=planted\0");
    assert!(!repo.join("planted").exists());
}

#[test]
fn an_inherited_repository_location_cannot_redirect_the_run() {
    let base = TempDir::new("redirect");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    let other = new_repository(&base, "other");
    commit_note(&other);

    let mut environment = isolated_environment();
    environment.push(("GIT_DIR".into(), other.join(".git").into_os_string()));
    environment.push(("GIT_WORK_TREE".into(), other.clone().into_os_string()));
    environment.push((
        "GIT_INDEX_FILE".into(),
        other.join(".git/index").into_os_string(),
    ));
    environment.push(("GIT_COMMON_DIR".into(), other.join(".git").into_os_string()));
    let args = vec!["rev-parse".to_string(), "--show-toplevel".to_string()];
    let mut invocation = GitInvocation::new(&repo, &args);
    invocation.environment = Some(environment);
    let output = run_git(invocation).expect("runs");
    assert_eq!(output.stdout_text().trim(), repo.to_string_lossy());
}

#[test]
fn inherited_pathspec_settings_that_conflict_with_literal_paths_do_not_break_the_run() {
    let base = TempDir::new("conflict");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    let mut environment = isolated_environment();
    environment.push(("GIT_GLOB_PATHSPECS".into(), "1".into()));
    environment.push(("GIT_NOGLOB_PATHSPECS".into(), "1".into()));
    environment.push(("GIT_ICASE_PATHSPECS".into(), "1".into()));
    let args: Vec<String> = ["status", "--porcelain", "--", "."]
        .map(String::from)
        .to_vec();
    let mut invocation = GitInvocation::new(&repo, &args);
    invocation.environment = Some(environment);
    let output = run_git(invocation).expect("runs");
    assert!(output.success(), "{}", output.stderr_text());
}

#[test]
fn a_run_past_its_output_bound_is_an_error_not_a_truncated_answer() {
    let base = TempDir::new("bound");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    let args = vec!["rev-parse".to_string(), "--git-dir".to_string()];
    let mut invocation = GitInvocation::new(&repo, &args);
    invocation.environment = Some(isolated_environment());
    invocation.max_output = 1;
    assert!(matches!(
        run_git(invocation),
        Err(GitRunError::OutputTooLarge)
    ));
}

#[test]
fn a_run_past_its_timeout_is_killed() {
    let base = TempDir::new("timeout");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    let args = vec!["status".to_string()];
    let mut invocation = GitInvocation::new(&repo, &args);
    invocation.environment = Some(isolated_environment());
    invocation.timeout = Some(Duration::ZERO);
    assert!(matches!(run_git(invocation), Err(GitRunError::TimedOut)));
}

#[test]
fn standard_input_reaches_git_and_is_then_closed() {
    let base = TempDir::new("stdin");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    let args = vec!["hash-object".to_string(), "--stdin".to_string()];
    let mut invocation = GitInvocation::new(&repo, &args);
    invocation.environment = Some(isolated_environment());
    invocation.stdin = Some(b"hello\n");
    let output = run_git(invocation).expect("runs");
    // The object name of the blob "hello\n".
    assert_eq!(
        output.stdout_text().trim(),
        "ce013625030ba8dba906f756967f9e9ca394464a"
    );
}

/// A config that names more than the pre-read can hold is refused whatever git's exit status was:
/// a flood must never leave a run without its filter guard. The limit is a parameter, so the test
/// plants a config the read cannot hold; it needs no shell and runs on every platform.
#[test]
fn a_config_read_that_reaches_its_limit_is_refused_not_trusted() {
    use hardened_git::discover_filter_overrides_with_limit;
    use hardened_git::HardeningError;

    let base = TempDir::new("config-limit");
    clear_filter_cache();
    let repo = new_repository(&base, "repo");
    support::plain_git(&repo, &["config", "filter.a.clean", "cat"]);
    // `filter.a.clean\n` is fifteen bytes, and git exits zero after writing it.
    assert_eq!(
        discover_filter_overrides_with_limit(&repo, 8),
        Err(HardeningError::ConfigReadUnfinished)
    );
    assert_eq!(
        discover_filter_overrides_with_limit(&repo, 14),
        Err(HardeningError::ConfigReadUnfinished),
        "one byte short"
    );
    let overrides =
        discover_filter_overrides_with_limit(&repo, 15).expect("a read that fits is trusted");
    assert!(overrides.contains(&"filter.a.clean=cat".to_string()));
}

/// Each weapon below is a repository the server could be pointed at: its own config makes `git`
/// run a program on a plain read. The first half of every test proves the fixture fires under an
/// unhardened `git`; the second that the hardened run leaves no marker.
#[cfg(unix)]
mod planted_weapons {
    use super::support::{commit_note, plain_git};
    use super::*;
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;
    use std::process::{Command, Stdio};

    fn write_script(path: &Path, marker: &Path) {
        std::fs::write(
            path,
            format!(
                "#!/bin/sh\nprintf executed > '{}'\ncat \"$1\" 2>/dev/null\nexit 0\n",
                marker.display()
            ),
        )
        .expect("script");
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    }

    /// A repository with one committed note and one uncommitted change to it.
    fn changed_note(base: &TempDir) -> std::path::PathBuf {
        let repo = new_repository(base, "repo");
        commit_note(&repo);
        std::fs::write(repo.join("note.md"), "# two\n").expect("change");
        repo
    }

    fn assert_fires_then_stays_quiet(
        label: &str,
        build: impl Fn(&TempDir, &Path) -> std::path::PathBuf,
        args: &[&str],
    ) {
        let weapon = TempDir::new(&format!("{label}-weapon"));
        let weapon_marker = weapon.join("EXECUTED");
        let weapon_repo = build(&weapon, &weapon_marker);
        plain_git_lenient(&weapon_repo, args);
        assert!(
            weapon_marker.exists(),
            "fixture precondition: {label} fires under an unhardened git"
        );

        let base = TempDir::new(&format!("{label}-fix"));
        clear_filter_cache();
        let marker = base.join("EXECUTED");
        let repo = build(&base, &marker);
        hardened(&repo, args);
        assert!(
            !marker.exists(),
            "{label} must not run under the hardened run"
        );
    }

    #[test]
    fn diff_external_program_does_not_run_on_a_hardened_diff() {
        assert_fires_then_stays_quiet(
            "diff-external",
            |base, marker| {
                let repo = changed_note(base);
                let program = base.join("external-diff.sh");
                write_script(&program, marker);
                plain_git(
                    &repo,
                    &["config", "diff.external", program.to_str().expect("utf8")],
                );
                repo
            },
            &["diff"],
        );
    }

    #[test]
    fn a_textconv_driver_does_not_run_on_a_hardened_diff() {
        assert_fires_then_stays_quiet(
            "textconv",
            |base, marker| {
                let repo = changed_note(base);
                std::fs::write(repo.join(".gitattributes"), "*.md diff=evil\n")
                    .expect("attributes");
                let program = base.join("textconv.sh");
                write_script(&program, marker);
                plain_git(
                    &repo,
                    &[
                        "config",
                        "diff.evil.textconv",
                        program.to_str().expect("utf8"),
                    ],
                );
                repo
            },
            &["diff"],
        );
    }

    #[test]
    fn a_signature_check_program_does_not_run_on_a_hardened_log() {
        assert_fires_then_stays_quiet(
            "show-signature",
            |base, marker| {
                let repo = new_repository(base, "repo");
                commit_note(&repo);
                let tree = plain_git(&repo, &["rev-parse", "HEAD^{tree}"]);
                let object = format!(
                    "tree {}\nauthor Fixture <fixture@example.invalid> 1700000000 +0000\ncommitter Fixture <fixture@example.invalid> 1700000000 +0000\ngpgsig -----BEGIN PGP SIGNATURE-----\n fixture\n -----END PGP SIGNATURE-----\n\nFixture\n",
                    tree.trim()
                );
                let mut hash = Command::new("git")
                    .args(["hash-object", "-t", "commit", "-w", "--stdin"])
                    .current_dir(&repo)
                    .env_clear()
                    .envs(isolated_environment())
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .spawn()
                    .expect("spawn hash-object");
                hash.stdin
                    .take()
                    .expect("stdin")
                    .write_all(object.as_bytes())
                    .expect("write commit object");
                let output = hash.wait_with_output().expect("hash-object");
                assert!(output.status.success());
                let commit = String::from_utf8(output.stdout).expect("utf8");
                plain_git(&repo, &["update-ref", "HEAD", commit.trim()]);
                let program = base.join("fake-gpg");
                write_script(&program, marker);
                plain_git(&repo, &["config", "log.showSignature", "true"]);
                plain_git(
                    &repo,
                    &["config", "gpg.program", program.to_str().expect("utf8")],
                );
                repo
            },
            &["log", "-1", "--format=%H"],
        );
    }

    #[test]
    fn an_ext_transport_does_not_run_on_a_hardened_network_verb() {
        assert_fires_then_stays_quiet(
            "ext-transport",
            |base, marker| {
                let repo = new_repository(base, "repo");
                commit_note(&repo);
                let program = base.join("ext-transport.sh");
                write_script(&program, marker);
                // The hostile config allows the transport git refuses by default.
                plain_git(&repo, &["config", "protocol.ext.allow", "always"]);
                plain_git(
                    &repo,
                    &[
                        "remote",
                        "add",
                        "origin",
                        &format!("ext::{}", program.display()),
                    ],
                );
                repo
            },
            &["ls-remote", "origin"],
        );
    }
}
