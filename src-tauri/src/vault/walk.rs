use super::scope::resolve_existing_inside;
use notify_debouncer_full::DebouncedEvent;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TauriVaultEntry {
    name: String,
    kind: String,
}

pub(super) fn metadata_mtime_ms(path: &Path) -> Result<u128, String> {
    let metadata = fs::metadata(path).map_err(|err| err.to_string())?;
    let modified = metadata.modified().map_err(|err| err.to_string())?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis())
}

/// One `stat` instead of two per file.
fn metadata_stamp(path: &Path) -> Result<(u128, u64), String> {
    let metadata = fs::metadata(path).map_err(|err| err.to_string())?;
    let modified = metadata.modified().map_err(|err| err.to_string())?;
    let millis = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis();
    Ok((millis, metadata.len()))
}

#[tauri::command(async)]
pub(crate) fn list_vault_directory(
    root_path: String,
    relative_path: String,
    include_links: Option<bool>,
) -> Result<Vec<TauriVaultEntry>, String> {
    let dir = resolve_existing_inside(&root_path, &relative_path)?;
    let entries = fs::read_dir(dir).map_err(|err| err.to_string())?;
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let file_type = entry.file_type().map_err(|err| err.to_string())?;
        let kind = if file_type.is_symlink() {
            if include_links != Some(true) {
                continue;
            }
            "symlink"
        } else if file_type.is_dir() {
            "directory"
        } else if file_type.is_file() {
            "file"
        } else {
            continue;
        };
        out.push(TauriVaultEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            kind: kind.into(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Path and mtime only, never content.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultStamp {
    relative_path: String,
    last_modified: u128,
    /// From directory metadata; reading the file would undo this command's purpose.
    size: u64,
}

/// Truncation and pruning are returned, not hidden.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultFingerprint {
    entries: Vec<VaultStamp>,
    truncated: bool,
    pruned_dirs: Vec<String>,
}

/// Must equal TS `VAULT_WALK_MAX_DEPTH`; a contract test watches it.
const VAULT_WALK_MAX_DEPTH: usize = 12;
/// Same value as TS `VAULT_WALK_MAX_ENTRIES`.
const VAULT_WALK_MAX_ENTRIES: usize = 100000;
/// Same list as TS `PRUNE_BY_NAME`.
const VAULT_PRUNE_DIR_NAMES: &[&str] = &["node_modules"];
/// Same value as TS `CACHE_DIR_TAG`.
const VAULT_CACHE_DIR_TAG: &str = "CACHEDIR.TAG";
/// Same extension set as TS `IMAGE_EXT` (lowercase comparison).
const VAULT_IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"];
/// Same value as TS `VAULT_SOURCES_DIR`. Raw sources are listed by name, size and
/// mtime but never parsed, so any format can sit in the vault (`docs/DECISIONS.md`).
const VAULT_SOURCES_DIR: &str = "sources";

/// Anchored at the top level: `notes/sources/a.pdf` is not a raw source.
fn vault_relative_is_source(relative: &str) -> bool {
    relative
        .strip_prefix(VAULT_SOURCES_DIR)
        .is_some_and(|rest| rest.starts_with('/'))
}

fn vault_entry_is_tracked(name: &str) -> bool {
    if name.ends_with(".md") {
        return true;
    }
    match name.rsplit_once('.') {
        Some((_, ext)) => VAULT_IMAGE_EXTS.contains(&ext.to_ascii_lowercase().as_str()),
        None => false,
    }
}

const VAULT_AGENT_CONFIG_FILES: &[&str] = &[".mcp.json", ".mcp.json.example", ".codex/config.toml"];

/// macOS reports a folder moved in, out or renamed only on the folder's own path, so a walked
/// path that is no longer a regular file counts too.
fn vault_change_is_visible(root: &Path, path: &Path) -> bool {
    if path.extension().is_some_and(|ext| ext == "md") {
        return true;
    }
    let Ok(relative) = path.strip_prefix(root) else {
        return false;
    };
    let relative = relative.to_string_lossy().replace('\\', "/");
    if relative.starts_with(".ontology-atlas/")
        || VAULT_AGENT_CONFIG_FILES.contains(&relative.as_str())
    {
        return true;
    }
    let mut parts = relative.split('/');
    let name = parts.next_back().unwrap_or_default();
    let walked = parts.all(|part| !part.starts_with('.') && !VAULT_PRUNE_DIR_NAMES.contains(&part));
    if !walked || name.starts_with('.') || VAULT_PRUNE_DIR_NAMES.contains(&name) {
        return false;
    }
    vault_entry_is_tracked(name)
        || vault_relative_is_source(&relative)
        || !fs::symlink_metadata(path).is_ok_and(|metadata| metadata.is_file())
}

pub(super) fn vault_batch_is_visible(root: &Path, events: &[DebouncedEvent]) -> bool {
    events.iter().any(|event| {
        event.need_rescan()
            || event
                .paths
                .iter()
                .any(|path| vault_change_is_visible(root, path))
    })
}

fn walk_vault_stamps(
    dir: &Path,
    prefix: &str,
    depth: usize,
    acc: &mut VaultFingerprint,
) -> Result<(), String> {
    if acc.truncated {
        return Ok(());
    }
    if depth > VAULT_WALK_MAX_DEPTH {
        acc.truncated = true;
        return Ok(());
    }

    // The cache-tag judgment needs the whole listing.
    let mut children: Vec<(String, bool)> = Vec::new();
    for entry in fs::read_dir(dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let file_type = entry.file_type().map_err(|err| err.to_string())?;
        if !file_type.is_dir() && !file_type.is_file() {
            continue;
        }
        children.push((
            entry.file_name().to_string_lossy().to_string(),
            file_type.is_dir(),
        ));
    }

    if children.iter().any(|(name, _)| name == VAULT_CACHE_DIR_TAG) {
        acc.pruned_dirs.push(if prefix.is_empty() {
            ".".into()
        } else {
            prefix.into()
        });
        return Ok(());
    }

    for (name, is_dir) in children {
        if acc.entries.len() >= VAULT_WALK_MAX_ENTRIES {
            acc.truncated = true;
            return Ok(());
        }
        if name.starts_with('.') {
            continue;
        }
        let relative = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if is_dir {
            if VAULT_PRUNE_DIR_NAMES.contains(&name.as_str()) {
                acc.pruned_dirs.push(relative);
                continue;
            }
            walk_vault_stamps(&dir.join(&name), &relative, depth + 1, acc)?;
        } else if vault_entry_is_tracked(&name) || vault_relative_is_source(&relative) {
            let (last_modified, size) = metadata_stamp(&dir.join(&name))?;
            acc.entries.push(VaultStamp {
                relative_path: relative,
                last_modified,
                size,
            });
        }
    }
    Ok(())
}

/// Paths and mtimes only, in one call instead of reading every body across IPC. The
/// walk rules must match TS exactly or fingerprints diverge; the contract
/// test `tests/contract/vault-walk-rules.contract.test.ts` holds both.
#[tauri::command(async)]
pub(crate) fn vault_fingerprint(root_path: String) -> Result<VaultFingerprint, String> {
    let root = resolve_existing_inside(&root_path, "")?;
    let mut acc = VaultFingerprint {
        entries: Vec::new(),
        truncated: false,
        pruned_dirs: Vec::new(),
    };
    walk_vault_stamps(&root, "", 0, &mut acc)?;
    Ok(acc)
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use super::*;

    #[test]
    fn vault_walk_keeps_the_last_entry_at_the_ceiling_and_reports_overflow() {
        let dir = std::env::temp_dir().join(format!("atlas-walk-boundary-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), "# A").unwrap();
        let mut acc = super::VaultFingerprint {
            entries: (0..super::VAULT_WALK_MAX_ENTRIES - 1)
                .map(|i| super::VaultStamp {
                    relative_path: format!("n{i}.md"),
                    last_modified: 0,
                    size: 0,
                })
                .collect(),
            truncated: false,
            pruned_dirs: Vec::new(),
        };
        super::walk_vault_stamps(&dir, "", 0, &mut acc).unwrap();
        assert_eq!(acc.entries.len(), 100000);
        assert_eq!(acc.entries.last().unwrap().relative_path, "a.md");
        assert!(!acc.truncated);
        super::walk_vault_stamps(&dir, "", 0, &mut acc).unwrap();
        assert!(acc.truncated);
        assert_eq!(acc.entries.len(), 100000);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_watcher_reports_what_a_refresh_reads_and_nothing_under_git() {
        let root = std::env::temp_dir().join(format!("atlas-watch-filter-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        for dir in [
            "notes/sources",
            "features",
            ".git/objects/ab",
            "node_modules/pkg",
            "capabilities",
        ] {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        for file in [
            "notes/sources/a.pdf",
            "notes/todo.txt",
            ".git/index",
            ".git/objects/ab/cdef.png",
            "node_modules/pkg/logo.png",
            ".DS_Store",
            "capabilities/.draft.png",
        ] {
            std::fs::write(root.join(file), b"x").unwrap();
        }
        let visible = |relative: &str| super::vault_change_is_visible(&root, &root.join(relative));
        for path in [
            "capabilities/a.md",
            ".claude/skills/x.md",
            "assets/diagram.PNG",
            "sources/scan.pdf",
            ".ontology-atlas/activity.jsonl",
            ".ontology-atlas/agent-activity.json",
            ".mcp.json",
            ".codex/config.toml",
            "features",
            "drafts",
        ] {
            assert!(visible(path), "{path} changes what the screen shows");
        }
        for path in [
            ".git",
            ".git/index",
            ".git/objects/ab/cdef.png",
            "node_modules",
            "node_modules/pkg/logo.png",
            "notes/sources/a.pdf",
            "notes/todo.txt",
            ".DS_Store",
            "capabilities/.draft.png",
        ] {
            assert!(!visible(path), "{path} changes nothing on screen");
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_rescan_after_dropped_events_is_always_reported() {
        use notify_debouncer_full::notify::{event::Flag, Event, EventKind};
        let root = std::path::Path::new("/vault");
        let batch = |event: Event| [super::DebouncedEvent::new(event, std::time::Instant::now())];
        let rescan = Event::new(EventKind::Other)
            .set_flag(Flag::Rescan)
            .add_path(root.join(".git"));
        assert!(super::vault_batch_is_visible(root, &batch(rescan)));
        let unseen = Event::new(EventKind::Any).add_path(root.join(".git/index"));
        assert!(!super::vault_batch_is_visible(root, &batch(unseen)));
    }

    #[cfg(unix)]
    #[test]
    fn list_vault_directory_reports_symbolic_links_only_when_asked_and_never_follows_them() {
        use std::os::unix::fs::symlink;

        let nonce = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("ontology-atlas-list-links-{nonce}"));
        let outside =
            std::env::temp_dir().join(format!("ontology-atlas-list-links-outside-{nonce}"));
        fs::create_dir_all(root.join("wiki/team")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(root.join("wiki/plan.md"), "plan").unwrap();
        fs::write(outside.join("secret.md"), "secret").unwrap();
        symlink(outside.join("secret.md"), root.join("wiki/escape.md")).unwrap();
        symlink(&outside, root.join("wiki/elsewhere")).unwrap();
        let root_path = root.to_string_lossy().to_string();

        let named = |entries: Vec<TauriVaultEntry>| {
            entries
                .into_iter()
                .map(|entry| format!("{}:{}", entry.name, entry.kind))
                .collect::<Vec<_>>()
        };
        assert_eq!(
            named(list_vault_directory(root_path.clone(), "wiki".into(), None).unwrap()),
            vec!["plan.md:file", "team:directory"]
        );
        assert_eq!(
            named(list_vault_directory(root_path.clone(), "wiki".into(), Some(true)).unwrap()),
            vec![
                "elsewhere:symlink",
                "escape.md:symlink",
                "plan.md:file",
                "team:directory"
            ]
        );

        fs::remove_dir_all(root).ok();
        fs::remove_dir_all(outside).ok();
    }
}
