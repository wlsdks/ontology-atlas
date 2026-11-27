//! Redirecting every filter a repository defines to an identity passthrough.
//!
//! A repository's config may bind an attribute to a filter whose command `git` runs on
//! add, commit and checkout, and no flag takes a wildcard. So the config is read once per folder,
//! every `filter.<name>` it names is found, and `git` is told to run `cat` for it instead.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::argv::{BASE_HARDENING, LITERAL_PATHSPECS};
use crate::environment::git_env_from_process;
use crate::runner::hide_console;
use crate::HardeningError;

/// A config pre-read past this is refused: an included named pipe never answers.
const CONFIG_READ_TIMEOUT: Duration = Duration::from_millis(5000);
const CONFIG_READ_POLL: Duration = Duration::from_millis(5);
const CONFIG_OUTPUT_LIMIT: u64 = 1024 * 1024;

type Cache = Mutex<HashMap<PathBuf, Arc<Vec<String>>>>;

fn cache() -> &'static Cache {
    static CACHE: OnceLock<Cache> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Repository config is discovered once per folder; clearing it lets a test rebuild a fixture
/// under the same path.
pub fn clear_filter_cache() {
    if let Ok(mut entries) = cache().lock() {
        entries.clear();
    }
}

/// `-c` pairs that make every filter the repository defines an identity passthrough. Cached per
/// folder, since a session's repository config is stable.
pub(crate) fn filter_overrides_for(cwd: &Path) -> Result<Arc<Vec<String>>, HardeningError> {
    if let Some(found) = cache()
        .lock()
        .ok()
        .and_then(|entries| entries.get(cwd).cloned())
    {
        return Ok(found);
    }
    let overrides = Arc::new(discover_filter_overrides(cwd)?);
    if let Ok(mut entries) = cache().lock() {
        entries.insert(cwd.to_path_buf(), Arc::clone(&overrides));
    }
    Ok(overrides)
}

struct FilterEntry {
    name: String,
    has_process: bool,
}

fn discover_filter_overrides(cwd: &Path) -> Result<Vec<String>, HardeningError> {
    // Every config scope the repository controls: `--local --includes` also sees a filter body
    // pulled in with `include.path` or `includeIf`, and the worktree scope sees
    // `.git/config.worktree` when the repository enables it. `--local` is never dropped, so the
    // person's own global LFS or git-crypt filters keep working.
    let mut filters: Vec<FilterEntry> = Vec::new();
    collect_filter_keys(cwd, &["--local"], &mut filters)?;
    if worktree_config_enabled(cwd)? {
        collect_filter_keys(cwd, &["--worktree"], &mut filters)?;
    }
    let mut overrides = Vec::with_capacity(filters.len() * 4);
    for FilterEntry { name, has_process } in filters {
        // Identity clean and smudge satisfy even a required filter (git-crypt).
        overrides.push("-c".to_string());
        overrides.push(format!("filter.{name}.clean=cat"));
        overrides.push("-c".to_string());
        overrides.push(format!("filter.{name}.smudge=cat"));
        // Empty the process filter only when one is defined, so `git` falls back to the identity
        // clean and smudge; an empty `process=` on a clean-only filter breaks a required one.
        if has_process {
            overrides.push("-c".to_string());
            overrides.push(format!("filter.{name}.process="));
        }
    }
    Ok(overrides)
}

/// Adds every `filter.<name>` key from one config scope to `filters`, tracking whether that name
/// defines a process filter.
fn collect_filter_keys(
    cwd: &Path,
    scope_args: &[&str],
    filters: &mut Vec<FilterEntry>,
) -> Result<(), HardeningError> {
    let mut args: Vec<&str> = scope_args.to_vec();
    args.extend(["--includes", "--name-only", "--get-regexp", "^filter\\."]);
    let Some(stdout) = read_config(cwd, &args)? else {
        return Ok(());
    };
    for line in stdout.split('\n') {
        let key = line.trim();
        let Some(rest) = key.strip_prefix("filter.") else {
            continue;
        };
        let Some(dot) = rest.rfind('.') else {
            continue;
        };
        if dot == 0 {
            continue;
        }
        let (name, last) = rest.split_at(dot);
        let is_process = last.get(1..) == Some("process");
        match filters.iter_mut().find(|entry| entry.name == name) {
            Some(existing) => existing.has_process = existing.has_process || is_process,
            None => filters.push(FilterEntry {
                name: name.to_string(),
                has_process: is_process,
            }),
        }
    }
    Ok(())
}

fn worktree_config_enabled(cwd: &Path) -> Result<bool, HardeningError> {
    let stdout = read_config(
        cwd,
        &[
            "--local",
            "--includes",
            "--get",
            "extensions.worktreeConfig",
        ],
    )?;
    Ok(stdout.is_some_and(|text| text.trim() == "true"))
}

/// One config pre-read. `Ok(None)` when `git` cannot answer (missing, or a non-zero status);
/// an error when it does not finish, so no `git` runs without its filter guard.
fn read_config(cwd: &Path, args: &[&str]) -> Result<Option<String>, HardeningError> {
    let mut command = Command::new("git");
    hide_console(&mut command);
    command
        .args(BASE_HARDENING)
        .arg(LITERAL_PATHSPECS)
        .arg("-C")
        .arg(cwd)
        .arg("config")
        .args(args)
        .env_clear()
        .envs(git_env_from_process(false))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let Ok(mut child) = command.spawn() else {
        return Ok(None);
    };
    let Some(stdout) = child.stdout.take() else {
        return Ok(None);
    };
    let reader = std::thread::spawn(move || {
        use std::io::Read;
        let mut text = Vec::new();
        let _ = stdout.take(CONFIG_OUTPUT_LIMIT).read_to_end(&mut text);
        text
    });
    let deadline = Instant::now() + CONFIG_READ_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(CONFIG_READ_POLL),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(HardeningError::ConfigReadUnfinished);
            }
        }
    };
    let text = reader.join().unwrap_or_default();
    if status.code().is_none() {
        // Ended by a signal.
        return Err(HardeningError::ConfigReadUnfinished);
    }
    if !status.success() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&text).into_owned()))
}
