use super::scope::canonical_root;
use super::walk::vault_batch_is_visible;
use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer_opt, DebounceEventResult, Debouncer, NoCache};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

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

/// Emits `vault-changed` for what a refresh reads, debounced 500ms. Idempotent per canonical
/// root, and a replaced debouncer drops on a background thread because FSEvents
/// teardown joins its run loop.
/// Deliberately `async` with no await: Tauri then runs it off the macOS main thread.
#[tauri::command]
pub(crate) async fn start_vault_watch(
    app: AppHandle,
    root_path: String,
    state: State<'_, VaultWatcherState>,
) -> Result<(), String> {
    let canonical = canonical_root(&root_path)?;
    let mut watch = state
        .watch
        .lock()
        .map_err(|_| "vault watcher state poisoned".to_string())?;
    if watch
        .as_ref()
        .is_some_and(|existing| existing.root == canonical)
    {
        log::debug!("vault watcher reused at {}", canonical.display());
        return Ok(());
    }
    let app_handle = app.clone();
    let watched_root = canonical.clone();
    let mut debouncer = new_debouncer_opt::<_, RecommendedWatcher, NoCache>(
        Duration::from_millis(500),
        None,
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                if vault_batch_is_visible(&watched_root, &events) {
                    let _ = app_handle.emit("vault-changed", ());
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
    let previous = watch.replace(VaultWatch {
        root: canonical,
        debouncer,
    });
    drop(watch);
    if let Some(previous) = previous {
        // Dropping joins the watcher thread at an unbounded cost the UI thread cannot pay.
        std::thread::spawn(move || drop(previous));
    }
    Ok(())
}
