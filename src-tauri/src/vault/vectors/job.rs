//! One background job per folder: wait for the app's one model turn, make the model ready, list
//! the folder, plan, and prepare batch by batch. A second request while it runs asks for one
//! more pass; a stop, a quit or a crash keeps every stored passage.
//!
//! A folder the person stopped, or whose last pass failed, is held: no quiet pass starts for it
//! until the person prepares it again. Quiet passes wait for the folder's index passes to go
//! quiet, so a folder written to for minutes keeps no model loaded for all of them.

use super::models::{builtin_model, is_builtin_model, readable_model, Builtin, Runner};
use super::report::{Rate, Throttle};
use super::search::OpenSearcher;
use super::types::{
    failure_detail, During, ModelBytes, ModelFailedDetail, ModelStep, VectorFailure, VectorPhase,
    VectorSource, VectorStatus,
};
use super::{lock, Vectors};
use crate::llm::embed::builtin::{ModelStore, Progress, Stage as ModelStage};
use crate::llm::embed::{BuildPlan, EmbedError, Embedder, RunEnd};
use std::cell::Cell;
use std::collections::VecDeque;
use std::panic::AssertUnwindSafe;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use vault_index::vectors::{Model, PrepareError, PrepareProgress, Remaining, Status as Summary};

/// How often a running job's ticker looks at its progress; the throttle decides what is sent.
const TICK: Duration = Duration::from_millis(250);
/// Delete of the model waits this long for the jobs using it to stop: each step they can be in
/// (a download chunk, a conversion, the check, a batch) gives up within about a second.
const STOP_WAIT: Duration = Duration::from_secs(5);
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

/// The app's one model turn: jobs take it in the order they asked.
#[derive(Default)]
pub(super) struct Turn {
    state: Mutex<TurnState>,
    changed: Condvar,
}

#[derive(Default)]
struct TurnState {
    holder: Option<PathBuf>,
    waiting: VecDeque<PathBuf>,
}

pub(super) struct TurnHeld<'t>(&'t Turn);

impl Drop for TurnHeld<'_> {
    fn drop(&mut self) {
        lock(&self.0.state).holder = None;
        self.0.changed.notify_all();
    }
}

impl Turn {
    /// Waits for the turn; `on_wait` runs once if another folder holds it. `None` once `stopped`.
    fn take(
        &self,
        root: &Path,
        stopped: &dyn Fn() -> bool,
        on_wait: &mut dyn FnMut(),
    ) -> Option<TurnHeld<'_>> {
        let mut state = lock(&self.state);
        state.waiting.push_back(root.to_path_buf());
        let mut told = false;
        loop {
            if stopped() {
                state.waiting.retain(|waiting| waiting != root);
                drop(state);
                self.changed.notify_all();
                return None;
            }
            let first = state.waiting.front().is_some_and(|first| first == root);
            if state.holder.is_none() && first {
                state.waiting.pop_front();
                state.holder = Some(root.to_path_buf());
                return Some(TurnHeld(self));
            }
            if !told {
                told = true;
                drop(state);
                on_wait();
                state = lock(&self.state);
                continue;
            }
            // Woken by a release or a stop; the bound only covers a wake that was missed.
            state = self
                .changed
                .wait_timeout(state, Duration::from_millis(200))
                .map(|(state, _)| state)
                .unwrap_or_else(|poisoned| poisoned.into_inner().0);
        }
    }

    /// Whether another folder holds the turn or would take it first.
    fn busy_for(&self, root: &Path) -> bool {
        let state = lock(&self.state);
        state.holder.as_ref().is_some_and(|holder| holder != root)
            || state.waiting.front().is_some_and(|first| first != root)
    }

    pub(super) fn wake(&self) {
        self.changed.notify_all();
    }
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

fn failed(error: &EmbedError, during: During) -> Ended {
    let (failure, detail) = failure_detail(error, during, ModelStep::Answer);
    Ended::Failed(failure, detail)
}

/// A failure while the worker converts or checks the model; the download is kept.
fn model_failed(error: &EmbedError, step: ModelStage) -> Ended {
    let step = if step == ModelStage::Check {
        ModelStep::Check
    } else {
        ModelStep::Convert
    };
    let (failure, detail) = failure_detail(error, During::ModelConvert, step);
    Ended::Failed(failure, detail)
}

/// The built-in model is not on this computer and this pass may not fetch it. Not a hold: the
/// status says so for as long as it is true.
fn model_gone() -> Ended {
    Ended::Failed(
        VectorFailure::ModelGone,
        EmbedError::ModelNotReady.code().into(),
    )
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

/// What the progress events last said, so the throttle knows whether anything moved.
#[derive(Default, PartialEq)]
struct Said {
    phase: Option<VectorPhase>,
    files_done: u64,
    passages_done: u64,
    current_path: Option<String>,
    model: Option<ModelBytes>,
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

/// The built-in model in use by a job: counted for the release rule until the job ends.
struct BuiltinInUse<'v>(&'v Vectors);

impl<'v> BuiltinInUse<'v> {
    fn start(vectors: &'v Vectors) -> Self {
        lock(&vectors.keeper).job_started();
        Self(vectors)
    }
}

impl Drop for BuiltinInUse<'_> {
    fn drop(&mut self) {
        let now = self.0.clock.now();
        lock(&self.0.keeper).job_ended(now);
        self.0.release_due();
    }
}

enum Active {
    Builtin(Arc<dyn Builtin>),
    Runner(Arc<dyn Runner>),
}

impl Active {
    fn embedder(&self) -> &dyn Embedder {
        match self {
            Active::Builtin(builtin) => builtin.as_ref(),
            Active::Runner(runner) => runner.as_ref(),
        }
    }

    fn during(&self) -> During {
        During::Embedding {
            runner: matches!(self, Active::Runner(_)),
        }
    }
}

/// Wakes a running job's reporter until the job ends.
struct Ticker {
    done: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Drop for Ticker {
    fn drop(&mut self) {
        self.done.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            thread.thread().unpark();
            let _ = thread.join();
        }
    }
}

/// The job's thread yields to the person's work: utility quality of service on macOS, the
/// background mode (CPU and I/O) on Windows.
fn lower_priority() {
    #[cfg(target_os = "macos")]
    {
        // SAFETY: changes only the calling thread's own scheduling class.
        let failed =
            unsafe { libc::pthread_set_qos_class_self_np(libc::qos_class_t::QOS_CLASS_UTILITY, 0) };
        if failed != 0 {
            log::warn!("search by meaning job kept its priority ({failed})");
        }
    }
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        extern "system" {
            fn GetCurrentThread() -> *mut std::ffi::c_void;
            fn SetThreadPriority(thread: *mut std::ffi::c_void, priority: i32) -> i32;
        }
        const THREAD_MODE_BACKGROUND_BEGIN: i32 = 0x0001_0000;
        // SAFETY: the pseudo-handle names the calling thread and needs no closing.
        if unsafe { SetThreadPriority(GetCurrentThread(), THREAD_MODE_BACKGROUND_BEGIN) } == 0 {
            log::warn!("search by meaning job kept its priority");
        }
    }
}

/// Whether a store for `source` exists and a prepare once finished it.
fn finished_once(root: &Path, source: &VectorSource) -> bool {
    readable_model(root, source)
        .is_some_and(|model| vault_index::vectors::completed(root, &model).unwrap_or(false))
}

impl Vectors {
    /// Starts or continues the folder's job with `source`, and returns at once. The one call that
    /// chooses a folder's source and lets a held folder go. Only with `download`, the person's
    /// press in the dialog, may its pass fetch the built-in model.
    pub(super) fn prepare(
        self: &Arc<Self>,
        entry: &Arc<Entry>,
        source: VectorSource,
        download: bool,
    ) {
        {
            let mut state = lock(&entry.state);
            state.source = Some(source);
            state.held = false;
            state.deleted = false;
            state.deferred = None;
            state.download |= download;
        }
        self.request(entry, Pass::Prepare);
    }

    /// Arms the folder as `Entry::arm` does. A folder armed now, not paused, whose store a
    /// preparation never finished was cut off by a quit or a crash: it continues once the quiet
    /// wait has passed, with no index pass needed.
    pub(super) fn arm(self: &Arc<Self>, entry: &Arc<Entry>, source: &VectorSource, paused: bool) {
        if !entry.arm(source, paused) || paused {
            return;
        }
        if readable_model(&entry.root, source).is_some() && !finished_once(&entry.root, source) {
            self.defer_update(entry);
        }
    }

    /// A question dropped passages of changed files: someone waits on them, so their update starts
    /// now and ends the quiet wait it covers.
    pub(super) fn update_for_question(self: &Arc<Self>, entry: &Arc<Entry>) {
        lock(&entry.state).deferred = None;
        self.request_update(entry);
    }

    /// The folder changed: a quiet update follows once its index passes go quiet (`tick`).
    pub(super) fn note_change(self: &Arc<Self>, entry: &Arc<Entry>) {
        self.defer_update(entry);
    }

    fn defer_update(self: &Arc<Self>, entry: &Arc<Entry>) {
        let now = self.clock.now();
        {
            let mut state = lock(&entry.state);
            if state.held || state.source.is_none() {
                return;
            }
            state.deferred = Some(match state.deferred {
                Some((first, _)) => (first, now),
                None => (now, now),
            });
        }
        self.start_housekeeping();
    }

    /// Starts every quiet update whose wait ended.
    pub(super) fn start_due_updates(self: &Arc<Self>, now: Duration) {
        for entry in self.all_entries() {
            if entry.update_due(now) {
                self.request_update(&entry);
            }
        }
    }

    /// A quiet pass over changed files, only for a folder not held whose vectors for its source
    /// exist, and never while the built-in model is gone (the status says so instead).
    pub(super) fn request_update(self: &Arc<Self>, entry: &Arc<Entry>) {
        let source = {
            let state = lock(&entry.state);
            if state.held {
                return;
            }
            state.source.clone()
        };
        let Some(source) = source else {
            return;
        };
        if readable_model(&entry.root, &source).is_none() {
            return;
        }
        let model_gone = matches!(source, VectorSource::Builtin)
            && self
                .sources
                .builtin()
                .is_ok_and(|builtin| !builtin.is_ready());
        if !model_gone {
            self.request(entry, Pass::Update);
        }
    }

    fn request(self: &Arc<Self>, entry: &Arc<Entry>, pass: Pass) {
        {
            let mut state = lock(&entry.state);
            if pass == Pass::Update && state.held {
                return;
            }
            if state.running {
                // One more pass follows; a pass the person asked for outranks an update.
                state.again = Some(match (state.again, pass) {
                    (Some(Pass::Prepare), _) | (_, Pass::Prepare) => Pass::Prepare,
                    _ => Pass::Update,
                });
                return;
            }
            state.running = true;
        }
        // Published before the call returns, so the command's answer is the job's.
        let Some(first) = self.start_run(entry, pass) else {
            entry.ended.notify_all();
            self.report_phase(entry);
            return;
        };
        self.start_housekeeping();
        let vectors = self.clone();
        let job_entry = entry.clone();
        let spawned = std::thread::Builder::new()
            .name("vault-vectors".into())
            .spawn(move || {
                lower_priority();
                vectors.passes(&job_entry, first);
            });
        if let Err(error) = spawned {
            log::warn!("search by meaning job did not start: {error}");
            {
                let mut state = lock(&entry.state);
                state.running = false;
                state.run = None;
            }
            entry.ended.notify_all();
        }
    }

    /// What a cut-off download left of the built-in model, said beside `ModelGone` so the screen
    /// offers to continue it rather than to start again.
    fn kept_download(&self) -> Option<ModelBytes> {
        let done = self.sources.builtin().ok()?.downloaded_bytes();
        (done > 0).then(|| ModelBytes {
            done_bytes: done,
            total_bytes: ModelStore::download_bytes(),
            checking: false,
        })
    }

    /// Whether the built-in model is missing from this computer, a partial download included.
    pub(super) fn builtin_absent(&self) -> bool {
        !self
            .sources
            .builtin()
            .is_ok_and(|builtin| builtin.is_ready())
    }

    /// Publishes the next pass's run, or ends the job: a held folder, one with no source, and a
    /// built-in one whose model is absent and whose pass may not fetch it start nothing.
    fn start_run(&self, entry: &Entry, pass: Pass) -> Option<(Arc<Run>, VectorSource)> {
        let mut seen = entry.source();
        loop {
            let facts = seen.as_ref().map(|source| {
                let absent = matches!(source, VectorSource::Builtin) && self.builtin_absent();
                (absent, finished_once(&entry.root, source))
            });
            let mut state = lock(&entry.state);
            if state.source != seen {
                seen = state.source.clone();
                continue;
            }
            state.again = None;
            let (Some(source), Some((absent, finished))) = (seen, facts) else {
                state.running = false;
                return None;
            };
            if state.held {
                state.running = false;
                return None;
            }
            // The press is taken by the pass it asked for; a later Resume asks again.
            let may_download = pass == Pass::Prepare && std::mem::take(&mut state.download);
            if absent && !may_download {
                state.running = false;
                return None;
            }
            // A pass that must fetch the model says so once it holds the turn.
            let initial = if absent {
                Stage::Downloading {
                    done: 0,
                    total: 0,
                    checking: false,
                }
            } else {
                Stage::Starting
            };
            let builtin = matches!(source, VectorSource::Builtin);
            let run = Arc::new(Run::new(
                pass,
                builtin,
                may_download,
                finished,
                state.generation,
                initial,
            ));
            state.run = Some(run.clone());
            return Some((run, source));
        }
    }

    fn passes(self: &Arc<Self>, entry: &Arc<Entry>, first: (Arc<Run>, VectorSource)) {
        let _unwinding = Unwinding(entry);
        let mut current = first;
        loop {
            let (run, source) = current;
            let ended =
                std::panic::catch_unwind(AssertUnwindSafe(|| self.run_pass(entry, &run, &source)))
                    .unwrap_or_else(|_| internal());
            entry.forget_summary();
            let next = {
                let mut state = lock(&entry.state);
                state.run = None;
                if state.generation == run.generation {
                    state.failure_at_model = matches!(
                        *lock(&run.stage),
                        Stage::Downloading { .. } | Stage::Converting
                    );
                    state.failure = match &ended {
                        // Not a hold and not remembered: the status says it while it is true.
                        Ended::Failed(VectorFailure::ModelGone, _) => None,
                        Ended::Failed(failure, detail) => {
                            state.held = true;
                            state.deferred = None;
                            Some((*failure, detail.clone()))
                        }
                        _ => None,
                    };
                }
                let next = state.again.take();
                if next.is_none() {
                    state.running = false;
                }
                next
            };
            if let Ended::Failed(failure, detail) = &ended {
                log::warn!("search by meaning stopped: {failure:?} ({detail})");
            }
            entry.ended.notify_all();
            self.report_phase(entry);
            let Some(again) = next else {
                return;
            };
            // A Stop since the pass ended holds the folder: the queued pass does not start.
            let Some(next_run) = self.start_run(entry, again) else {
                entry.ended.notify_all();
                self.report_phase(entry);
                return;
            };
            current = next_run;
        }
    }

    fn run_pass(
        self: &Arc<Self>,
        entry: &Arc<Entry>,
        run: &Arc<Run>,
        source: &VectorSource,
    ) -> Ended {
        let _ticker = self.start_ticker(entry);
        let mut on_wait = || self.report_phase(entry);
        let Some(_turn) = self.turn.take(&entry.root, &|| run.stopped(), &mut on_wait) else {
            return Ended::Stopped;
        };
        run.has_turn.store(true, Ordering::SeqCst);
        self.report_phase(entry);
        let _in_use = run.builtin.then(|| BuiltinInUse::start(self));
        let (active, model) = match self.activate(entry, run, source) {
            Ok(active) => active,
            Err(ended) => return ended,
        };
        self.prepare_folder(entry, run, &active, &model)
    }

    /// The source's embedder and the store's model, the built-in model made ready first.
    fn activate(
        &self,
        entry: &Entry,
        run: &Run,
        source: &VectorSource,
    ) -> Result<(Active, Model), Ended> {
        match source {
            VectorSource::Builtin => {
                let builtin = self
                    .sources
                    .builtin()
                    .map_err(|error| failed(&error, During::ModelPrepare))?;
                if !builtin.is_ready() {
                    self.make_model_ready(entry, run, builtin.as_ref())?;
                }
                Ok((Active::Builtin(builtin), builtin_model()))
            }
            VectorSource::Runner { base_url, model } => {
                let during = During::Embedding { runner: true };
                let runner = self
                    .sources
                    .runner(base_url, model)
                    .map_err(|error| failed(&error, during))?;
                let dimensions = match readable_model(&entry.root, source) {
                    Some(stored) => stored.dimensions,
                    None => match runner.dimensions() {
                        Ok(Some(dimensions)) => dimensions,
                        Ok(None) => {
                            return Err(Ended::Failed(
                                VectorFailure::ModelMissing,
                                "vectors-dimensions-unknown".into(),
                            ))
                        }
                        Err(error) => return Err(failed(&error, during)),
                    },
                };
                let model = Model {
                    name: super::models::model_name(source),
                    dimensions,
                };
                Ok((Active::Runner(runner), model))
            }
        }
    }

    /// Downloads, converts and checks the built-in model, only in the pass the person's download
    /// press started.
    fn make_model_ready(
        &self,
        entry: &Entry,
        run: &Run,
        builtin: &dyn Builtin,
    ) -> Result<(), Ended> {
        if !run.may_download {
            return Err(model_gone());
        }
        // The worker maps the weights; nothing may hold them while the files are replaced.
        builtin.release();
        run.set_stage(Stage::Downloading {
            done: 0,
            total: 0,
            checking: false,
        });
        self.report_phase(entry);
        let step = Cell::new(ModelStage::Verify);
        let mut on_progress = |progress: &Progress| {
            step.set(progress.stage);
            let stage = match progress.stage {
                ModelStage::Verify | ModelStage::Download => Stage::Downloading {
                    done: progress.done,
                    total: progress.total,
                    checking: progress.stage == ModelStage::Verify,
                },
                ModelStage::Convert | ModelStage::Check => Stage::Converting,
            };
            let phase_changed =
                std::mem::discriminant(&*lock(&run.stage)) != std::mem::discriminant(&stage);
            run.set_stage(stage);
            if phase_changed {
                self.report_phase(entry);
            } else {
                self.report_progress(entry);
            }
        };
        match builtin.prepare(&entry.root, &run.stop, &mut on_progress) {
            Ok(()) if run.stopped() => Err(Ended::Stopped),
            Ok(()) => Ok(()),
            Err(EmbedError::Cancelled) => Err(Ended::Stopped),
            Err(error) => Err(match step.get() {
                ModelStage::Convert | ModelStage::Check => model_failed(&error, step.get()),
                ModelStage::Verify | ModelStage::Download => failed(&error, During::ModelPrepare),
            }),
        }
    }

    fn prepare_folder(&self, entry: &Entry, run: &Run, active: &Active, model: &Model) -> Ended {
        let root = &entry.root;
        let Ok(files) = self.sources.markdown_files(root) else {
            return Ended::Failed(VectorFailure::Unreadable, "vectors-walk-failed".into());
        };
        run.listed.store(files.len() as u64, Ordering::Relaxed);
        // The model's download and fit before this pass embed nothing; they never count toward its rate.
        lock(&run.rate).restart();
        run.set_stage(Stage::Planning);
        self.report_phase(entry);
        let planned = {
            let _gate = lock(&entry.plan_gate);
            if lock(&entry.state).generation != run.generation {
                return Ended::Deleted;
            }
            if run.stopped() {
                return Ended::Stopped;
            }
            let store = vault_index::vectors::store_model(root).ok().flatten();
            if run.pass == Pass::Update && store.as_ref() != Some(model) {
                // The store went since the update was asked for: it is not made again.
                return Ended::Done;
            }
            vault_index::vectors::plan(root, model, &files, &run.progress)
        };
        let plan = match planned {
            Ok(plan) => plan,
            Err(vault_index::Error::Cancelled) => return Ended::Stopped,
            Err(vault_index::Error::Deleted) => return Ended::Deleted,
            Err(error) => {
                log::warn!("search by meaning could not plan: {error}");
                return Ended::Failed(VectorFailure::Write, "vectors-store-failed".into());
            }
        };
        *lock(&run.base) = vault_index::vectors::status(root, model).ok().flatten();
        let remaining = plan.remaining();
        *lock(&run.planned) = Some(remaining);
        if remaining.passages == 0 {
            // Nothing to embed: `prepare` only records that the store is finished.
            let finished = vault_index::vectors::prepare(plan, &run.progress, |_: &[&str]| {
                Err::<Vec<Vec<f32>>, _>(EmbedError::BatchEmpty)
            });
            return match finished {
                Ok(_) => Ended::Done,
                Err(PrepareError::Stopped) => Ended::Stopped,
                Err(PrepareError::Deleted) => Ended::Deleted,
                Err(_) => Ended::Failed(VectorFailure::Write, "vectors-store-failed".into()),
            };
        }
        run.set_stage(Stage::Preparing);
        self.report_phase(entry);
        let wide = |count: u64| usize::try_from(count).unwrap_or(usize::MAX);
        let build_plan = BuildPlan {
            files: wide(remaining.files),
            passages: wide(remaining.passages),
            chars: wide(remaining.chars),
        };
        let during = active.during();
        let mut session = match active.embedder().start_build(root, build_plan) {
            Ok(session) => session,
            Err(error) => return failed(&error, during),
        };
        let outcome = vault_index::vectors::prepare(plan, &run.progress, |texts: &[&str]| {
            let vectors = session.embed_batch_until(texts, &run.stop);
            self.report_progress(entry);
            vectors
        });
        let (end, ended) = match outcome {
            Ok(prepared) => {
                log::info!(
                    "search by meaning prepared {} passage(s) of {} file(s) with {}",
                    prepared.passages,
                    prepared.files,
                    active.embedder().model()
                );
                (RunEnd::Complete, Ended::Done)
            }
            Err(PrepareError::Stopped | PrepareError::Embed(EmbedError::Cancelled)) => {
                (RunEnd::Stopped, Ended::Stopped)
            }
            Err(PrepareError::Deleted) => (RunEnd::Stopped, Ended::Deleted),
            Err(PrepareError::Embed(error)) => (RunEnd::Failed, failed(&error, during)),
            Err(PrepareError::Refused(refusal)) => {
                log::warn!("search by meaning refused the model's answer: {refusal}");
                (
                    RunEnd::Failed,
                    Ended::Failed(
                        VectorFailure::ModelFailed,
                        ModelFailedDetail::Check.as_str().into(),
                    ),
                )
            }
            Err(PrepareError::Index(error)) => {
                log::warn!("search by meaning could not write: {error}");
                (
                    RunEnd::Failed,
                    Ended::Failed(VectorFailure::Write, "vectors-store-failed".into()),
                )
            }
        };
        if let Err(error) = session.finish(end) {
            log::error!("search by meaning run has no closing audit line: {error}");
        }
        ended
    }

    fn start_ticker(self: &Arc<Self>, entry: &Arc<Entry>) -> Option<Ticker> {
        if !self.background {
            return None;
        }
        let done = Arc::new(AtomicBool::new(false));
        let (vectors, entry, run_done) = (self.clone(), entry.clone(), done.clone());
        let thread = std::thread::Builder::new()
            .name("vault-vectors-progress".into())
            .spawn(move || {
                while !run_done.load(Ordering::SeqCst) {
                    std::thread::park_timeout(TICK);
                    vectors.report_progress(&entry);
                }
            })
            .ok()?;
        Some(Ticker {
            done,
            thread: Some(thread),
        })
    }

    /// Holds the folder and asks its job to stop at its next batch, download chunk or model step.
    /// From now on the folder reports `stopped` until the person prepares it again.
    pub(super) fn stop(&self, entry: &Entry) {
        let run = {
            let mut state = lock(&entry.state);
            state.again = None;
            state.held = true;
            state.deferred = None;
            state.run.clone()
        };
        if let Some(run) = run {
            run.request_stop();
        }
        self.turn.wake();
        self.report_phase(entry);
    }

    /// Stops every job, then waits up to `within` for each to end and close its audit line.
    /// `false` when one was still running at the bound; the caller goes on regardless.
    pub(super) fn stop_all(&self, within: Duration) -> bool {
        let entries = self.all_entries();
        for entry in &entries {
            self.stop(entry);
        }
        let deadline = Instant::now() + within;
        entries
            .iter()
            .all(|entry| entry.wait_idle(deadline.saturating_duration_since(Instant::now())))
    }

    /// Stops every matching job for good, holds each out of its plan while `delete` runs, and lets
    /// each folder's search copy and remembered source go. Each folder reports not set up from
    /// now until it is prepared again, unless `delete` failed: then its status says what is on
    /// disk.
    pub(super) fn forget<T, E>(
        &self,
        root: Option<&Path>,
        delete: impl FnOnce() -> Result<T, E>,
    ) -> Result<T, E> {
        let canonical = root.and_then(|root| std::fs::canonicalize(root).ok());
        let mut entries: Vec<Arc<Entry>> = self
            .all_entries()
            .into_iter()
            .filter(|entry| {
                root.is_none_or(|root| {
                    entry.root == root || canonical.as_ref() == Some(&entry.root)
                })
            })
            .collect();
        entries.sort_by(|a, b| a.root.cmp(&b.root));
        for entry in &entries {
            let run = {
                let mut state = lock(&entry.state);
                state.generation += 1;
                state.again = None;
                state.source = None;
                state.failure = None;
                state.held = false;
                state.deleted = true;
                state.deferred = None;
                state.run.clone()
            };
            if let Some(run) = run {
                run.request_stop();
            }
        }
        self.turn.wake();
        let gates: Vec<_> = entries.iter().map(|entry| lock(&entry.plan_gate)).collect();
        let deleted = delete();
        for entry in &entries {
            *lock(&entry.searcher) = None;
            entry.forget_summary();
            if deleted.is_err() {
                lock(&entry.state).deleted = false;
            }
        }
        drop(gates);
        for entry in &entries {
            self.report_phase(entry);
        }
        deleted
    }

    /// Ends every job using the built-in model, then has the model end its worker and delete its
    /// files in one turn, so no question starts a worker between the two.
    pub(super) fn delete_model(&self) -> Result<(), String> {
        let using: Vec<Arc<Entry>> = self
            .all_entries()
            .into_iter()
            .filter(|entry| entry.uses_builtin())
            .collect();
        for entry in &using {
            self.stop(entry);
        }
        if !using.iter().all(|entry| entry.wait_idle(STOP_WAIT)) {
            return Err("vectors-model-in-use".into());
        }
        let builtin = self
            .sources
            .builtin()
            .map_err(|error| error.code().to_string())?;
        builtin.delete().map_err(|error| error.code().to_string())
    }

    /// The folder's status: the running job's, else what the store and the last pass say.
    pub(super) fn status(
        &self,
        entry: &Entry,
        enabled: bool,
        source: Option<&VectorSource>,
    ) -> VectorStatus {
        if !enabled {
            let mut off = VectorStatus::of_phase(VectorPhase::Off);
            off.vectors_bytes = vault_index::vectors::vectors_bytes(&entry.root).unwrap_or(0);
            return off;
        }
        let (run, remembered, failure, held, deleted, at_model, busy) = {
            let state = lock(&entry.state);
            (
                // A pass of an older generation was ended by a Delete and speaks no more.
                state
                    .run
                    .clone()
                    .filter(|run| run.generation == state.generation),
                state.source.clone(),
                state.failure.clone(),
                state.held,
                state.deleted,
                state.failure_at_model,
                state.running,
            )
        };
        if deleted {
            return VectorStatus::of_phase(VectorPhase::NotSetUp);
        }
        let vectors_bytes = vault_index::vectors::vectors_bytes(&entry.root).unwrap_or(0);
        let source = source.cloned().or(remembered);
        let model = match &source {
            Some(source) => readable_model(&entry.root, source),
            None => vault_index::vectors::store_model(&entry.root)
                .ok()
                .flatten(),
        };
        let summary = model.as_ref().and_then(|model| self.summary(entry, model));
        // Resume cannot work without the model, so its absence comes first: ahead of a failure
        // and of `stopped`, also for a pass stopped during its download. Only the download the
        // person pressed for, still going, says otherwise, and the failure that download ended
        // with, which says why the model is absent, until the next prepare lets the folder go.
        let downloading = run
            .as_ref()
            .is_some_and(|run| run.may_download && !run.stopped());
        let says_why = held && at_model && failure.is_some();
        if matches!(source, Some(VectorSource::Builtin))
            && !downloading
            && !says_why
            && self.builtin_absent()
        {
            let mut gone = VectorStatus::of_phase(VectorPhase::Failed);
            if let Some(summary) = summary {
                fill_counts(&mut gone, &summary, 0, 0);
            }
            gone.failure = Some(VectorFailure::ModelGone);
            gone.failure_detail = Some(EmbedError::ModelNotReady.code().into());
            gone.model = self.kept_download();
            gone.vectors_bytes = vectors_bytes;
            return gone;
        }
        let mut status = match run {
            Some(run) => self.running_status(entry, &run, summary),
            None => self.idle_status(summary, model.as_ref(), failure, held),
        };
        status.vectors_bytes = vectors_bytes;
        status.busy = busy;
        status
    }

    fn summary(&self, entry: &Entry, model: &Model) -> Option<Summary> {
        let mut cached = lock(&entry.summary);
        if let Some((of, summary)) = cached.as_ref() {
            if of == model {
                return *summary;
            }
        }
        let summary = vault_index::vectors::status(&entry.root, model)
            .ok()
            .flatten();
        *cached = Some((model.clone(), summary));
        summary
    }

    fn idle_status(
        &self,
        summary: Option<Summary>,
        model: Option<&Model>,
        failure: Option<(VectorFailure, String)>,
        held: bool,
    ) -> VectorStatus {
        let mut status = VectorStatus::of_phase(VectorPhase::NotSetUp);
        if let Some(summary) = summary {
            fill_counts(&mut status, &summary, 0, 0);
        }
        let kept = summary.is_some_and(|summary| summary.passages_stored > 0);
        if let Some((failure, detail)) = failure {
            status.phase = if kept && failure != VectorFailure::ModelGone {
                VectorPhase::Stopped
            } else {
                VectorPhase::Failed
            };
            status.failure = Some(failure);
            status.failure_detail = Some(detail);
            return status;
        }
        let model_gone = summary.is_some()
            && model.is_some_and(is_builtin_model)
            && self
                .sources
                .builtin()
                .is_ok_and(|builtin| !builtin.is_ready());
        if model_gone {
            status.phase = VectorPhase::Failed;
            status.failure = Some(VectorFailure::ModelGone);
            status.failure_detail = Some(EmbedError::ModelNotReady.code().into());
            status.model = self.kept_download();
            return status;
        }
        if held {
            status.phase = VectorPhase::Stopped;
            return status;
        }
        let Some(summary) = summary else {
            return status;
        };
        status.phase = if summary.passages_stored >= summary.passages {
            VectorPhase::Ready
        } else {
            VectorPhase::Stopped
        };
        status
    }

    fn running_status(&self, entry: &Entry, run: &Run, cached: Option<Summary>) -> VectorStatus {
        let stage = *lock(&run.stage);
        let base = *lock(&run.base);
        let folder_counts = |status: &mut VectorStatus| match base.or(cached) {
            Some(summary) => {
                let (files, passages) = match base {
                    Some(_) => (run.progress.files_done(), run.progress.passages_done()),
                    None => (0, 0),
                };
                fill_counts(status, &summary, files, passages);
            }
            None => status.files_total = run.listed.load(Ordering::Relaxed),
        };
        if run.stopped() {
            // Stop was asked for: what is in flight may still land, but the person stopped it.
            let mut status = VectorStatus::of_phase(VectorPhase::Stopped);
            folder_counts(&mut status);
            return status;
        }
        // An update of a finished store stays quiet until it knows something changed.
        let quiet = run.pass == Pass::Update && run.finished && stage != Stage::Preparing;
        let waiting = !run.has_turn.load(Ordering::SeqCst) && self.turn.busy_for(&entry.root);
        let phase = match stage {
            _ if quiet => VectorPhase::Ready,
            _ if waiting => VectorPhase::WaitingTurn,
            Stage::Downloading { .. } => VectorPhase::ModelDownloading,
            Stage::Converting => VectorPhase::ModelConverting,
            Stage::Starting | Stage::Planning | Stage::Preparing => VectorPhase::Preparing,
        };
        let mut status = VectorStatus::of_phase(phase);
        let planned = *lock(&run.planned);
        if let (true, Stage::Preparing, Some(planned)) = (run.finished, stage, planned) {
            // The changed files alone: what this pass reads.
            status.updating = true;
            status.files_total = planned.files;
            status.files_done = run.progress.files_done().min(planned.files);
            status.passages_total = planned.passages;
            status.passages_done = run.progress.passages_done().min(planned.passages);
        } else {
            folder_counts(&mut status);
        }
        if phase == VectorPhase::Preparing && stage == Stage::Preparing {
            let reading = run.progress.reading();
            status.current_path = (!reading.is_empty()).then_some(reading);
        }
        if let (
            VectorPhase::ModelDownloading,
            Stage::Downloading {
                done,
                total,
                checking,
            },
        ) = (phase, stage)
        {
            status.model = Some(ModelBytes {
                done_bytes: done,
                total_bytes: total,
                checking,
            });
        }
        status.passages_per_second = lock(&run.rate).per_second(self.clock.now());
        status
    }

    /// Sends the status now: a phase changed.
    pub(super) fn report_phase(&self, entry: &Entry) {
        let status = self.status(entry, true, None);
        let now = self.clock.now();
        {
            let mut throttle = lock(&entry.throttle);
            throttle.0.sent(now);
            throttle.1 = said(&status);
        }
        self.emit.emit(&entry.shown_as, &status);
    }

    /// Sends the status if the throttle allows: progress moved, or two seconds passed.
    pub(super) fn report_progress(&self, entry: &Entry) {
        let Some(run) = entry.running_run() else {
            return;
        };
        let now = self.clock.now();
        lock(&run.rate).record(now, run.progress.passages_done());
        let status = self.status(entry, true, None);
        let next = said(&status);
        {
            let mut throttle = lock(&entry.throttle);
            let (gate, last) = &mut *throttle;
            let changed = *last != next;
            if !gate.due(now, changed) {
                return;
            }
            *last = next;
        }
        self.emit.emit(&entry.shown_as, &status);
    }
}

fn said(status: &VectorStatus) -> Said {
    Said {
        phase: Some(status.phase),
        files_done: status.files_done,
        passages_done: status.passages_done,
        current_path: status.current_path.clone(),
        model: status.model,
    }
}

/// Folder-wide counts: what the store held when the pass began plus what this pass stored.
fn fill_counts(status: &mut VectorStatus, summary: &Summary, files: u64, passages: u64) {
    status.files_total = summary.files;
    status.files_done = (summary.files_ready + summary.files_capped + files).min(summary.files);
    status.passages_total = summary.passages;
    status.passages_done = (summary.passages_stored + passages).min(summary.passages);
}
