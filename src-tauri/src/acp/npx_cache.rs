use std::path::{Path, PathBuf};

use super::launch::{adapter_bin_name, AcpLaunch};

// An interrupted first npx download leaves a half-made `~/.npm/_npx/<hash>/` that
// npx never repairs, so the entry is checked and deleted before launch. The hash is
// npm's first 16 hex of `sha512(<spec>)`; a formula change only makes the check fail open.

/// `npm_config_*` is stripped, so only `$HOME/.npmrc` `cache=` and the platform
/// default remain; a global npmrc is invisible and fails open.
pub(crate) fn npx_cache_root(home: Option<&Path>) -> Option<PathBuf> {
    let home = home?;
    if let Ok(text) = std::fs::read_to_string(home.join(".npmrc")) {
        for line in text.lines() {
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            // Exact key match, or `cache-min=` would redirect the search.
            if key.trim() != "cache" {
                continue;
            }
            let value = value.trim();
            if value.is_empty() {
                continue;
            }
            let base = match value.strip_prefix("~/") {
                Some(rest) => home.join(rest),
                None => PathBuf::from(value),
            };
            return Some(base.join("_npx"));
        }
    }
    let default_cache = if cfg!(windows) {
        home.join("AppData").join("Local").join("npm-cache")
    } else {
        home.join(".npm")
    };
    Some(default_cache.join("_npx"))
}

pub(crate) fn npx_cache_entry_dir(npx_cache_root: &Path, package: &str) -> PathBuf {
    use sha2::{Digest, Sha512};
    let digest = Sha512::digest(package.as_bytes());
    let hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    npx_cache_root.join(&hex[..16])
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum NpxEntryHealth {
    /// npx downloads it on first run.
    Missing,
    /// npx can reuse or recover it; leave it alone.
    Usable,
    /// npx cannot recover it.
    Broken(&'static str),
}

/// No marker means ours, since the path is our spec's hash; a marker for another
/// spec may be someone else's, so it is never touched.
fn npx_entry_owned(manifest: &serde_json::Value, package: &str) -> bool {
    match manifest
        .get("_npx")
        .and_then(|npx| npx.get("packages"))
        .and_then(|packages| packages.as_array())
    {
        Some(packages) => packages.iter().any(|entry| entry.as_str() == Some(package)),
        None => true,
    }
}

/// Broken when `package.json` fails to parse, or `node_modules` exists with an empty `.bin`.
/// Bin names are not checked: guessing them would delete healthy entries.
pub(crate) fn npx_entry_health(entry: &Path, package: &str) -> NpxEntryHealth {
    if !entry.exists() {
        return NpxEntryHealth::Missing;
    }
    let text = match std::fs::read_to_string(entry.join("package.json")) {
        Ok(text) => text,
        Err(_) => return NpxEntryHealth::Broken("package-json-missing"),
    };
    let manifest: serde_json::Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(_) => return NpxEntryHealth::Broken("package-json-unparseable"),
    };
    if !npx_entry_owned(&manifest, package) {
        return NpxEntryHealth::Usable;
    }
    let node_modules = entry.join("node_modules");
    if !node_modules.exists() {
        return NpxEntryHealth::Usable;
    }
    let has_bin = std::fs::read_dir(node_modules.join(".bin"))
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false);
    if !has_bin {
        return NpxEntryHealth::Broken("bin-links-missing");
    }
    NpxEntryHealth::Usable
}

/// Matches exactly the `npx -y [flags] <spec> …` shape `resolve_launch` builds.
pub(crate) fn npx_launch_package(launch: &AcpLaunch) -> Option<&str> {
    let stem = launch.program.file_stem()?.to_str()?;
    if !stem.eq_ignore_ascii_case("npx") {
        return None;
    }
    match launch.args.as_slice() {
        [flag, rest @ ..] if flag == "-y" => rest
            .iter()
            .find(|arg| !arg.starts_with('-'))
            .map(String::as_str),
        _ => None,
    }
}

/// Where the progress display measures size.
pub(crate) fn npx_cache_entry_for_launch(
    launch: &AcpLaunch,
    home: Option<&Path>,
) -> Option<PathBuf> {
    let package = npx_launch_package(launch)?;
    Some(npx_cache_entry_dir(&npx_cache_root(home)?, package))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum NpxCachePreflight {
    NotNpx,
    /// Fails open: launch as before.
    CacheUnknown,
    CacheReady,
    /// Tens of MB on first download.
    FirstDownload,
    HealedBrokenEntry {
        reason: &'static str,
    },
    /// Leaving it fails as before; the reason lets the UI diagnose it.
    HealFailed {
        reason: &'static str,
        error: String,
    },
}

/// Deletes only that one entry, never all of `_npx`, so other npx tools keep their cache.
pub(crate) fn preflight_npx_cache(launch: &AcpLaunch, home: Option<&Path>) -> NpxCachePreflight {
    let Some(package) = npx_launch_package(launch) else {
        return NpxCachePreflight::NotNpx;
    };
    let Some(root) = npx_cache_root(home) else {
        return NpxCachePreflight::CacheUnknown;
    };
    let entry = npx_cache_entry_dir(&root, package);
    match npx_entry_health(&entry, package) {
        NpxEntryHealth::Missing => NpxCachePreflight::FirstDownload,
        NpxEntryHealth::Usable => NpxCachePreflight::CacheReady,
        NpxEntryHealth::Broken(reason) => match std::fs::remove_dir_all(&entry) {
            Ok(()) => NpxCachePreflight::HealedBrokenEntry { reason },
            Err(err) => NpxCachePreflight::HealFailed {
                reason,
                error: err.to_string(),
            },
        },
    }
}

/// A ready entry's pinned bin, run without the idle `npm exec` parent.
pub(crate) fn launch_from_npx_cache(
    launch: &AcpLaunch,
    home: Option<&Path>,
    is_executable: &dyn Fn(&Path) -> bool,
) -> Option<AcpLaunch> {
    if !cfg!(unix) {
        return None;
    }
    let package = npx_launch_package(launch)?;
    let adapter_args = launch.args.iter().position(|arg| arg.as_str() == package)? + 1;
    let (name, pinned) = package
        .rsplit_once('@')
        .filter(|(name, _)| !name.is_empty())?;
    let modules = npx_cache_entry_dir(&npx_cache_root(home)?, package).join("node_modules");
    let package_dir = std::fs::canonicalize(modules.join(name)).ok()?;
    let manifest = std::fs::read_to_string(package_dir.join("package.json")).ok()?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest).ok()?;
    if manifest.get("version")?.as_str()? != pinned {
        return None;
    }
    let bin_name = adapter_bin_name(package)?;
    let declared = match manifest.get("bin")? {
        serde_json::Value::String(path) => path,
        bins => bins.get(&bin_name)?.as_str()?,
    };
    let target = std::fs::canonicalize(package_dir.join(declared)).ok()?;
    let bin_dir = modules.join(".bin");
    let program = bin_dir.join(&bin_name);
    if !target.starts_with(&package_dir)
        || std::fs::canonicalize(&program).ok()? != target
        || !is_executable(&program)
    {
        return None;
    }
    let inherited =
        std::env::split_paths(&launch.path_env).filter(|dir| !dir.as_os_str().is_empty());
    let path_env = std::env::join_paths(std::iter::once(bin_dir).chain(inherited))
        .ok()?
        .to_string_lossy()
        .to_string();
    Some(AcpLaunch {
        program,
        args: launch.args[adapter_args..].to_vec(),
        path_env,
    })
}

/// Only bytes received so far: the total is pinned nowhere. Symlinks are not followed.
pub(crate) fn dir_size_bytes(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut total = 0u64;
    for entry in entries.flatten() {
        let Ok(metadata) = entry.path().symlink_metadata() else {
            continue;
        };
        if metadata.is_dir() {
            total += dir_size_bytes(&entry.path());
        } else if metadata.is_file() {
            total += metadata.len();
        }
    }
    total
}

#[cfg(test)]
mod tests;
