use super::*;
use crate::git::repo::find_repo_root;

#[test]
fn a_waited_command_drains_output_larger_than_a_pipe_buffer() {
    use std::process::Stdio;
    let mut child = Command::new("node")
        .args([
            "-e",
            "process.stdout.write('o'.repeat(200000)); process.stderr.write('e'.repeat(100000))",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let run = wait_with_deadline(
        &mut child,
        "probe",
        std::time::Duration::from_secs(20),
        "git-network-timeout",
        false,
    )
    .unwrap();
    assert!(run.success);
    assert_eq!(run.stdout.len(), 200_000);
    assert_eq!(run.stderr.len(), 100_000);
}

#[test]
fn validate_vault_dir_rejects_missing_path() {
    let err = validate_vault_dir("/path/does/not/exist/atlas").unwrap_err();
    assert!(!err.is_empty());
}

#[test]
fn every_runner_reads_paths_as_names_whatever_the_environment() {
    use std::ffi::OsStr;
    let cwd = std::env::temp_dir();
    for command in [
        hardened_base_command(),
        read_policy_command(&cwd, &["status"], false),
        read_policy_command(&cwd, &["log"], true),
    ] {
        let envs: HashMap<&OsStr, Option<&OsStr>> = command.get_envs().collect();
        assert_eq!(
            envs.get(OsStr::new("GIT_LITERAL_PATHSPECS")),
            Some(&Some(OsStr::new("1")))
        );
        for inherited in [
            "GIT_GLOB_PATHSPECS",
            "GIT_NOGLOB_PATHSPECS",
            "GIT_ICASE_PATHSPECS",
        ] {
            assert_eq!(
                envs.get(OsStr::new(inherited)),
                Some(&None),
                "{inherited} is removed"
            );
        }
    }
}

// Security regression: a hostile repository (vault or source) must not run code its git
// config asks for. Each test proves the fixture is live unhardened, then that the
// helper leaves no marker, so reintroducing the defect fails.

fn plain_git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

fn seed_identity(dir: &Path) {
    plain_git(dir, &["config", "user.email", "test@example.invalid"]);
    plain_git(dir, &["config", "user.name", "atlas test"]);
    plain_git(dir, &["config", "commit.gpgsign", "false"]);
    plain_git(dir, &["config", "core.autocrlf", "false"]);
}

/// A path for a git-config value or shell command, forward-slashed so it parses
/// and runs under git's bundled `sh` on Windows as well as unix; a backslash
/// Windows path is a bad config line and a mangled shell argument.
fn shell_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[test]
fn a_hostile_embedded_repo_config_does_not_execute_on_status() {
    let base = std::env::temp_dir().join(format!("atlas-sec-embedded-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let upstream = base.join("upstream");
    let objects = upstream.join("atlas/objects");
    let refs = upstream.join("atlas/refs/heads");
    fs::create_dir_all(&objects).unwrap();
    fs::create_dir_all(&refs).unwrap();
    // git drops empty dirs on commit; .keep keeps the embedded git dir valid.
    fs::write(objects.join(".keep"), b"").unwrap();
    fs::write(refs.join(".keep"), b"").unwrap();
    fs::write(upstream.join("atlas/HEAD"), b"ref: refs/heads/main\n").unwrap();
    fs::write(upstream.join("atlas/README.md"), b"# node\n").unwrap();
    let marker = base.join("EMBEDDED_EXECUTED");
    let config = format!(
        "[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tworktree = .\n\tfsmonitor = \"touch {}; false\"\n",
        shell_path(&marker)
    );
    fs::write(upstream.join("atlas/config"), config).unwrap();
    plain_git(&upstream, &["init", "-q"]);
    seed_identity(&upstream);
    plain_git(&upstream, &["add", "-A"]);
    plain_git(&upstream, &["commit", "-qm", "seed"]);

    let clone = base.join("clone");
    let out = Command::new("git")
        .args(["clone", "-q"])
        .arg(&upstream)
        .arg(&clone)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "clone: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let atlas = clone.join("atlas");
    let status_args = [
        "-c",
        "core.quotepath=false",
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        ".",
    ];

    let _ = Command::new("git")
        .args(status_args)
        .current_dir(&atlas)
        .output()
        .unwrap();
    assert!(
        marker.exists(),
        "fixture precondition: an unhardened git runs the embedded config"
    );
    fs::remove_file(&marker).unwrap();

    let _ = run_git(&atlas, &status_args);
    assert!(
        !marker.exists(),
        "hardened run_git must not execute a hostile embedded repo config"
    );
    assert!(
        find_repo_root(&atlas).unwrap().is_none(),
        "Atlas must treat a bare embedded repo as not-a-repo, not operate in it"
    );
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn a_hostile_local_fsmonitor_is_neutralised_on_status() {
    let base = std::env::temp_dir().join(format!("atlas-sec-fsmon-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let repo = base.join("repo");
    fs::create_dir_all(&repo).unwrap();
    plain_git(&repo, &["init", "-q"]);
    seed_identity(&repo);
    fs::write(repo.join("note.md"), b"# one\n").unwrap();
    plain_git(&repo, &["add", "-A"]);
    plain_git(&repo, &["commit", "-qm", "one"]);
    let marker = base.join("FSMON_EXECUTED");
    plain_git(
        &repo,
        &[
            "config",
            "core.fsmonitor",
            &format!("touch {}; false", shell_path(&marker)),
        ],
    );
    fs::write(repo.join("note.md"), b"# two\n").unwrap();
    let status_args = [
        "-c",
        "core.quotepath=false",
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        ".",
    ];

    let _ = Command::new("git")
        .args(status_args)
        .current_dir(&repo)
        .output()
        .unwrap();
    assert!(
        marker.exists(),
        "fixture precondition: fsmonitor fires unhardened"
    );
    fs::remove_file(&marker).unwrap();

    let run = run_git(&repo, &status_args).unwrap();
    assert!(run.success, "a normal repo's status still succeeds");
    assert!(
        !marker.exists(),
        "core.fsmonitor=false must suppress the hook even in a non-bare repo"
    );
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn a_hostile_clean_filter_is_neutralised_on_add() {
    let base = std::env::temp_dir().join(format!("atlas-sec-filter-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let repo = base.join("repo");
    fs::create_dir_all(&repo).unwrap();
    plain_git(&repo, &["init", "-q"]);
    seed_identity(&repo);
    fs::write(repo.join(".gitattributes"), b"*.md filter=evil\n").unwrap();
    fs::write(repo.join("note.md"), b"# one\n").unwrap();
    plain_git(&repo, &["add", "-A"]);
    plain_git(&repo, &["commit", "-qm", "one"]);
    let marker = base.join("CLEAN_FILTER_EXECUTED");
    plain_git(
        &repo,
        &[
            "config",
            "filter.evil.clean",
            &format!("sh -c 'touch {}; cat'", shell_path(&marker)),
        ],
    );
    fs::write(repo.join("note.md"), b"# two changed\n").unwrap();

    // Prove the clean filter fires on an unhardened add, in a fresh clone so the
    // module's per-directory filter cache never saw this path unhardened.
    let mirror = base.join("mirror");
    let out = Command::new("git")
        .args(["clone", "-q"])
        .arg(&repo)
        .arg(&mirror)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    // The clone carries .gitattributes but not the local filter config; recreate it.
    seed_identity(&mirror);
    plain_git(
        &mirror,
        &[
            "config",
            "filter.evil.clean",
            &format!("sh -c 'touch {}; cat'", shell_path(&marker)),
        ],
    );
    fs::write(mirror.join("note.md"), b"# two changed\n").unwrap();
    let _ = Command::new("git")
        .args(["add", "-A", "--", "."])
        .current_dir(&mirror)
        .output()
        .unwrap();
    assert!(
        marker.exists(),
        "fixture precondition: clean filter fires on an unhardened add"
    );
    fs::remove_file(&marker).unwrap();

    // The hardened helper discovers the repo-local filter and redirects it to an
    // identity passthrough, so the add stages the file without running the command.
    let run = run_git(&repo, &["add", "-A", "--", "."]).unwrap();
    assert!(run.success, "add still succeeds: {}", run.stderr);
    assert!(
        !marker.exists(),
        "a repo-local clean filter must not run under the hardened helper"
    );
    let staged = run_git(&repo, &["diff", "--cached", "--name-only"]).unwrap();
    assert!(
        staged.stdout.contains("note.md"),
        "the file is still staged: {:?}",
        staged.stdout
    );
    let _ = fs::remove_dir_all(&base);
}

// Writing an executable hook needs the unix mode bit; the runtime hooks
// hardening in `run_git` is platform-independent and always applies.
#[cfg(unix)]
fn write_hook(repo: &Path, name: &str, marker: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let hooks = repo.join(".git/hooks");
    fs::create_dir_all(&hooks).unwrap();
    let path = hooks.join(name);
    fs::write(&path, format!("#!/bin/sh\ntouch {}\n", marker.display())).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
}

#[cfg(unix)]
#[test]
fn a_hostile_repo_hook_does_not_run_on_a_non_commit_verb() {
    let base = std::env::temp_dir().join(format!("atlas-sec-hook-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let repo = base.join("repo");
    fs::create_dir_all(&repo).unwrap();
    plain_git(&repo, &["init", "-q"]);
    seed_identity(&repo);
    fs::write(repo.join("note.md"), b"# one\n").unwrap();
    plain_git(&repo, &["add", "-A"]);
    plain_git(&repo, &["commit", "-qm", "one"]);
    // post-checkout fires deterministically on `git checkout -- <path>`, the hook
    // family that a restore/checkout would run; status/diff share the same hooks
    // decision (any verb but commit), so blocking it here covers the no-click paths.
    let marker = base.join("POST_CHECKOUT");
    write_hook(&repo, "post-checkout", &marker);
    fs::write(repo.join("note.md"), b"# two\n").unwrap();

    let _ = Command::new("git")
        .args(["checkout", "--", "note.md"])
        .current_dir(&repo)
        .output()
        .unwrap();
    assert!(
        marker.exists(),
        "fixture: the hook fires on an unhardened checkout"
    );
    fs::remove_file(&marker).unwrap();

    fs::write(repo.join("note.md"), b"# three\n").unwrap();
    let _ = run_git(&repo, &["checkout", "--", "note.md"]);
    assert!(
        !marker.exists(),
        "a repo hook must not run on a non-commit verb (hooks are off for all but commit)"
    );
    let _ = fs::remove_dir_all(&base);
}

#[cfg(unix)]
#[test]
fn the_snapshot_commit_still_runs_a_rejecting_pre_commit_hook() {
    let base = std::env::temp_dir().join(format!("atlas-sec-precommit-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let repo = base.join("repo");
    fs::create_dir_all(&repo).unwrap();
    plain_git(&repo, &["init", "-q"]);
    seed_identity(&repo);
    fs::write(repo.join("note.md"), b"# one\n").unwrap();
    plain_git(&repo, &["add", "-A"]);
    plain_git(&repo, &["commit", "-qm", "one"]);
    let marker = base.join("PRE_COMMIT");
    {
        use std::os::unix::fs::PermissionsExt;
        let path = repo.join(".git/hooks/pre-commit");
        fs::create_dir_all(repo.join(".git/hooks")).unwrap();
        fs::write(
            &path,
            format!("#!/bin/sh\ntouch {}\nexit 1\n", marker.display()),
        )
        .unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
    }
    fs::write(repo.join("note.md"), b"# two\n").unwrap();
    plain_git(&repo, &["add", "-A"]);

    let run = run_git(&repo, &["commit", "-m", "snapshot"]).unwrap();
    assert!(
        marker.exists(),
        "the commit must run the user's pre-commit hook"
    );
    assert!(
        !run.success,
        "a rejecting hook must fail the commit for classify_git_error"
    );
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn a_filter_hidden_behind_include_path_or_worktree_config_is_still_neutralised() {
    for scope in ["include", "worktree"] {
        let base =
            std::env::temp_dir().join(format!("atlas-sec-filter-{scope}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let repo = base.join("repo");
        fs::create_dir_all(&repo).unwrap();
        plain_git(&repo, &["init", "-q"]);
        seed_identity(&repo);
        fs::write(repo.join(".gitattributes"), b"*.md filter=hidden\n").unwrap();
        fs::write(repo.join("note.md"), b"# one\n").unwrap();
        plain_git(&repo, &["add", "-A"]);
        plain_git(&repo, &["commit", "-qm", "one"]);
        let marker = base.join("HIDDEN_FILTER");
        let clean = format!("sh -c 'touch {}; cat'", shell_path(&marker));
        if scope == "include" {
            fs::write(
                repo.join(".git/extra.cfg"),
                format!("[filter \"hidden\"]\n\tclean = \"{clean}\"\n"),
            )
            .unwrap();
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
        fs::write(repo.join("note.md"), b"# two changed\n").unwrap();

        let run = run_git(&repo, &["add", "-A", "--", "."]).unwrap();
        assert!(run.success, "{scope}: add still succeeds: {}", run.stderr);
        assert!(
            !marker.exists(),
            "{scope}: a filter reachable only through {scope} scope must be neutralised"
        );
        let _ = fs::remove_dir_all(&base);
    }
}

#[test]
fn a_required_filter_still_lets_a_snapshot_succeed() {
    let base = std::env::temp_dir().join(format!("atlas-sec-required-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let repo = base.join("repo");
    fs::create_dir_all(&repo).unwrap();
    plain_git(&repo, &["init", "-q"]);
    seed_identity(&repo);
    fs::write(repo.join(".gitattributes"), b"*.md filter=keep\n").unwrap();
    fs::write(repo.join("note.md"), b"# one\n").unwrap();
    plain_git(&repo, &["add", "-A"]);
    plain_git(&repo, &["commit", "-qm", "one"]);
    // A required clean filter (as git-crypt configures): the override must satisfy
    // it, not empty its process and make `add` fail.
    plain_git(&repo, &["config", "filter.keep.clean", "sh -c 'cat'"]);
    plain_git(&repo, &["config", "filter.keep.required", "true"]);
    fs::write(repo.join("note.md"), b"# two changed\n").unwrap();

    let run = run_git(&repo, &["add", "-A", "--", "."]).unwrap();
    assert!(
        run.success,
        "a required filter must still let add succeed: {}",
        run.stderr
    );
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn every_runner_hands_git_the_rebuilt_search_path() {
    use std::ffi::OsStr;
    let cwd = std::env::temp_dir();
    let expected = git_search_path();
    assert!(!expected.is_empty());
    for command in [
        hardened_base_command(),
        read_policy_command(&cwd, &["commit", "-m", "x"], false),
        read_policy_command(&cwd, &["log"], true),
    ] {
        let envs: HashMap<&OsStr, Option<&OsStr>> = command.get_envs().collect();
        assert_eq!(
            envs.get(OsStr::new("PATH")),
            Some(&Some(expected.as_os_str()))
        );
    }
}

/// A home whose name holds the separator once emptied the whole PATH, and Git with
/// an empty PATH ran a `git` planted in the opened folder.
#[cfg(unix)]
#[test]
fn a_home_named_with_the_separator_never_empties_the_git_search_path() {
    use std::ffi::OsStr;
    let home = std::env::temp_dir().join("atlas-odd:home");
    let search_path = search_path_from(Some(&home), Some(OsStr::new("/usr/bin:/bin")));
    let entries: Vec<PathBuf> = std::env::split_paths(&search_path).collect();
    assert_eq!(entries.first(), Some(&PathBuf::from("/usr/bin")));
    assert!(entries.contains(&PathBuf::from("/bin")));
    assert!(entries.iter().all(|entry| !entry.starts_with(&home)));
}

#[test]
fn the_git_search_path_holds_no_relative_or_node_modules_bin_entry() {
    let base = std::env::temp_dir().join(format!("atlas-git-path-clean-{}", std::process::id()));
    let home = base.join("home");
    let kept = base.join("tools").join("bin");
    let path_env = std::env::join_paths([
        base.join("vault").join("node_modules").join(".bin"),
        PathBuf::from("node_modules").join(".bin"),
        PathBuf::from("relative").join("bin"),
        kept.clone(),
    ])
    .unwrap();

    let search_path = search_path_from(Some(&home), Some(&path_env));
    let entries: Vec<PathBuf> = std::env::split_paths(&search_path).collect();

    assert_eq!(entries.first(), Some(&kept), "the inherited PATH leads");
    assert!(entries.contains(&home.join(".local/bin")));
    for entry in &entries {
        assert!(entry.has_root(), "relative entry {entry:?}");
        assert!(!entry.ends_with("node_modules/.bin"), "{entry:?}");
    }
}

#[cfg(unix)]
#[test]
fn a_commit_hook_finds_a_program_installed_only_in_a_known_directory() {
    use std::ffi::OsStr;
    use std::os::unix::fs::PermissionsExt;
    let base = std::env::temp_dir().join(format!("atlas-git-hook-path-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let home = base.join("home");
    let tools = home.join(".local/bin");
    fs::create_dir_all(&tools).unwrap();
    let program = tools.join("atlas-fake-node");
    fs::write(&program, b"#!/bin/sh\nexit 0\n").unwrap();
    fs::set_permissions(&program, fs::Permissions::from_mode(0o755)).unwrap();

    let repo = base.join("repo");
    fs::create_dir_all(&repo).unwrap();
    plain_git(&repo, &["init", "-q"]);
    seed_identity(&repo);
    let hooks = repo.join(".git/hooks");
    fs::create_dir_all(&hooks).unwrap();
    let hook = hooks.join("pre-commit");
    fs::write(&hook, b"#!/bin/sh\nexec atlas-fake-node\n").unwrap();
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    fs::write(repo.join("note.md"), b"# one\n").unwrap();
    plain_git(&repo, &["add", "-A"]);

    // What a Dock launch inherits: the hook's program is in none of these.
    let launch_path = OsStr::new("/usr/bin:/bin");
    let commit = |path: &OsStr| {
        read_policy_command(&repo, &["commit", "-qm", "one"], false)
            .env("PATH", path)
            .output()
            .unwrap()
    };

    let bare = commit(launch_path);
    assert!(
        !bare.status.success(),
        "the fixture is live: the launch PATH alone cannot find the program"
    );
    let rebuilt = commit(&search_path_from(Some(&home), Some(launch_path)));
    assert!(
        rebuilt.status.success(),
        "the rebuilt PATH finds it: {}",
        String::from_utf8_lossy(&rebuilt.stderr)
    );
    let _ = fs::remove_dir_all(&base);
}
