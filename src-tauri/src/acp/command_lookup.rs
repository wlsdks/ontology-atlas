use std::ffi::OsStr;
use std::path::{Path, PathBuf};

type LoginProbe<'a> = dyn Fn(&str, &Path, &[&str], &str) -> Option<bool> + 'a;

/// Injected so tests judge without a real disk.
pub(crate) struct FsProbe<'a> {
    pub is_executable: &'a dyn Fn(&Path) -> bool,
    /// Empty when absent.
    pub list_dir: &'a dyn Fn(&Path) -> Vec<String>,
    /// Used only for nvm's default-version file.
    pub read_text: &'a dyn Fn(&Path) -> Option<String>,
    /// `None` means not asked (unknown). Production reads the exit code only.
    pub login_ok: &'a LoginProbe<'a>,
}

/// The user's default version first, then numeric descending: version directories
/// hold stale global CLIs the user's shell would never run.
fn nvm_bin_dirs(home: &Path, probe: &FsProbe<'_>) -> Vec<PathBuf> {
    let root = home.join(".nvm");
    let versions = root.join("versions").join("node");
    let mut found: Vec<(Vec<u64>, String, PathBuf)> = (probe.list_dir)(&versions)
        .into_iter()
        .filter_map(|name| {
            let parts = parse_version(&name)?;
            let dir = versions.join(&name).join("bin");
            Some((parts, name, dir))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));

    // An exact version or a prefix (`lts/*`, `24`) both match.
    let default = (probe.read_text)(&root.join("alias").join("default"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(default) = default {
        let wanted = parse_version(&default);
        if let Some(at) = found.iter().position(|(parts, name, _)| {
            name == &default
                || name.trim_start_matches('v') == default.trim_start_matches('v')
                || wanted
                    .as_ref()
                    .is_some_and(|w| parts.len() >= w.len() && parts[..w.len()] == w[..])
        }) {
            let chosen = found.remove(at);
            found.insert(0, chosen);
        }
    }

    found.into_iter().map(|(_, _, dir)| dir).collect()
}

fn parse_version(name: &str) -> Option<Vec<u64>> {
    let trimmed = name.strip_prefix('v').unwrap_or(name);
    let parts: Vec<u64> = trimmed
        .split('.')
        .map(|p| p.parse::<u64>().ok())
        .collect::<Option<Vec<u64>>>()?;
    if parts.is_empty() {
        None
    } else {
        Some(parts)
    }
}

/// Order is a contract: the inherited `PATH` first; well-known locations only fill gaps.
pub(crate) fn candidate_bin_dirs(
    home: Option<&Path>,
    path_env: Option<&OsStr>,
    probe: &FsProbe<'_>,
    // App-installed tools come last so the user's own installs win.
    managed_bin: Option<&Path>,
    // Last for the same reason.
    managed_node_bin: Option<&Path>,
) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let push = |dir: PathBuf, dirs: &mut Vec<PathBuf>| {
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    };

    if let Some(path) = path_env {
        for entry in std::env::split_paths(path) {
            if !entry.as_os_str().is_empty() && entry.has_root() {
                push(entry, &mut dirs);
            }
        }
    }

    #[cfg(windows)]
    {
        // Windows: the npm global shim and standard install path only.
        if let Some(appdata) = std::env::var_os("APPDATA") {
            push(PathBuf::from(appdata).join("npm"), &mut dirs);
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            push(
                PathBuf::from(local).join("Programs").join("nodejs"),
                &mut dirs,
            );
        }
    }

    #[cfg(not(windows))]
    for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        push(PathBuf::from(dir), &mut dirs);
    }

    if let Some(home) = home {
        // Single-purpose directories first.
        for rel in [
            ".local/bin", // the default location of the official claude install script
            ".bun/bin",
            ".volta/bin",
            ".asdf/shims",
            ".local/share/mise/shims",
            ".npm-global/bin",
            ".yarn/bin",
        ] {
            push(home.join(rel), &mut dirs);
        }
        // nvm version directories last: they hold stale global CLIs.
        for dir in nvm_bin_dirs(home, probe) {
            push(dir, &mut dirs);
        }
    }

    // App installs last, or the app would behave differently from the terminal.
    if let Some(bin) = managed_bin {
        push(bin.to_path_buf(), &mut dirs);
    }
    if let Some(bin) = managed_node_bin {
        push(bin.to_path_buf(), &mut dirs);
    }

    dirs
}

/// `None` when not found; a guessed path fails later with an unreadable error.
pub(crate) fn resolve_command(
    name: &str,
    dirs: &[PathBuf],
    probe: &FsProbe<'_>,
) -> Option<PathBuf> {
    #[cfg(windows)]
    let names: Vec<String> = ["", ".cmd", ".exe", ".bat"]
        .iter()
        .map(|ext| format!("{name}{ext}"))
        .collect();
    #[cfg(not(windows))]
    let names: Vec<String> = vec![name.to_string()];

    for dir in dirs {
        for candidate in &names {
            let path = dir.join(candidate);
            if (probe.is_executable)(&path) {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests;
