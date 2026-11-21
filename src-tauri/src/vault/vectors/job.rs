//! One background job per folder: wait for the app's one model turn, make the model ready, list
//! the folder, plan, and prepare batch by batch. A second request while it runs asks for one
//! more pass; a stop, a quit or a crash keeps every stored passage.
//!
//! A folder the person stopped, or whose last pass failed, is held: no quiet pass starts for it
//! until the person prepares it again. Quiet passes wait for the folder's index passes to go
//! quiet, so a folder written to for minutes keeps no model loaded for all of them.

mod pass;
mod schedule;
mod status;
mod stop;
mod turn;

use super::failure::ModelFailedDetail;
use super::lock;
use super::report::{Rate, Throttle};
use super::search::OpenSearcher;
use super::types::{VectorFailure, VectorSource};
use status::Said;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;
pub(super) use turn::Turn;
use vault_index::vectors::{Model, PrepareProgress, Remaining, Status as Summary};

/// A quiet update starts once the folder's index passes have been quiet this long,
pub(super) const UPDATE_QUIET: Duration = Duration::from_secs(30);
/// and no later than this after the first index pass it waited for.
pub(super) const UPDATE_LATEST: Duration = Duration::from_secs(10 * 60);

/// What a pass that panicked reports, so the screen can offer Resume.
fn internal() -> Ended {
    Ended::Failed(
        VectorFailure::ModelFailed,
        ModelFailedDetail::Internal.as_str().into(),
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Pass {
    /// Asked for by the person: may download the model.
    Prepare,
    /// After the folder changed: only a folder whose vectors exist, never a download.
    Update,
}

/// How a pass ended.
#[derive(Clone, Debug, PartialEq)]
pub(super) enum Ended {
    Done,
    Stopped,
    /// The vectors were deleted while it ran; nothing more was written.
    Deleted,
    Failed(VectorFailure, String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Stage {
    Starting,
    /// `checking` while the kept part of an earlier download is hashed, before the network.
    Downloading {
        done: u64,
        total: u64,
        checking: bool,
    },
    Converting,
    Planning,
    Preparing,
}

/// One pass: its stop handle, its stage and its counts.
pub(super) struct Run {
    pass: Pass,
    pub(super) builtin: bool,
    /// The person pressed the dialog's download: the one pass that may fetch the built-in model.
    may_download: bool,
    /// The store was finished once before this pass, so this pass updates changed files.
    finished: bool,
    generation: u64,
    progress: PrepareProgress,
    stop: AtomicBool,
    /// Starts at the stage it enters once it holds the turn; until then it waits.
    stage: Mutex<Stage>,
    has_turn: AtomicBool,
    /// The store's counts once the plan brought it in line with the folder.
    base: Mutex<Option<Summary>>,
    /// What the plan left to prepare: an update's whole count.
    planned: Mutex<Option<Remaining>>,
    listed: AtomicU64,
    rate: Mutex<Rate>,
}

impl Run {
    fn new(
        pass: Pass,
        builtin: bool,
        may_download: bool,
        finished: bool,
        generation: u64,
        initial: Stage,
    ) -> Self {
        Self {
            pass,
            builtin,
            may_download,
            finished,
            generation,
            progress: PrepareProgress::default(),
            stop: AtomicBool::new(false),
            stage: Mutex::new(initial),
            has_turn: AtomicBool::new(false),
            base: Mutex::new(None),
            planned: Mutex::new(None),
            listed: AtomicU64::new(0),
            rate: Mutex::default(),
        }
    }

    /// At the next batch, download chunk or file batch; nothing stored is lost.
    pub(super) fn request_stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
        self.progress.request_stop();
    }

    fn stopped(&self) -> bool {
        self.stop.load(Ordering::SeqCst)
    }

    fn set_stage(&self, stage: Stage) {
        *lock(&self.stage) = stage;
    }
}

#[derive(Default)]
struct EntryState {
    running: bool,
    again: Option<Pass>,
    source: Option<VectorSource>,
    run: Option<Arc<Run>>,
    /// The last pass's failure this launch; cleared by the next pass that does not fail.
    failure: Option<(VectorFailure, String)>,
    /// The failure came from fetching or making the built-in model, so it says why the model is
    /// absent: until the next prepare it is shown instead of `modelGone`.
    failure_at_model: bool,
    /// Raised by a Delete: a pass of an older generation records and reports nothing.
    generation: u64,
    /// Stopped by the person, paused across a restart, or ended by a failure: no quiet pass
    /// starts until the next prepare.
    held: bool,
    /// Deleted in this launch: the folder reports not set up until the next prepare.
    deleted: bool,
    /// Index passes a quiet update waits behind: the first and the last, on the job's clock.
    deferred: Option<(Duration, Duration)>,
    /// A prepare with the person's download press waits for its pass, which takes it.
    download: bool,
}

/// One folder: its job, its search copy and its cached counts.
pub(super) struct Entry {
    pub(super) root: PathBuf,
    /// The spelling of the folder's path its events carry: the first one it was opened with.
    shown_as: String,
    state: Mutex<EntryState>,
    ended: Condvar,
    /// Held from a pass's last stop check through `plan`, and by a Delete, so a Delete never lands
    /// between them and a store is never made after it.
    plan_gate: Mutex<()>,
    pub(super) searcher: Mutex<Option<OpenSearcher>>,
    summary: Mutex<Option<(Model, Option<Summary>)>>,
    throttle: Mutex<(Throttle, Said)>,
}

impl Entry {
    pub(super) fn new(root: &Path, shown_as: &str) -> Self {
        Self {
            root: root.to_path_buf(),
            shown_as: shown_as.to_string(),
            state: Mutex::default(),
            ended: Condvar::new(),
            plan_gate: Mutex::new(()),
            searcher: Mutex::new(None),
            summary: Mutex::new(None),
            throttle: Mutex::default(),
        }
    }

    pub(super) fn source(&self) -> Option<VectorSource> {
        lock(&self.state).source.clone()
    }

    /// Arms a folder with no remembered source in this launch with the WebView's `source`, held
    /// when the person had paused it; never replaces a source a prepare chose. `true` when it
    /// armed the folder now.
    pub(super) fn arm(&self, source: &VectorSource, paused: bool) -> bool {
        let mut state = lock(&self.state);
        if state.source.is_some() {
            return false;
        }
        state.source = Some(source.clone());
        if paused {
            state.held = true;
            state.deferred = None;
        }
        true
    }

    pub(super) fn running_run(&self) -> Option<Arc<Run>> {
        lock(&self.state).run.clone()
    }

    /// Whether a job runs, or is about to, with the built-in model.
    fn uses_builtin(&self) -> bool {
        let state = lock(&self.state);
        state.running
            && (state.run.as_ref().is_some_and(|run| run.builtin)
                || matches!(state.source, Some(VectorSource::Builtin)))
    }

    #[cfg(test)]
    pub(super) fn held(&self) -> bool {
        lock(&self.state).held
    }

    pub(super) fn forget_summary(&self) {
        *lock(&self.summary) = None;
    }

    /// Waits up to `within` for the folder's job to end; `true` once none runs.
    pub(super) fn wait_idle(&self, within: Duration) -> bool {
        let state = lock(&self.state);
        let (state, _) = self
            .ended
            .wait_timeout_while(state, within, |state| state.running)
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        !state.running
    }

    pub(super) fn drop_idle_searcher(&self, now: Duration) {
        let mut searcher = lock(&self.searcher);
        if searcher.as_ref().is_some_and(|open| open.idle_past(now)) {
            *searcher = None;
        }
    }

    /// Whether the quiet update the folder waits for is due now; answers `true` once per wait.
    fn update_due(&self, now: Duration) -> bool {
        let mut state = lock(&self.state);
        let due = state.deferred.is_some_and(|(first, last)| {
            now.saturating_sub(last) >= UPDATE_QUIET || now.saturating_sub(first) >= UPDATE_LATEST
        });
        if due {
            state.deferred = None;
        }
        due
    }

    /// Clears `running` and the run when a pass unwinds, so the folder can be prepared again.
    fn end_unwound(&self) {
        {
            let mut state = lock(&self.state);
            state.running = false;
            state.run = None;
            state.again = None;
            state.held = true;
            if let Ended::Failed(failure, detail) = internal() {
                state.failure = Some((failure, detail));
            }
        }
        self.ended.notify_all();
    }
}

/// Ends the folder's job as a failure if its thread unwinds outside a pass.
struct Unwinding<'e>(&'e Entry);

impl Drop for Unwinding<'_> {
    fn drop(&mut self) {
        if std::thread::panicking() {
            self.0.end_unwound();
        }
    }
}
