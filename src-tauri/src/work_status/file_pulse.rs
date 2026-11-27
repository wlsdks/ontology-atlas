//! The file-change pulse: macOS tells Atlas each time a file changes in a worktree drawn as a
//! room, and Atlas counts the changes per worktree. A notice's path is placed and judged, then
//! dropped: no file is opened or stat'ed, no name or path reaches the page, a log or a file, and
//! changes under `.git`, a build folder, or a path Git ignores are not counted. One watcher serves
//! every room, and it lives only while Work status is visible and the pulse is on.

// Only macOS watches, so the watcher's half is unused elsewhere.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

mod counts;
#[cfg(target_os = "macos")]
mod ignore_check;
#[cfg(test)]
mod tests;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use notify_debouncer_full::notify::event::{CreateKind, ModifyKind, RemoveKind};
use notify_debouncer_full::notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;

use counts::{Pulse, Verdict, VerdictBatch, WorktreePulse};

/// The page asks every 2 s while visible. Past this long without an ask, Rust takes the screen
/// as hidden: the watcher counts nothing and is ended, even if the page never said so.
static ASK_LAPSE_MS: AtomicU64 = AtomicU64::new(10_000);
/// How many times per lapse the guard looks.
const LAPSE_CHECKS: u32 = 5;

fn ask_lapse() -> Duration {
    Duration::from_millis(ASK_LAPSE_MS.load(Ordering::Relaxed))
}

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
    /// Which watcher this is, so a lapse guard ends only its own.
    generation: u64,
}

/// Held apart from `State`: dropping a watcher waits for its callback, which takes `State`.
/// Lock order: `ASKING`, then `WATCHER`, then `State`; the callback takes `State` alone.
static WATCHER: Mutex<Option<Live>> = Mutex::new(None);
static GENERATION: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_millis() as i64)
}

/// One ask, pause or switch at a time, so a pause can never land inside an ask and be undone by it.
static ASKING: Mutex<()> = Mutex::new(());

/// The counts of each drawn worktree. `listed` is every worktree Git lists for the repository;
/// `drawn` the ids the page draws as rooms, of which only listed ones are watched, within
/// `soft_open_file_limit` (see `affordable_roots`). Asks Git about waiting paths through `check`
/// with no lock held, starts or moves the watcher, and answers from memory. `None` while switched
/// off, also when switched off during the ask.
pub(crate) fn pulse_read(
    listed: Vec<(PathBuf, String)>,
    drawn: &[String],
    soft_open_file_limit: u64,
    mut check: impl FnMut(&VerdictBatch) -> Option<Verdict>,
) -> Option<PulseRead> {
    let _asking = ASKING.lock().ok()?;
    let (roots, batches) = {
        let mut state = state().lock().ok()?;
        if state.off {
            return None;
        }
        state.last_ask = Some(Instant::now());
        state.pulse.set_rooms(listed, drawn);
        let batches = state.pulse.take_due_batches(Instant::now());
        (outermost(state.pulse.folders()), batches)
    };
    let verdicts: Vec<_> = batches
        .into_iter()
        .map(|batch| {
            let verdict = check(&batch);
            (batch, verdict)
        })
        .collect();
    let accepted = watch(&roots, soft_open_file_limit);
    let mut state = state().lock().ok()?;
    if state.off {
        return None;
    }
    state
        .pulse
        .mark_watched(|folder| accepted.iter().any(|root| folder.starts_with(root)));
    for (batch, verdict) in verdicts {
        state
            .pulse
            .apply_verdicts(batch, verdict.as_ref(), now_ms());
    }
    let worktrees = state.pulse.read(now_ms());
    Some(PulseRead { worktrees })
}

/// The real verdict: `git check-ignore` in the batch's worktree.
#[cfg(target_os = "macos")]
pub(crate) fn git_check(batch: &VerdictBatch) -> Option<Verdict> {
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

/// Open files macOS holds while it watches `root`: one per folder on its path and three for the
/// stream, as measured on macOS 27, plus one to spare.
fn watch_cost(root: &Path) -> u64 {
    root.components().count() as u64 + 4
}

/// The leading `roots` whose summed `watch_cost` fits in half the soft limit on open files, which
/// leaves the rest to the vault's watcher and the app. Past the limit `FSEventStreamCreate` fails,
/// and notify 9 then frees the stream's context twice.
fn affordable_roots(
    roots: &[PathBuf],
    soft_open_file_limit: u64,
) -> impl Iterator<Item = &PathBuf> {
    let budget = soft_open_file_limit / 2;
    let mut spent = 0;
    roots.iter().take_while(move |root| {
        spent += watch_cost(root);
        spent <= budget
    })
}

/// Watches exactly `roots`, rebuilding the watcher when they change; the roots macOS accepted
/// among the affordable ones.
fn watch(roots: &[PathBuf], soft_open_file_limit: u64) -> Vec<PathBuf> {
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
    let accepted: Vec<PathBuf> = affordable_roots(roots, soft_open_file_limit)
        .filter(|root| watcher.watch(root, RecursiveMode::Recursive).is_ok())
        .cloned()
        .collect();
    let generation = GENERATION.fetch_add(1, Ordering::Relaxed) + 1;
    *live = Some(Live {
        _watcher: watcher,
        roots: roots.to_vec(),
        accepted: accepted.clone(),
        generation,
    });
    std::thread::spawn(move || end_when_unasked(generation));
    accepted
}

/// Ends watcher `generation` once no ask came for `ask_lapse`, and returns when another watcher
/// replaced it. A thread of its own, since the watcher's callback cannot drop its own watcher.
fn end_when_unasked(generation: u64) {
    loop {
        std::thread::sleep(ask_lapse() / LAPSE_CHECKS);
        let Ok(mut live) = WATCHER.lock() else {
            return;
        };
        if live.as_ref().map(|current| current.generation) != Some(generation) {
            return;
        }
        let lapsed = state().lock().map_or(true, |mut state| {
            let lapsed = state
                .last_ask
                .is_none_or(|ask| ask.elapsed() >= ask_lapse());
            if lapsed {
                state.pulse.forget_waiting();
            }
            lapsed
        });
        if lapsed {
            let stopped = live.take();
            drop(live);
            drop(stopped);
            return;
        }
    }
}

fn take_notice(shared: &Mutex<State>, event: &Event) {
    let Ok(mut state) = shared.lock() else {
        return;
    };
    let asked_lately = state
        .last_ask
        .is_some_and(|ask| ask.elapsed() < ask_lapse());
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

/// Work status was hidden: the watcher stops, paths waiting for Git are dropped, and the counts
/// stay for when it is shown again. Waits for an ask in flight, so the ask cannot restart it.
pub(crate) fn stop_watching() {
    let _asking = ASKING.lock();
    if let Ok(mut state) = state().lock() {
        state.last_ask = None;
        state.pulse.forget_waiting();
    }
    drop_watcher();
}

/// Whether the person leaves the pulse on. Off stops the watcher and drops every count held,
/// waiting for an ask in flight.
pub(crate) fn set_watching(on: bool) {
    let _asking = ASKING.lock();
    if let Ok(mut state) = state().lock() {
        state.off = !on;
        state.last_ask = None;
        if !on {
            state.pulse.forget_counts();
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

#[cfg(test)]
pub(crate) fn set_ask_lapse(lapse: Duration) {
    ASK_LAPSE_MS.store(lapse.as_millis() as u64, Ordering::Relaxed);
}

#[cfg(test)]
pub(crate) fn waiting_paths() -> usize {
    state()
        .lock()
        .map(|state| state.pulse.waiting_paths())
        .unwrap_or(0)
}

/// A notice placed as the watcher would place it, for tests that cannot wait for macOS.
#[cfg(test)]
pub(crate) fn notice(path: &std::path::Path) {
    if let Ok(mut state) = state().lock() {
        state.pulse.notice(path, now_ms());
    }
}
