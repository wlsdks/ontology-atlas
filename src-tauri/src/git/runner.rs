use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};

use crate::acp::detection::command_lookup::{candidate_bin_dirs, FsProbe};
use crate::acp::detection::search_path::path_without_relative_or_node_modules_bin;
use crate::coded_error::coded;

#[cfg(test)]
mod tests;

// The path comes from the WebView; canonicalized as git's cwd so relative
// pathspecs cannot reach outside the vault.
pub(crate) fn validate_vault_dir(vault_path: &str) -> Result<PathBuf, String> {
    if vault_path.trim().is_empty() {
        return Err(coded("vault-path-empty", ""));
    }
    let path = PathBuf::from(vault_path);
    let metadata = fs::metadata(&path).map_err(|_| coded("vault-path-missing", ""))?;
    if !metadata.is_dir() {
        return Err(coded("vault-path-not-a-folder", ""));
    }
    let canonical = fs::canonicalize(&path).map_err(|err| coded("vault-path-unresolvable", err))?;
    // Git runs in the vault's directory; only a root the user granted may be one.
    if !crate::vault::grants::is_vault_granted(&canonical) {
        return Err(coded("vault-root-not-granted", ""));
    }
    Ok(canonical)
}

pub(super) struct GitRun {
    pub(super) success: bool,
    pub(super) stdout: String,
    pub(super) stderr: String,
}

/// Carried by every call so a hostile repo cannot run code via its config:
/// `safe.bareRepository=explicit` refuses a bare repo committed as tracked files (the
/// `<project>/atlas` path delivers config);`core.fsmonitor=false` blocks the no-click `status` hook.
/// Every call also reads its paths as plain names (`read_pathspecs_literally`).
const BASE_HARDENING: &[&str] = &[
    "-c",
    "safe.bareRepository=explicit",
    "-c",
    "core.fsmonitor=false",
];

/// Hooks run repo-controlled commands (`post-index-change` on no-click `status`,
/// `post-checkout` on `restore`, `post-merge` on `pull`), so every verb disables them
/// except snapshot `commit`, which runs the user's pre-commit hook (see `classify_git_error`).
const HOOKS_HARDENING: &[&str] = &["-c", "core.hooksPath=/dev/null"];

/// `ext::` remote transports run an arbitrary command; a hostile remote URL must
/// never reach one. Added on top of the base flags for network invocations.
const NETWORK_HARDENING: &[&str] = &["-c", "protocol.ext.allow=never"];

/// Every path handed to Git is a name a vault, repository or page chose, so it is
/// never pathspec magic or a glob. Git refuses the literal setting beside an
/// inherited glob, noglob or icase one, so those are removed.
fn read_pathspecs_literally(command: &mut Command) {
    command
        .env("GIT_LITERAL_PATHSPECS", "1")
        .env_remove("GIT_GLOB_PATHSPECS")
        .env_remove("GIT_NOGLOB_PATHSPECS")
        .env_remove("GIT_ICASE_PATHSPECS");
}

/// A Dock or Finder launch hands the app a minimal PATH, so a commit hook that runs
/// `node` fails with "command not found". Git gets the search path runtime detection
/// rebuilds from known install locations, never from a login shell (see `acp.rs`).
/// Rebuilt for every command (about 40 µs), so a Node installed while the app is open
/// is found by the next commit.
fn git_search_path() -> OsString {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    search_path_from(home.as_deref(), std::env::var_os("PATH").as_deref())
}

/// The app's own installs are left out: a hook must behave as it does in the terminal.
fn search_path_from(home: Option<&Path>, path_env: Option<&OsStr>) -> OsString {
    let (is_executable, list_dir, read_text, login_ok) =
        crate::acp::detection::login_probe::real_probe();
    let probe = FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &login_ok,
    };
    let dirs = candidate_bin_dirs(home, path_env, &probe, None, None);
    path_without_relative_or_node_modules_bin(&dirs)
}

/// A repository read through `hardened-git`, which carries the same hardening as this module's
/// runners, started with the search path the app's own runs use so a Dock launch still finds `git`.
pub(crate) fn hardened_repository(root: &Path) -> hardened_git::Repository {
    let repository = hardened_git::Repository::at(root);
    let search_path = git_search_path();
    if search_path.is_empty() {
        repository
    } else {
        repository.with_search_path(search_path)
    }
}

/// The root of every runner: base hardening, literal paths, no credential prompt.
fn git_command() -> Command {
    let mut command = Command::new("git");
    crate::child_process::no_console::hide_console(&mut command);
    // An empty PATH would make Git search its working folder; the inherited one stays.
    let search_path = git_search_path();
    if !search_path.is_empty() {
        command.env("PATH", search_path);
    }
    command.args(BASE_HARDENING);
    read_pathspecs_literally(&mut command);
    silence_git_credential_prompts(&mut command);
    command
}

/// A `git` command with the base + hooks hardening and prompt silencing applied.
/// Used by config discovery, the source inspector, and `git_probe` —
/// none of which run `commit`, so disabling hooks is always correct for them.
pub(crate) fn hardened_base_command() -> Command {
    let mut command = git_command();
    command.args(HOOKS_HARDENING);
    command
}

/// The first non-option token: the git subcommand. Skips `-c key=value` pairs.
fn subcommand_of<'a>(args: &[&'a str]) -> Option<&'a str> {
    let mut skip_value = false;
    for arg in args {
        if skip_value {
            skip_value = false;
            continue;
        }
        if *arg == "-c" {
            skip_value = true;
            continue;
        }
        if !arg.starts_with('-') {
            return Some(arg);
        }
    }
    None
}

/// Read commands must not run repository-controlled diff, textconv or signature programs.
pub(crate) fn with_diff_family_guard<'a>(args: &[&'a str]) -> Vec<&'a str> {
    let mut out: Vec<&str> = Vec::with_capacity(args.len() + 3);
    let mut guarded = false;
    let mut skip_value = false;
    for arg in args {
        out.push(arg);
        if guarded {
            continue;
        }
        if skip_value {
            skip_value = false;
            continue;
        }
        if *arg == "-c" {
            skip_value = true;
            continue;
        }
        if arg.starts_with('-') {
            continue;
        }
        if matches!(*arg, "diff" | "log" | "show") {
            out.push("--no-ext-diff");
            out.push("--no-textconv");
        }
        if matches!(*arg, "log" | "show") {
            out.push("--no-show-signature");
        }
        guarded = true;
    }
    out
}

/// Redirects every filter the repo defines to identity: git runs clean/smudge/process
/// filters on `add`/`commit`/`checkout` and no flag takes a wildcard. Found with the base
/// flags, so a hostile embedded repo is refused; cached per directory (config is stable).
fn filter_overrides_cache() -> &'static Mutex<HashMap<PathBuf, Arc<Vec<String>>>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, Arc<Vec<String>>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Adds every `filter.<name>` key from one config scope to `filters`, tracking
/// whether that name defines a `process` filter.
fn collect_filter_keys(cwd: &Path, scope_args: &[&str], filters: &mut Vec<(String, bool)>) {
    let output = hardened_base_command()
        .args(scope_args)
        .args(["--includes", "--name-only", "--get-regexp", "^filter\\."])
        .current_dir(cwd)
        .output();
    let Ok(output) = output else {
        return;
    };
    if !output.status.success() {
        return;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    for key in text.lines() {
        // key: filter.<name>.clean|smudge|process — name may contain dots.
        let Some(rest) = key.strip_prefix("filter.") else {
            continue;
        };
        let Some(dot) = rest.rfind('.') else {
            continue;
        };
        let (name, subkey) = (&rest[..dot], &rest[dot + 1..]);
        if name.is_empty() {
            continue;
        }
        let is_process = subkey == "process";
        if let Some(entry) = filters.iter_mut().find(|(n, _)| n == name) {
            entry.1 = entry.1 || is_process;
        } else {
            filters.push((name.to_string(), is_process));
        }
    }
}

fn worktree_config_enabled(cwd: &Path) -> bool {
    let output = hardened_base_command()
        .args([
            "config",
            "--local",
            "--includes",
            "--get",
            "extensions.worktreeConfig",
        ])
        .current_dir(cwd)
        .output();
    matches!(output, Ok(out) if out.status.success()
        && String::from_utf8_lossy(&out.stdout).trim() == "true")
}

fn discover_filter_overrides(cwd: &Path) -> Vec<String> {
    // Every scope the hostile repo controls: `--local --includes` sees filters from
    // `include.path`/`includeIf`, `--worktree` sees `config.worktree`. `--local` is
    // never dropped, so the user's global LFS or git-crypt filters keep working.
    let mut filters: Vec<(String, bool)> = Vec::new();
    collect_filter_keys(cwd, &["config", "--local"], &mut filters);
    if worktree_config_enabled(cwd) {
        collect_filter_keys(cwd, &["config", "--worktree"], &mut filters);
    }
    let mut overrides = Vec::with_capacity(filters.len() * 6);
    for (name, has_process) in filters {
        // Identity clean/smudge satisfy even a `required` filter (git-crypt), so a
        // person who encrypts their Markdown can still snapshot.
        overrides.push("-c".to_string());
        overrides.push(format!("filter.{name}.clean=cat"));
        overrides.push("-c".to_string());
        overrides.push(format!("filter.{name}.smudge=cat"));
        // Empty the process filter only when one is defined, so git falls back to the
        // identity clean/smudge above; setting it on a clean-only filter would make a
        // `required` filter fail.
        if has_process {
            overrides.push("-c".to_string());
            overrides.push(format!("filter.{name}.process="));
        }
    }
    overrides
}

fn filter_overrides_for(cwd: &Path) -> Arc<Vec<String>> {
    let mut cache = filter_overrides_cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(found) = cache.get(cwd) {
        return found.clone();
    }
    let overrides = Arc::new(discover_filter_overrides(cwd));
    cache.insert(cwd.to_path_buf(), overrides.clone());
    overrides
}

/// `Err` only when spawn fails; stderr is piped so it stays off the user's terminal.
/// Every invocation carries the base hardening, per-repo filter neutralisers, and
/// the diff-family guard so no call site can forget them.
pub(super) fn run_git(cwd: &Path, args: &[&str]) -> Result<GitRun, String> {
    let output = read_policy_command(cwd, args, false)
        .output()
        .map_err(|err| coded("git-not-runnable", err))?;
    Ok(GitRun {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

fn read_policy_command(cwd: &Path, args: &[&str], local_read: bool) -> Command {
    let mut command = git_command();
    if local_read {
        command
            .env("GIT_NO_LAZY_FETCH", "1")
            .env("GIT_ALLOW_PROTOCOL", "");
    }
    // Every verb but the snapshot commit runs with hooks off; commit keeps them so
    // the user's pre-commit hook still guards the write.
    if subcommand_of(args) != Some("commit") {
        command.args(HOOKS_HARDENING);
    }
    command.args(filter_overrides_for(cwd).iter());
    command
        .args(with_diff_family_guard(args))
        .current_dir(cwd)
        .env("GIT_OPTIONAL_LOCKS", "0");
    command
}

/// Guards against a credential helper or `SSH_ASKPASS` opening a window nobody
/// expects; the deadline is the real defence. `GIT_SSH_COMMAND` is left alone so a
/// user's `core.sshCommand` still applies.
fn silence_git_credential_prompts(command: &mut Command) {
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "");
}

/// Generous so a slow first pull finishes; it bounds a remote that accepts the
/// connection and then never answers, since git has no timeout of its own.
const NETWORK_GIT_DEADLINE: std::time::Duration = std::time::Duration::from_secs(120);

/// Spawns so the wait has a deadline and the whole attempt is killed on expiry.
pub(super) fn run_network_git(cwd: &Path, args: &[&str]) -> Result<GitRun, String> {
    use std::process::Stdio;

    // Network verbs are fetch/pull, never commit, so hooks stay off (a `pull` must not
    // run a hostile `post-merge`/`post-checkout` hook just because the user clicked it).
    let mut command = git_command();
    command.args(HOOKS_HARDENING);
    command.args(NETWORK_HARDENING);
    command.args(filter_overrides_for(cwd).iter());
    command
        .args(with_diff_family_guard(args))
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|err| coded("git-not-runnable", err))?;
    let label = args.first().copied().unwrap_or("command");
    wait_with_deadline(
        &mut child,
        label,
        NETWORK_GIT_DEADLINE,
        "git-network-timeout",
        false,
    )
}

/// A local command that may run the user's hooks (a commit) and so may never return: on Unix
/// it runs in its own process group, and on expiry the group is killed with every hook it started.
pub(super) fn run_git_with_deadline(
    cwd: &Path,
    args: &[&str],
    deadline: std::time::Duration,
) -> Result<GitRun, String> {
    use std::process::Stdio;

    let mut command = read_policy_command(cwd, args, false);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|err| coded("git-not-runnable", err))?;
    let label = subcommand_of(args).unwrap_or("command");
    wait_with_deadline(&mut child, label, deadline, "git-timeout", true)
}

pub(super) struct BoundedLines {
    pub(super) success: bool,
    /// The first lines, within `max_lines` and `max_bytes`.
    pub(super) kept: String,
    /// Lines read; a lower bound when `complete` is false.
    pub(super) lines: usize,
    pub(super) cut: bool,
    /// False when the output passed `ceiling` bytes and Git was stopped.
    pub(super) complete: bool,
}

/// A local read whose output is kept only up to `max_lines` and `max_bytes` and read at most
/// to `ceiling` bytes, so a huge diff never sits whole in memory.
pub(super) fn run_git_read_lines_bounded(
    cwd: &Path,
    args: &[&str],
    max_lines: usize,
    max_bytes: usize,
    ceiling: usize,
) -> Result<BoundedLines, String> {
    use std::io::BufRead;
    use std::process::Stdio;

    let mut command = read_policy_command(cwd, args, true);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|err| coded("git-not-runnable", err))?;
    let mut answer = BoundedLines {
        success: false,
        kept: String::new(),
        lines: 0,
        cut: false,
        complete: true,
    };
    if let Some(stdout) = child.stdout.take() {
        let mut reader = std::io::BufReader::new(stdout);
        let mut buffer = Vec::new();
        let mut read = 0usize;
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => read += count,
            }
            let text = String::from_utf8_lossy(&buffer);
            let line = text.strip_suffix('\n').unwrap_or(&text);
            let line = line.strip_suffix('\r').unwrap_or(line);
            if !answer.cut {
                if answer.lines >= max_lines || answer.kept.len() + line.len() + 1 > max_bytes {
                    answer.cut = true;
                } else {
                    answer.kept.push_str(line);
                    answer.kept.push('\n');
                }
            }
            answer.lines += 1;
            if read > ceiling {
                answer.complete = false;
                answer.cut = true;
                let _ = child.kill();
                break;
            }
        }
    }
    let status = child.wait().map_err(|err| coded("git-not-runnable", err))?;
    answer.success = status.success() || !answer.complete;
    Ok(answer)
}

/// The pipes drain while waiting, or output past their 64 KiB buffer blocks the child.
fn wait_with_deadline(
    child: &mut std::process::Child,
    label: &str,
    deadline: std::time::Duration,
    timeout_code: &str,
    own_group: bool,
) -> Result<GitRun, String> {
    let stdout = drain_pipe(child.stdout.take());
    let stderr = drain_pipe(child.stderr.take());
    let started = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Ok(GitRun {
                    success: status.success(),
                    stdout: collect_pipe(stdout),
                    stderr: collect_pipe(stderr),
                });
            }
            Ok(None) => {
                if started.elapsed() >= deadline {
                    kill_child(child, own_group);
                    let _ = child.wait();
                    return Err(coded(
                        timeout_code,
                        format!("git {label} did not finish within {}s", deadline.as_secs()),
                    ));
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(err) => return Err(coded("git-not-runnable", err)),
        }
    }
}

fn kill_child(child: &mut std::process::Child, own_group: bool) {
    #[cfg(unix)]
    {
        if own_group {
            if let Ok(group) = libc::pid_t::try_from(child.id()) {
                // SAFETY: the group is the one `process_group(0)` made, named by the child's own pid.
                unsafe { libc::killpg(group, libc::SIGKILL) };
                return;
            }
        }
    }
    #[cfg(not(unix))]
    let _ = own_group;
    let _ = child.kill();
}

fn drain_pipe<R: std::io::Read + Send + 'static>(
    pipe: Option<R>,
) -> Option<std::thread::JoinHandle<Vec<u8>>> {
    pipe.map(|mut pipe| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            bytes
        })
    })
}

fn collect_pipe(reader: Option<std::thread::JoinHandle<Vec<u8>>>) -> String {
    let bytes = reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    String::from_utf8_lossy(&bytes).into_owned()
}
