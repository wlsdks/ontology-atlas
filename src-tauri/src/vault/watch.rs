use super::scope::canonical_root;
use super::walk::vault_change_is_visible;
use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{
    new_debouncer_opt, DebounceEventResult, DebouncedEvent, Debouncer, NoCache,
};
use serde::Serialize;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

/// Past this many paths in one debounced batch, re-reading the folder is the cheaper answer.
const VAULT_CHANGE_MAX_PATHS: usize = 10_000;

/// What is at a changed path now, judged the way the vault walk judges it: by `lstat`, never
/// through a link, so a link or anything under a linked folder is `Other` and is not walked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum VaultPathKind {
    File,
    Directory,
    Missing,
    Other,
}

/// One changed path. A stamp is read when the batch is built, so it may already be stale by
/// the time it is used; the next event or the focus check corrects that. Never a write target.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultPathChange {
    /// Relative to the canonical vault root, `/`-separated on every platform, valid UTF-8.
    pub(crate) path: String,
    pub(crate) kind: VaultPathKind,
    /// Files only: milliseconds since the Unix epoch and bytes, as `vault_fingerprint` reports.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_modified: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) size: Option<u64>,
}

/// The payload of `vault-changed` and the one shape a vault change takes in this app; a second
/// consumer (a search index) reads this type from the same watcher rather than starting another.
///
/// `changes` lists every path the walk or a sidecar reader would see differently, sorted and
/// deduplicated. `rescan` means the paths are not the whole story — the OS dropped events, a path
/// could not be expressed relative to the root, or the batch passed `VAULT_CHANGE_MAX_PATHS` —
/// and `changes` is then empty: re-read the folder. `root` is the watched folder as
/// `start_vault_watch` returned it, so a batch from a folder the app has since left is dropped.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultChangeBatch {
    pub(crate) root: String,
    pub(crate) changes: Vec<VaultPathChange>,
    pub(crate) rescan: bool,
}

/// `root`-relative and `/`-joined, or `None` for the root itself (`Some("")`) or a path outside
/// it or not valid UTF-8 (`None`). Windows `\\?\` roots strip like any other prefix.
fn relative_change_path(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let mut parts = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_str()?),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(parts.join("/"))
}

fn millis(time: std::io::Result<std::time::SystemTime>) -> Option<u64> {
    let since = time.ok()?.duration_since(UNIX_EPOCH).ok()?;
    u64::try_from(since.as_millis()).ok()
}

/// One `lstat` per path segment: a linked folder on the way makes the path `Other`, as the walk
/// never enters one.
fn stamp_change(root: &Path, relative: &str) -> VaultPathChange {
    let change = |kind| VaultPathChange {
        path: relative.to_string(),
        kind,
        last_modified: None,
        size: None,
    };
    let mut current = root.to_path_buf();
    let mut parts = relative.split('/').peekable();
    while let Some(part) = parts.next() {
        current.push(part);
        let Ok(metadata) = fs::symlink_metadata(&current) else {
            return change(VaultPathKind::Missing);
        };
        let file_type = metadata.file_type();
        if file_type.is_symlink() {
            return change(VaultPathKind::Other);
        }
        if parts.peek().is_some() {
            if file_type.is_dir() {
                continue;
            }
            return change(VaultPathKind::Missing);
        }
        if file_type.is_dir() {
            return change(VaultPathKind::Directory);
        }
        if !file_type.is_file() {
            return change(VaultPathKind::Other);
        }
        return VaultPathChange {
            last_modified: millis(metadata.modified()),
            size: Some(metadata.len()),
            ..change(VaultPathKind::File)
        };
    }
    change(VaultPathKind::Missing)
}

impl VaultChangeBatch {
    /// `None` when nothing in the batch changes what the app reads. O(paths · depth) `lstat`s.
    pub(crate) fn from_events(root: &Path, events: &[DebouncedEvent]) -> Option<Self> {
        let mut rescan = false;
        let mut paths = BTreeSet::new();
        for event in events {
            rescan |= event.need_rescan();
            for path in &event.paths {
                if !vault_change_is_visible(root, path) {
                    continue;
                }
                match relative_change_path(root, path) {
                    // The root's own entry says nothing about what is inside it.
                    Some(relative) if relative.is_empty() => {}
                    Some(relative) => {
                        paths.insert(relative);
                    }
                    None => rescan = true,
                }
            }
        }
        let watched = root.to_string_lossy().into_owned();
        if rescan || paths.len() > VAULT_CHANGE_MAX_PATHS {
            return Some(Self {
                root: watched,
                changes: Vec::new(),
                rescan: true,
            });
        }
        if paths.is_empty() {
            return None;
        }
        Some(Self {
            root: watched,
            changes: paths
                .iter()
                .map(|relative| stamp_change(root, relative))
                .collect(),
            rescan: false,
        })
    }
}

type VaultDebouncer = Debouncer<RecommendedWatcher, NoCache>;

/// Keeping the root lets a repeat call for the same folder skip rebuilding the
/// FSEvents stream.
struct VaultWatch {
    root: PathBuf,
    // Holding it is the behaviour: dropping the debouncer stops the watcher.
    #[allow(dead_code)]
    debouncer: VaultDebouncer,
}

/// Keeps the watcher alive for the app's lifetime.
#[derive(Default)]
pub(crate) struct VaultWatcherState {
    watch: Mutex<Option<VaultWatch>>,
}

/// Emits `vault-changed` with a `VaultChangeBatch` for what a refresh reads, debounced 500ms. Idempotent per canonical
/// root, and a replaced debouncer drops on a background thread because FSEvents
/// teardown joins its run loop.
/// Deliberately `async` with no await: Tauri then runs it off the macOS main thread.
/// Returns the canonical root every batch from this watcher names in `root`.
#[tauri::command]
pub(crate) async fn start_vault_watch(
    app: AppHandle,
    root_path: String,
    state: State<'_, VaultWatcherState>,
) -> Result<String, String> {
    let canonical = canonical_root(&root_path)?;
    let watched = canonical.to_string_lossy().into_owned();
    let mut watch = state
        .watch
        .lock()
        .map_err(|_| "vault watcher state poisoned".to_string())?;
    if watch
        .as_ref()
        .is_some_and(|existing| existing.root == canonical)
    {
        log::debug!("vault watcher reused at {}", canonical.display());
        return Ok(watched);
    }
    let app_handle = app.clone();
    let watched_root = canonical.clone();
    let mut debouncer = new_debouncer_opt::<_, RecommendedWatcher, NoCache>(
        Duration::from_millis(500),
        None,
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                if let Some(batch) = VaultChangeBatch::from_events(&watched_root, &events) {
                    let _ = app_handle.emit("vault-changed", batch);
                }
            }
            // A silent failure would make the vault stop changing with no clue why.
            Err(errors) => {
                for error in errors {
                    // `error.kind` only: the full error embeds note file names, which are meaning.
                    log::warn!("vault watcher error: {:?}", error.kind);
                }
            }
        },
        NoCache,
        notify_debouncer_full::notify::Config::default(),
    )
    .map_err(|err| err.to_string())?;
    debouncer
        .watcher()
        .watch(&canonical, RecursiveMode::Recursive)
        .map_err(|err| err.to_string())?;
    log::info!("vault watcher started at {}", canonical.display());
    let swept_root = canonical.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let removed = super::temporary_files::sweep::sweep_stale_temporaries(
            &swept_root,
            std::time::SystemTime::now(),
            super::temporary_files::sweep::STALE_AFTER,
        );
        if removed > 0 {
            log::info!("removed {removed} stale temporary file(s) from the vault");
        }
    });
    let previous = watch.replace(VaultWatch {
        root: canonical,
        debouncer,
    });
    drop(watch);
    if let Some(previous) = previous {
        // Dropping joins the watcher thread at an unbounded cost the UI thread cannot pay.
        std::thread::spawn(move || drop(previous));
    }
    Ok(watched)
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify_debouncer_full::notify::{event::Flag, Event, EventKind};
    use std::time::Instant;

    fn vault(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("atlas-watch-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::canonicalize(&root).unwrap()
    }

    fn batch(root: &Path, relatives: &[&str]) -> Option<VaultChangeBatch> {
        let mut event = Event::new(EventKind::Any);
        for relative in relatives {
            event = event.add_path(root.join(relative));
        }
        VaultChangeBatch::from_events(root, &[DebouncedEvent::new(event, Instant::now())])
    }

    #[test]
    fn reports_each_visible_path_once_relative_sorted_and_stamped() {
        let root = vault("paths");
        fs::create_dir_all(root.join("notes/deep")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join("notes/deep/b.md"), "# B").unwrap();
        fs::write(root.join("a.md"), "# A!").unwrap();
        let reported = batch(
            &root,
            &[
                "notes/deep/b.md",
                "a.md",
                "gone.md",
                "notes/deep",
                ".git/index",
                "a.md",
            ],
        )
        .unwrap();
        assert!(!reported.rescan);
        assert_eq!(
            reported.root,
            root.to_string_lossy(),
            "the batch names its watcher's folder"
        );
        let kinds: Vec<_> = reported
            .changes
            .iter()
            .map(|change| (change.path.as_str(), change.kind))
            .collect();
        assert_eq!(
            kinds,
            vec![
                ("a.md", VaultPathKind::File),
                ("gone.md", VaultPathKind::Missing),
                ("notes/deep", VaultPathKind::Directory),
                ("notes/deep/b.md", VaultPathKind::File),
            ]
        );
        let a = &reported.changes[0];
        assert_eq!(a.size, Some(4));
        assert_eq!(
            u128::from(a.last_modified.unwrap()),
            super::super::walk::metadata_mtime_ms(&root.join("a.md")).unwrap()
        );
        assert_eq!(batch(&root, &[".git/index", ".DS_Store"]), None);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_payload_is_the_shape_the_app_parses() {
        let payload = VaultChangeBatch {
            root: "/Users/dana/vault".into(),
            changes: vec![
                VaultPathChange {
                    path: "notes/a.md".into(),
                    kind: VaultPathKind::File,
                    last_modified: Some(1_700_000_000_000),
                    size: Some(12),
                },
                VaultPathChange {
                    path: "old".into(),
                    kind: VaultPathKind::Missing,
                    last_modified: None,
                    size: None,
                },
            ],
            rescan: false,
        };
        assert_eq!(
            serde_json::to_value(payload).unwrap(),
            serde_json::json!({
                "root": "/Users/dana/vault",
                "changes": [
                    { "path": "notes/a.md", "kind": "file", "lastModified": 1_700_000_000_000u64, "size": 12 },
                    { "path": "old", "kind": "missing" }
                ],
                "rescan": false
            })
        );
    }

    #[test]
    fn dropped_events_or_an_unplaceable_path_ask_for_a_rescan_without_paths() {
        let root = vault("rescan");
        let dropped = Event::new(EventKind::Other)
            .set_flag(Flag::Rescan)
            .add_path(root.join(".git"));
        let reported =
            VaultChangeBatch::from_events(&root, &[DebouncedEvent::new(dropped, Instant::now())]);
        assert_eq!(
            reported,
            Some(VaultChangeBatch {
                root: root.to_string_lossy().into_owned(),
                changes: Vec::new(),
                rescan: true
            })
        );
        let outside = Event::new(EventKind::Any).add_path(PathBuf::from("/elsewhere/a.md"));
        assert!(
            VaultChangeBatch::from_events(&root, &[DebouncedEvent::new(outside, Instant::now())])
                .unwrap()
                .rescan
        );
        let many: Vec<String> = (0..=VAULT_CHANGE_MAX_PATHS)
            .map(|at| format!("n{at}.md"))
            .collect();
        let many: Vec<&str> = many.iter().map(String::as_str).collect();
        let reported = batch(&root, &many).unwrap();
        assert!(reported.rescan && reported.changes.is_empty());
        assert_eq!(
            batch(&root, &[""]),
            None,
            "the root's own entry is not a change"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_nested_path_is_slash_joined_whatever_the_platform_separator() {
        let root = PathBuf::from("vault-root");
        let nested = root.join("notes").join("deep").join("a.md");
        assert_eq!(
            relative_change_path(&root, &nested).as_deref(),
            Some("notes/deep/a.md")
        );
        assert_eq!(relative_change_path(&root, Path::new("other/a.md")), None);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_or_a_path_through_a_linked_folder_is_not_a_walked_file() {
        use std::os::unix::fs::symlink;
        let root = vault("links");
        fs::create_dir_all(root.join("real")).unwrap();
        fs::write(root.join("real/a.md"), "# A").unwrap();
        symlink(root.join("real/a.md"), root.join("alias.md")).unwrap();
        symlink(root.join("real"), root.join("linked")).unwrap();
        let reported = batch(&root, &["alias.md", "linked/a.md", "real/a.md/below.md"]).unwrap();
        let kinds: Vec<_> = reported
            .changes
            .iter()
            .map(|change| (change.path.as_str(), change.kind))
            .collect();
        assert_eq!(
            kinds,
            vec![
                ("alias.md", VaultPathKind::Other),
                ("linked/a.md", VaultPathKind::Other),
                ("real/a.md/below.md", VaultPathKind::Missing),
            ]
        );
        let _ = fs::remove_dir_all(&root);
    }
}
