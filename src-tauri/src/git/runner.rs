use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};

use crate::errors::coded;

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
    if !crate::vault_grants::is_vault_granted(&canonical) {
        return Err(coded("vault-root-not-granted", ""));
    }
    Ok(canonical)
}

pub(super) struct GitRun {
    pub(super) success: bool,
    pub(super) stdout: String,
    pub(super) stderr: String,
}

/// Config that neutralises code execution driven by a repository's own git config
/// before git can honour a hostile repo's settings. The opened vault or connected
/// project source may be attacker-authored, so every invocation carries these.
/// `safe.bareRepository=explicit` makes git refuse a bare/embedded repo committed
/// as tracked files (the `<project>/atlas` open path, which also delivers a repo's
/// config), and `core.fsmonitor=false` blocks the fsmonitor hook that fires on
/// `status` with no click.
const BASE_HARDENING: &[&str] = &[
    "-c",
    "safe.bareRepository=explicit",
    "-c",
    "core.fsmonitor=false",
];

/// Repository hooks run a repo-controlled command. `post-index-change` fires on the
/// no-click `status`, `post-checkout` on `restore`, `post-merge` on `pull` — so
/// hooks are disabled for every verb except the explicit snapshot `commit`, which
/// must run the user's pre-commit hook (`classify_git_error` surfaces its rejection).
const HOOKS_HARDENING: &[&str] = &["-c", "core.hooksPath=/dev/null"];

/// `ext::` remote transports run an arbitrary command; a hostile remote URL must
/// never reach one. Added on top of the base flags for network invocations.
const NETWORK_HARDENING: &[&str] = &["-c", "protocol.ext.allow=never"];

/// A `git` command with the base + hooks hardening and prompt silencing applied.
/// Used by config discovery, the source inspector, and `git_probe` —
/// none of which run `commit`, so disabling hooks is always correct for them.
pub(crate) fn hardened_base_command() -> Command {
    let mut command = Command::new("git");
    command.args(BASE_HARDENING);
    command.args(HOOKS_HARDENING);
    silence_git_credential_prompts(&mut command);
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
pub(super) fn with_diff_family_guard<'a>(args: &[&'a str]) -> Vec<&'a str> {
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

/// Per-repository overrides that neutralise clean/smudge/process filters. A repo's
/// own config may bind an attribute to a filter whose command git runs on
/// `add`/`commit`/`checkout`; the base flags cannot express a wildcard, so each
/// filter the repo defines is redirected to an identity passthrough.
/// Computed once per working directory since a session's repo config is stable, and
/// discovered with the base flags so reading a hostile embedded repo is itself refused.
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
    // Every config scope the hostile repo controls. `--local --includes` also sees a
    // filter body pulled in with `include.path`/`includeIf`; the worktree scope sees
    // `.git/config.worktree` when the repo turns it on. `--local` is never dropped, so
    // the user's own global LFS or git-crypt filters keep working untouched.
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
    let mut command = Command::new("git");
    command.args(BASE_HARDENING);
    // Every verb but the snapshot commit runs with hooks off; commit keeps them so
    // the user's pre-commit hook still guards the write.
    if subcommand_of(args) != Some("commit") {
        command.args(HOOKS_HARDENING);
    }
    silence_git_credential_prompts(&mut command);
    command.args(filter_overrides_for(cwd).iter());
    command.args(with_diff_family_guard(args)).current_dir(cwd);
    let output = command
        .env("GIT_OPTIONAL_LOCKS", "0")
        .output()
        .map_err(|err| coded("git-not-runnable", err))?;
    Ok(GitRun {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
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
    let mut command = Command::new("git");
    command.args(BASE_HARDENING);
    command.args(HOOKS_HARDENING);
    command.args(NETWORK_HARDENING);
    silence_git_credential_prompts(&mut command);
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
    wait_with_deadline(&mut child, label, NETWORK_GIT_DEADLINE)
}

/// The pipes drain while waiting, or output past their 64 KiB buffer blocks the child.
fn wait_with_deadline(
    child: &mut std::process::Child,
    label: &str,
    deadline: std::time::Duration,
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
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(coded(
                        "git-network-timeout",
                        format!("git {label} did not finish within {}s", deadline.as_secs()),
                    ));
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(err) => return Err(coded("git-not-runnable", err)),
        }
    }
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
