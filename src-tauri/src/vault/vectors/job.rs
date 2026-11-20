//! One background job per folder: wait for the app's one model turn, make the model ready, list
//! the folder, plan, and prepare batch by batch. A second request while it runs asks for one
//! more pass; a stop, a quit or a crash keeps every stored passage.

use super::models::{builtin_model, is_builtin_model, readable_model, Builtin, Runner};
use super::report::{Rate, Throttle};
use super::search::OpenSearcher;
use super::types::{
    failure_of, During, ModelBytes, VectorFailure, VectorPhase, VectorSource, VectorStatus,
};
use super::{lock, Vectors};
use crate::llm::embed::builtin::{Progress, Stage as ModelStage};
use crate::llm::embed::{BuildPlan, EmbedError, Embedder, RunEnd};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;
use vault_index::vectors::{Model, PrepareError, PrepareProgress, Status as Summary};

/// How often a running job's ticker looks at its progress; the throttle decides what is sent.
const TICK: Duration = Duration::from_millis(250);
/// Delete of the model waits this long for the jobs using it to reach their next batch.
const STOP_WAIT: Duration = Duration::from_secs(30);

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
    Ended::Failed(failure_of(error, during), error.code().to_string())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Stage {
    Starting,
    Waiting,
    Downloading { done: u64, total: u64 },
    Converting,
    Planning,
    Preparing,
}

/// One pass: its stop handle, its stage and its counts.
pub(super) struct Run {
    pass: Pass,
    pub(super) builtin: bool,
    generation: u64,
    progress: PrepareProgress,
    stop: AtomicBool,
    stage: Mutex<Stage>,
    /// The stage it starts in, and returns to after waiting for the turn.
    initial: Stage,
    /// The store's counts once the plan brought it in line with the folder.
    base: Mutex<Option<Summary>>,
    listed: AtomicU64,
    rate: Mutex<Rate>,
}

impl Run {
    fn new(pass: Pass, builtin: bool, generation: u64, initial: Stage) -> Self {
        Self {
            initial,
            pass,
            builtin,
            generation,
            progress: PrepareProgress::default(),
            stop: AtomicBool::new(false),
            stage: Mutex::new(initial),
            base: Mutex::new(None),
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
    /// Raised by a Delete: a pass of an older generation records nothing.
    generation: u64,
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
    shown_as: Mutex<String>,
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
            shown_as: Mutex::new(shown_as.to_string()),
            state: Mutex::default(),
            ended: Condvar::new(),
            plan_gate: Mutex::new(()),
            searcher: Mutex::new(None),
            summary: Mutex::new(None),
            throttle: Mutex::default(),
        }
    }

    pub(super) fn shown_as(&self, path: &str) {
        let mut shown = lock(&self.shown_as);
        if *shown != path {
            path.clone_into(&mut shown);
        }
    }

    pub(super) fn source(&self) -> Option<VectorSource> {
        lock(&self.state).source.clone()
    }

    /// Keeps `source` as the folder's choice; the update after an index pass uses it.
    pub(super) fn remember(&self, source: &VectorSource) {
        lock(&self.state).source = Some(source.clone());
    }

    pub(super) fn running_run(&self) -> Option<Arc<Run>> {
        lock(&self.state).run.clone()
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
        self.0.tick();
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

impl Vectors {
    /// Starts or continues the folder's job with `source`, and returns at once.
    pub(super) fn prepare(self: &Arc<Self>, entry: &Arc<Entry>, source: VectorSource) {
        entry.remember(&source);
        self.request(entry, Pass::Prepare);
    }

    /// A quiet pass over changed files, only for a folder whose vectors for its source exist.
    pub(super) fn request_update(self: &Arc<Self>, entry: &Arc<Entry>) {
        let Some(source) = entry.source() else {
            return;
        };
        if readable_model(&entry.root, &source).is_some() {
            self.request(entry, Pass::Update);
        }
    }

    fn request(self: &Arc<Self>, entry: &Arc<Entry>, pass: Pass) {
        {
            let mut state = lock(&entry.state);
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
        self.start_housekeeping();
        let vectors = self.clone();
        let job_entry = entry.clone();
        let spawned = std::thread::Builder::new()
            .name("vault-vectors".into())
            .spawn(move || {
                lower_priority();
                vectors.passes(&job_entry, pass);
            });
        if let Err(error) = spawned {
            log::warn!("search by meaning job did not start: {error}");
            lock(&entry.state).running = false;
            entry.ended.notify_all();
        }
    }

    fn passes(self: &Arc<Self>, entry: &Arc<Entry>, first: Pass) {
        let mut pass = first;
        loop {
            // A pass that must fetch the model says so from its first event.
            let fetches_model = pass == Pass::Prepare
                && matches!(entry.source(), Some(VectorSource::Builtin))
                && self
                    .sources
                    .builtin()
                    .is_ok_and(|builtin| !builtin.is_ready());
            let initial = if fetches_model {
                Stage::Downloading { done: 0, total: 0 }
            } else {
                Stage::Starting
            };
            let started = {
                let mut state = lock(&entry.state);
                state.again = None;
                match state.source.clone() {
                    Some(source) => {
                        let builtin = matches!(source, VectorSource::Builtin);
                        let run = Arc::new(Run::new(pass, builtin, state.generation, initial));
                        state.run = Some(run.clone());
                        Some((run, source))
                    }
                    None => None,
                }
            };
            let Some((run, source)) = started else {
                lock(&entry.state).running = false;
                entry.ended.notify_all();
                self.report_phase(entry);
                return;
            };
            self.report_phase(entry);
            let ended = self.run_pass(entry, &run, &source);
            entry.forget_summary();
            let next = {
                let mut state = lock(&entry.state);
                state.run = None;
                if state.generation == run.generation {
                    state.failure = match &ended {
                        Ended::Failed(failure, detail) => Some((*failure, detail.clone())),
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
            match next {
                Some(again) => pass = again,
                None => return,
            }
        }
    }

    fn run_pass(
        self: &Arc<Self>,
        entry: &Arc<Entry>,
        run: &Arc<Run>,
        source: &VectorSource,
    ) -> Ended {
        let _ticker = self.start_ticker(entry);
        let mut on_wait = || {
            run.set_stage(Stage::Waiting);
            self.report_phase(entry);
        };
        let Some(_turn) = self.turn.take(&entry.root, &|| run.stopped(), &mut on_wait) else {
            return Ended::Stopped;
        };
        if *lock(&run.stage) == Stage::Waiting {
            run.set_stage(run.initial);
            self.report_phase(entry);
        }
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

    /// Downloads, converts and checks the built-in model. An update never downloads.
    fn make_model_ready(
        &self,
        entry: &Entry,
        run: &Run,
        builtin: &dyn Builtin,
    ) -> Result<(), Ended> {
        if run.pass == Pass::Update {
            return Err(Ended::Failed(
                VectorFailure::ModelGone,
                EmbedError::ModelNotReady.code().into(),
            ));
        }
        // The worker maps the weights; nothing may hold them while the files are replaced.
        builtin.release();
        run.set_stage(Stage::Downloading { done: 0, total: 0 });
        self.report_phase(entry);
        let mut on_progress = |progress: &Progress| {
            let stage = match progress.stage {
                ModelStage::Verify | ModelStage::Download => Stage::Downloading {
                    done: progress.done,
                    total: progress.total,
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
            Err(error) => Err(failed(&error, During::ModelPrepare)),
        }
    }

    fn prepare_folder(&self, entry: &Entry, run: &Run, active: &Active, model: &Model) -> Ended {
        let root = &entry.root;
        let Ok(files) = self.sources.markdown_files(root) else {
            return Ended::Failed(VectorFailure::Unreadable, "vectors-walk-failed".into());
        };
        run.listed.store(files.len() as u64, Ordering::Relaxed);
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
        if remaining.passages == 0 {
            return Ended::Done;
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
                    Ended::Failed(VectorFailure::ModelFailed, "vectors-refused".into()),
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

    /// Asks the folder's job to stop at its next batch; a pass asked for after it still runs.
    pub(super) fn stop(&self, entry: &Entry) {
        let run = {
            let mut state = lock(&entry.state);
            state.again = None;
            state.run.clone()
        };
        if let Some(run) = run {
            run.request_stop();
        }
        self.turn.wake();
    }

    /// Stops every matching job for good, holds each out of its plan while `delete` runs, and lets
    /// each folder's search copy and remembered source go.
    pub(super) fn forget<T>(&self, root: Option<&Path>, delete: impl FnOnce() -> T) -> T {
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
        }
        drop(gates);
        deleted
    }

    /// Ends every job using the built-in model, lets the worker go, then deletes the model.
    pub(super) fn delete_model(&self) -> Result<(), String> {
        let using: Vec<Arc<Entry>> = self
            .all_entries()
            .into_iter()
            .filter(|entry| entry.running_run().is_some_and(|run| run.builtin))
            .collect();
        for entry in &using {
            self.stop(entry);
        }
        if !using.iter().all(|entry| entry.wait_idle(STOP_WAIT)) {
            return Err("vectors-model-in-use".into());
        }
        let builtin = self.sources.builtin().map_err(|error| error.to_string())?;
        if !builtin.release() {
            return Err("vectors-model-in-use".into());
        }
        builtin.delete().map_err(|error| error.to_string())
    }

    /// The folder's status: the running job's, else what the store and the last pass say.
    pub(super) fn status(
        &self,
        entry: &Entry,
        enabled: bool,
        source: Option<&VectorSource>,
    ) -> VectorStatus {
        let vectors_bytes = vault_index::vectors::vectors_bytes(&entry.root).unwrap_or(0);
        if !enabled {
            let mut off = VectorStatus::of_phase(VectorPhase::Off);
            off.vectors_bytes = vectors_bytes;
            return off;
        }
        let (run, remembered, failure) = {
            let state = lock(&entry.state);
            (
                state.run.clone(),
                state.source.clone(),
                state.failure.clone(),
            )
        };
        let source = source.cloned().or(remembered);
        let model = match &source {
            Some(source) => readable_model(&entry.root, source),
            None => vault_index::vectors::store_model(&entry.root)
                .ok()
                .flatten(),
        };
        let summary = model.as_ref().and_then(|model| self.summary(entry, model));
        let mut status = match run {
            Some(run) => self.running_status(&run, summary),
            None => self.idle_status(summary, model.as_ref(), failure),
        };
        status.vectors_bytes = vectors_bytes;
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
    ) -> VectorStatus {
        let mut status = VectorStatus::of_phase(VectorPhase::NotSetUp);
        if let Some(summary) = summary {
            fill_counts(&mut status, &summary, 0, 0);
        }
        let kept = summary.is_some_and(|summary| summary.passages_stored > 0);
        if let Some((failure, detail)) = failure {
            status.phase = if kept {
                VectorPhase::Stopped
            } else {
                VectorPhase::Failed
            };
            status.failure = Some(failure);
            status.failure_detail = Some(detail);
            return status;
        }
        let Some(summary) = summary else {
            return status;
        };
        let model_gone = model.is_some_and(is_builtin_model)
            && self
                .sources
                .builtin()
                .is_ok_and(|builtin| !builtin.is_ready());
        status.phase = if model_gone {
            status.failure = Some(VectorFailure::ModelGone);
            status.failure_detail = Some(EmbedError::ModelNotReady.code().into());
            VectorPhase::Failed
        } else if summary.passages_stored >= summary.passages {
            VectorPhase::Ready
        } else {
            VectorPhase::Stopped
        };
        status
    }

    fn running_status(&self, run: &Run, cached: Option<Summary>) -> VectorStatus {
        let stage = *lock(&run.stage);
        let updating = run.pass == Pass::Update;
        let phase = match stage {
            Stage::Waiting if !updating => VectorPhase::WaitingTurn,
            Stage::Downloading { .. } => VectorPhase::ModelDownloading,
            Stage::Converting => VectorPhase::ModelConverting,
            Stage::Preparing => VectorPhase::Preparing,
            // An update stays quiet until it knows something changed.
            Stage::Starting | Stage::Waiting | Stage::Planning if updating => VectorPhase::Ready,
            Stage::Starting | Stage::Waiting | Stage::Planning => VectorPhase::Preparing,
        };
        let mut status = VectorStatus::of_phase(phase);
        let base = *lock(&run.base);
        match base.or(cached) {
            Some(summary) => {
                let (files, passages) = match base {
                    Some(_) => (run.progress.files_done(), run.progress.passages_done()),
                    None => (0, 0),
                };
                fill_counts(&mut status, &summary, files, passages);
            }
            None => status.files_total = run.listed.load(Ordering::Relaxed),
        }
        status.updating = updating && phase == VectorPhase::Preparing;
        if phase == VectorPhase::Preparing && stage == Stage::Preparing {
            let reading = run.progress.reading();
            status.current_path = (!reading.is_empty()).then_some(reading);
        }
        if let Stage::Downloading { done, total } = stage {
            status.model = Some(ModelBytes {
                done_bytes: done,
                total_bytes: total,
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
        self.emit.emit(&lock(&entry.shown_as), &status);
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
        self.emit.emit(&lock(&entry.shown_as), &status);
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
