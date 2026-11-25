//! The file-change pulse: macOS tells Atlas each time a file changes in a worktree drawn as a
//! room, and Atlas counts the changes per worktree. A notice's path is placed and judged, then
//! dropped: no file is opened or stat'ed, no name or path reaches the page, a log or a file, and
//! changes under `.git`, a build folder, or a path Git ignores are not counted. One watcher serves
//! every room, and it lives only while Work status is visible and the pulse is on.

// Only macOS watches, so the watcher's half is unused elsewhere.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

mod counts;
mod ignore_check;
#[cfg(test)]
mod tests;

use std::collections::{BTreeMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use notify_debouncer_full::notify::event::{CreateKind, ModifyKind, RemoveKind};
use notify_debouncer_full::notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;

use counts::{Pulse, VerdictBatch, WorktreePulse};

/// The page asks every 2 s while visible; a watcher not asked for this long counts nothing, so a
/// page that vanished without saying so starts no hidden count.
const ASK_LAPSE: Duration = Duration::from_secs(10);

#[derive(Debug, PartialEq, Eq, Serialize)]
pub(crate) struct PulseRead {
    /// By worktree id: every drawn worktree Git lists.
    pub(crate) worktrees: BTreeMap<String, WorktreePulse>,
}

#[derive(Default)]
struct State {
    /// The person switched the pulse off: nothing is watched or held, whoever asks.
    off: bool,
    pulse: Pulse,
    last_ask: Option<Instant>,
}

fn state() -> &'static Arc<Mutex<State>> {
    static STATE: OnceLock<Arc<Mutex<State>>> = OnceLock::new();
    STATE.get_or_init(Arc::default)
}

struct Live {
    _watcher: RecommendedWatcher,
    roots: Vec<PathBuf>,
    accepted: Vec<PathBuf>,
}

/// Held apart from `State`: dropping a watcher waits for its callback, which takes `State`.
static WATCHER: Mutex<Option<Live>> = Mutex::new(None);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_millis() as i64)
}

/// One ask at a time, so two asks never race over the watcher or a worktree's Git call.
static ASKING: Mutex<()> = Mutex::new(());

/// The counts of each drawn worktree. `listed` is every worktree Git lists for the repository;
/// `drawn` the ids the page draws as rooms, of which only listed ones are watched. Starts or
/// moves the watcher, asks Git about waiting paths through `check` with no lock held, and
/// answers from memory. `None` while switched off, also when switched off during the ask.
pub(crate) fn pulse_read(
    listed: Vec<(PathBuf, String)>,
    drawn: &[String],
    mut check: impl FnMut(&VerdictBatch) -> Option<HashSet<String>>,
) -> Option<PulseRead> {
    let _asking = ASKING.lock().ok()?;
    let roots = {
        let mut state = state().lock().ok()?;
        if state.off {
            return None;
        }
        state.last_ask = Some(Instant::now());
        state.pulse.set_rooms(listed, drawn);
        outermost(state.pulse.folders())
    };
    let accepted = watch(&roots);
    let batches = {
        let mut state = state().lock().ok()?;
        state
            .pulse
            .mark_watched(|folder| accepted.iter().any(|root| folder.starts_with(root)));
        state.pulse.take_due_batches(Instant::now())
    };
    let verdicts: Vec<_> = batches
        .into_iter()
        .map(|batch| {
            let verdict = check(&batch);
            (batch, verdict)
        })
        .collect();
    let mut state = state().lock().ok()?;
    if state.off {
        return None;
    }
    for (batch, verdict) in verdicts {
        state
            .pulse
            .apply_verdicts(batch, verdict.as_ref(), now_ms());
    }
    let worktrees = state.pulse.read(now_ms());
    Some(PulseRead { worktrees })
}

/// The real verdict: `git check-ignore` in the batch's worktree.
pub(crate) fn git_check(batch: &VerdictBatch) -> Option<HashSet<String>> {
    ignore_check::ignored_paths(&batch.folder, batch.relative_paths())
}

/// Folders not inside another: a recursive watch on the outer one already sees the inner.
fn outermost(mut folders: Vec<PathBuf>) -> Vec<PathBuf> {
    folders.sort();
    let mut kept: Vec<PathBuf> = Vec::new();
    for folder in folders {
        if !kept.iter().any(|outer| folder.starts_with(outer)) {
            kept.push(folder);
        }
    }
    kept
}

/// Watches exactly `roots`, rebuilding the watcher when they change; the roots macOS accepted.
/// Takes `State` only briefly inside `WATCHER`; nothing takes them the other way round.
fn watch(roots: &[PathBuf]) -> Vec<PathBuf> {
    let Ok(mut live) = WATCHER.lock() else {
        return vec![];
    };
    if state().lock().map_or(true, |state| state.off) {
        *live = None;
        return vec![];
    }
    if let Some(current) = live.as_ref() {
        if current.roots == roots {
            return current.accepted.clone();
        }
    }
    *live = None;
    if roots.is_empty() {
        return vec![];
    }
    let shared = Arc::clone(state());
    let Ok(mut watcher) = notify_debouncer_full::notify::recommended_watcher(
        move |event: notify_debouncer_full::notify::Result<Event>| {
            if let Ok(event) = event {
                take_notice(&shared, &event);
            }
        },
    ) else {
        return vec![];
    };
    let accepted: Vec<PathBuf> = roots
        .iter()
        .filter(|root| watcher.watch(root, RecursiveMode::Recursive).is_ok())
        .cloned()
        .collect();
    *live = Some(Live {
        _watcher: watcher,
        roots: roots.to_vec(),
        accepted: accepted.clone(),
    });
    accepted
}

fn take_notice(shared: &Mutex<State>, event: &Event) {
    let Ok(mut state) = shared.lock() else {
        return;
    };
    let asked_lately = state.last_ask.is_some_and(|ask| ask.elapsed() < ASK_LAPSE);
    if state.off || !asked_lately {
        return;
    }
    let at_ms = now_ms();
    if event.need_rescan() {
        state
            .pulse
            .dropped_notices(event.paths.first().map(PathBuf::as_path), at_ms);
        return;
    }
    if !is_counted_kind(&event.kind) {
        return;
    }
    for path in &event.paths {
        state.pulse.notice(path, at_ms);
    }
}

/// A file made, written, renamed or removed; never a read, a folder, or a change of metadata.
pub(crate) fn is_counted_kind(kind: &EventKind) -> bool {
    match kind {
        EventKind::Create(kind) => *kind != CreateKind::Folder,
        EventKind::Remove(kind) => *kind != RemoveKind::Folder,
        EventKind::Modify(kind) => !matches!(kind, ModifyKind::Metadata(_)),
        EventKind::Any | EventKind::Access(_) | EventKind::Other => false,
    }
}

/// Work status was hidden: the watcher stops and the counts stay for when it is shown again.
pub(crate) fn stop_watching() {
    if let Ok(mut state) = state().lock() {
        state.last_ask = None;
    }
    drop_watcher();
}

/// Whether the person leaves the pulse on. Off stops the watcher and drops every count held.
pub(crate) fn set_watching(on: bool) {
    if let Ok(mut state) = state().lock() {
        state.off = !on;
        state.last_ask = None;
        if !on {
            state.pulse = Pulse::default();
        }
    }
    drop_watcher();
}

fn drop_watcher() {
    let stopped = WATCHER.lock().ok().and_then(|mut live| live.take());
    drop(stopped);
}

#[cfg(test)]
pub(crate) fn watcher_is_alive() -> bool {
    WATCHER.lock().map(|live| live.is_some()).unwrap_or(false)
}
