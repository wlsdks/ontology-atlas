//! A fake model, sources, clock and event list: the job runs for real against the crate's store
//! in a temporary index folder, and no model file is needed.

use super::super::models::{Builtin, Runner, Sources};
use super::super::report::Clock;
use super::super::types::VectorStatus;
use super::super::{Emit, Vectors};
use crate::llm::embed::builtin::infer::Runtime;
use crate::llm::embed::builtin::{pins, Progress, Stage};
use crate::llm::embed::{BuildPlan, EmbedError, EmbedSession, Embedder, RunEnd};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, Once};
use std::time::Duration;

/// Long enough for a loaded CI runner; a passing test never waits it out.
pub(super) const WITHIN: Duration = Duration::from_secs(60);

pub(super) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// The clock tests move by hand.
#[derive(Default)]
pub(super) struct TestClock(AtomicU64);

impl TestClock {
    pub(super) fn set(&self, at: Duration) {
        self.0.store(at.as_millis() as u64, Ordering::SeqCst);
    }
}

impl Clock for TestClock {
    fn now(&self) -> Duration {
        Duration::from_millis(self.0.load(Ordering::SeqCst))
    }
}

/// Runs once, on the first event it accepts, outside the list's lock.
type Hook = Box<dyn FnMut(&VectorStatus) -> bool + Send>;

/// Every event, in order; a test waits for the one it expects.
#[derive(Default)]
pub(super) struct Events {
    list: Mutex<Vec<(String, VectorStatus)>>,
    added: Condvar,
    hook: Mutex<Option<Hook>>,
}

impl Events {
    pub(super) fn all(&self) -> Vec<(String, VectorStatus)> {
        lock(&self.list).clone()
    }

    pub(super) fn count(&self) -> usize {
        lock(&self.list).len()
    }

    /// `act` sees each event until it returns `true` once.
    pub(super) fn on_event(&self, act: impl FnMut(&VectorStatus) -> bool + Send + 'static) {
        *lock(&self.hook) = Some(Box::new(act));
    }

    pub(super) fn wait_for(&self, found: impl Fn(&VectorStatus) -> bool) -> bool {
        let list = lock(&self.list);
        let (list, _) = self
            .added
            .wait_timeout_while(list, WITHIN, |list| !list.iter().any(|(_, s)| found(s)))
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        list.iter().any(|(_, status)| found(status))
    }
}

impl Emit for Events {
    fn emit(&self, root_path: &str, status: &VectorStatus) {
        lock(&self.list).push((root_path.to_string(), status.clone()));
        self.added.notify_all();
        let hook = lock(&self.hook).take();
        if let Some(mut act) = hook {
            if !act(status) {
                *lock(&self.hook) = Some(act);
            }
        }
    }
}

/// Batches pass only as the test allows; `None` lets every batch through.
#[derive(Default)]
pub(super) struct Gate {
    tokens: Mutex<Option<u64>>,
    waiting: Mutex<usize>,
    changed: Condvar,
}

impl Gate {
    pub(super) fn hold(&self) {
        *lock(&self.tokens) = Some(0);
    }

    pub(super) fn allow(&self, batches: u64) {
        *lock(&self.tokens) = Some(batches);
        self.changed.notify_all();
    }

    pub(super) fn open(&self) {
        *lock(&self.tokens) = None;
        self.changed.notify_all();
    }

    /// `false` once `stop` is set while waiting, unless `deaf`.
    fn pass(&self, stop: &AtomicBool, deaf: bool) -> bool {
        let mut tokens = lock(&self.tokens);
        loop {
            if !deaf && stop.load(Ordering::SeqCst) {
                return false;
            }
            match *tokens {
                None => return true,
                Some(left) if left > 0 => {
                    *tokens = Some(left - 1);
                    return true;
                }
                Some(_) => {
                    *lock(&self.waiting) += 1;
                    self.changed.notify_all();
                    // Woken by `allow`, `open` or a stop the job's own wake does not reach.
                    tokens = self
                        .changed
                        .wait_timeout(tokens, Duration::from_millis(20))
                        .map(|(tokens, _)| tokens)
                        .unwrap_or_else(|poisoned| poisoned.into_inner().0);
                    *lock(&self.waiting) -= 1;
                }
            }
        }
    }

    /// Waits until a batch is held at the gate.
    pub(super) fn wait_for_held(&self) -> bool {
        let tokens = lock(&self.tokens);
        let (_tokens, _) = self
            .changed
            .wait_timeout_while(tokens, WITHIN, |_| *lock(&self.waiting) == 0)
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *lock(&self.waiting) > 0
    }
}

/// A model that turns each text into a fixed unit vector, records what it was sent, and stands
/// in for both the built-in model and a runner.
pub(super) struct FakeModel {
    pub dimensions: usize,
    pub ready: AtomicBool,
    pub gate: Gate,
    /// One worker: a batch and a question never compute at once.
    worker: Mutex<()>,
    pub loaded: AtomicBool,
    /// A batch held at the gate ignores a stop, as a runner request in flight can.
    pub deaf: AtomicBool,
    /// The next batch panics.
    pub panic_batch: AtomicBool,
    /// Preparing the model fails with this error once it reaches this step.
    pub prepare_fails_at: Mutex<Option<(Stage, EmbedError)>>,
    /// Worker starts.
    pub loads: AtomicUsize,
    pub releases: AtomicUsize,
    /// Preparations of the model: the only way it fetches anything.
    pub downloads: AtomicUsize,
    /// What the model holds on disk: a download writes it, a delete clears it.
    pub on_disk: AtomicU64,
    /// `batch` and `question`, in the order the worker served them.
    pub log: Mutex<Vec<&'static str>>,
    pub sent: Mutex<Vec<String>>,
    pub ends: Mutex<Vec<RunEnd>>,
    open_sessions: AtomicUsize,
    pub most_sessions: AtomicUsize,
    pub prepare_error: Mutex<Option<EmbedError>>,
    pub start_error: Mutex<Option<EmbedError>>,
    pub batch_error: Mutex<Option<EmbedError>>,
    pub reported_dimensions: Mutex<Result<Option<usize>, EmbedError>>,
}

impl FakeModel {
    pub(super) fn new(dimensions: usize) -> Self {
        Self {
            dimensions,
            ready: AtomicBool::new(true),
            gate: Gate::default(),
            worker: Mutex::new(()),
            loaded: AtomicBool::new(false),
            deaf: AtomicBool::new(false),
            panic_batch: AtomicBool::new(false),
            prepare_fails_at: Mutex::new(None),
            loads: AtomicUsize::new(0),
            releases: AtomicUsize::new(0),
            downloads: AtomicUsize::new(0),
            on_disk: AtomicU64::new(0),
            log: Mutex::default(),
            sent: Mutex::default(),
            ends: Mutex::default(),
            open_sessions: AtomicUsize::new(0),
            most_sessions: AtomicUsize::new(0),
            prepare_error: Mutex::new(None),
            start_error: Mutex::new(None),
            batch_error: Mutex::new(None),
            reported_dimensions: Mutex::new(Ok(Some(dimensions))),
        }
    }

    fn load(&self) {
        if !self.loaded.swap(true, Ordering::SeqCst) {
            self.loads.fetch_add(1, Ordering::SeqCst);
        }
    }

    pub(super) fn vector(&self, text: &str) -> Vec<f32> {
        let mut seed = text.bytes().fold(0xcbf2_9ce4_8422_2325u64, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
        }) | 1;
        let mut vector: Vec<f32> = (0..self.dimensions)
            .map(|_| {
                seed ^= seed << 13;
                seed ^= seed >> 7;
                seed ^= seed << 17;
                (seed % 2001) as f32 / 1000.0 - 1.0
            })
            .collect();
        let norm = vector.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-6);
        vector.iter_mut().for_each(|v| *v /= norm);
        vector
    }

    pub(super) fn sent(&self) -> Vec<String> {
        lock(&self.sent).clone()
    }
}

struct FakeSession<'m> {
    model: &'m FakeModel,
    open: bool,
}

impl FakeSession<'_> {
    fn close(&mut self) {
        if std::mem::take(&mut self.open) {
            self.model.open_sessions.fetch_sub(1, Ordering::SeqCst);
        }
    }
}

impl Drop for FakeSession<'_> {
    fn drop(&mut self) {
        self.close();
    }
}

impl EmbedSession for FakeSession<'_> {
    fn embed_batch(&mut self, passages: &[&str]) -> Result<Vec<Vec<f32>>, EmbedError> {
        self.embed_batch_until(passages, &AtomicBool::new(false))
    }

    fn embed_batch_until(
        &mut self,
        passages: &[&str],
        stop: &AtomicBool,
    ) -> Result<Vec<Vec<f32>>, EmbedError> {
        if !self
            .model
            .gate
            .pass(stop, self.model.deaf.load(Ordering::SeqCst))
        {
            return Err(EmbedError::Cancelled);
        }
        if self.model.panic_batch.swap(false, Ordering::SeqCst) {
            panic!("a fault inside the job");
        }
        if let Some(error) = lock(&self.model.batch_error).clone() {
            return Err(error);
        }
        let _worker = lock(&self.model.worker);
        lock(&self.model.log).push("batch");
        lock(&self.model.sent).extend(passages.iter().map(|text| text.to_string()));
        Ok(passages
            .iter()
            .map(|text| self.model.vector(text))
            .collect())
    }

    fn finish(mut self: Box<Self>, ended: RunEnd) -> Result<(), EmbedError> {
        lock(&self.model.ends).push(ended);
        self.close();
        Ok(())
    }
}

impl Embedder for FakeModel {
    fn model(&self) -> &str {
        "fake"
    }

    fn start_build<'a>(
        &'a self,
        _vault_dir: &Path,
        _plan: BuildPlan,
    ) -> Result<Box<dyn EmbedSession + 'a>, EmbedError> {
        if let Some(error) = lock(&self.start_error).clone() {
            return Err(error);
        }
        let open = self.open_sessions.fetch_add(1, Ordering::SeqCst) + 1;
        self.most_sessions.fetch_max(open, Ordering::SeqCst);
        self.load();
        Ok(Box::new(FakeSession {
            model: self,
            open: true,
        }))
    }

    fn embed_query(&self, _vault_dir: &Path, question: &str) -> Result<Vec<f32>, EmbedError> {
        if !self.ready.load(Ordering::SeqCst) {
            return Err(EmbedError::ModelNotReady);
        }
        let _worker = lock(&self.worker);
        self.load();
        lock(&self.log).push("question");
        Ok(self.vector(question))
    }
}

impl Builtin for FakeModel {
    fn is_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }

    fn prepare(
        &self,
        _vault_dir: &Path,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
    ) -> Result<(), EmbedError> {
        self.downloads.fetch_add(1, Ordering::SeqCst);
        if let Some(error) = lock(&self.prepare_error).clone() {
            return Err(error);
        }
        for (stage, done, total) in [
            (Stage::Verify, 10, 100),
            (Stage::Download, 60, 100),
            (Stage::Download, 100, 100),
            (Stage::Convert, 5, 10),
            (Stage::Check, 1, 1),
        ] {
            if cancel.load(Ordering::SeqCst) {
                return Err(EmbedError::Cancelled);
            }
            on_progress(&Progress { stage, done, total });
            if stage == Stage::Download {
                self.on_disk.store(done * 1_000, Ordering::SeqCst);
            }
            let fails = lock(&self.prepare_fails_at)
                .as_ref()
                .filter(|(at, _)| *at == stage)
                .map(|(_, error)| error.clone());
            if let Some(error) = fails {
                return Err(error);
            }
        }
        self.ready.store(true, Ordering::SeqCst);
        Ok(())
    }

    fn delete(&self) -> Result<(), EmbedError> {
        if self.open_sessions.load(Ordering::SeqCst) > 0 {
            return Err(EmbedError::ModelBusy);
        }
        let _worker = lock(&self.worker);
        self.releases.fetch_add(1, Ordering::SeqCst);
        self.loaded.store(false, Ordering::SeqCst);
        self.ready.store(false, Ordering::SeqCst);
        self.on_disk.store(0, Ordering::SeqCst);
        Ok(())
    }

    fn warm(&self) {
        let _worker = lock(&self.worker);
        self.load();
    }

    fn release(&self) -> bool {
        if self.open_sessions.load(Ordering::SeqCst) > 0 {
            return false;
        }
        self.releases.fetch_add(1, Ordering::SeqCst);
        self.loaded.store(false, Ordering::SeqCst);
        true
    }

    fn runtime(&self) -> Runtime {
        Runtime {
            device: "metal",
            dtype: "f16",
            memory_bytes: 1_800_000_000,
        }
    }

    fn space_needed(&self) -> u64 {
        0
    }

    fn free_bytes(&self) -> Option<u64> {
        Some(1 << 40)
    }

    fn model_bytes(&self) -> u64 {
        self.on_disk.load(Ordering::SeqCst)
    }

    fn dir(&self) -> PathBuf {
        PathBuf::from("/fake/models/bge-m3")
    }
}

impl Runner for FakeModel {
    fn dimensions(&self) -> Result<Option<usize>, EmbedError> {
        lock(&self.reported_dimensions).clone()
    }
}

pub(super) struct FakeSources {
    pub builtin: Arc<FakeModel>,
    pub runner: Arc<FakeModel>,
    pub runner_error: Mutex<Option<EmbedError>>,
    pub walk_fails: AtomicBool,
    made: AtomicBool,
}

impl Sources for FakeSources {
    fn builtin(&self) -> Result<Arc<dyn Builtin>, EmbedError> {
        self.made.store(true, Ordering::SeqCst);
        Ok(self.builtin.clone())
    }

    fn builtin_if_made(&self) -> Option<Arc<dyn Builtin>> {
        self.made
            .load(Ordering::SeqCst)
            .then(|| self.builtin.clone() as Arc<dyn Builtin>)
    }

    fn runner(&self, _base_url: &str, _model: &str) -> Result<Arc<dyn Runner>, EmbedError> {
        match lock(&self.runner_error).clone() {
            Some(error) => Err(error),
            None => Ok(self.runner.clone()),
        }
    }

    fn markdown_files(&self, root: &Path) -> Result<Vec<String>, String> {
        if self.walk_fails.load(Ordering::SeqCst) {
            return Err("permission denied".into());
        }
        crate::vault::index::markdown_files(root).map(|walked| walked.files)
    }
}

pub(super) struct Harness {
    pub vectors: Arc<Vectors>,
    pub clock: Arc<TestClock>,
    pub events: Arc<Events>,
    pub sources: Arc<FakeSources>,
}

impl Harness {
    pub(super) fn new() -> Self {
        Self::with_background(false)
    }

    /// With the progress ticker and the housekeeping thread started, as in the app.
    pub(super) fn with_background(background: bool) -> Self {
        use_test_index_folder();
        let clock = Arc::new(TestClock::default());
        let events = Arc::new(Events::default());
        let sources = Arc::new(FakeSources {
            builtin: Arc::new(FakeModel::new(pins::DIMENSIONS)),
            runner: Arc::new(FakeModel::new(8)),
            runner_error: Mutex::new(None),
            walk_fails: AtomicBool::new(false),
            made: AtomicBool::new(false),
        });
        let vectors = Arc::new(Vectors::new(
            sources.clone(),
            clock.clone(),
            events.clone(),
            background,
        ));
        Self {
            vectors,
            clock,
            events,
            sources,
        }
    }

    pub(super) fn model(&self) -> &FakeModel {
        &self.sources.builtin
    }
}

/// The same folder `vault::index` tests use, so the variable never changes under a running test.
fn use_test_index_folder() {
    static INDEX_DIR: Once = Once::new();
    INDEX_DIR.call_once(|| {
        let dir = std::env::temp_dir().join(format!("atlas-index-bridge-{}", std::process::id()));
        std::env::set_var(vault_index::INDEX_DIR_OVERRIDE_ENV, dir);
    });
}

/// A vault of `count` files, each one passage of its own text.
pub(super) fn vault(label: &str, count: usize) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "atlas-vectors-{label}-{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(dir.join("wiki")).unwrap();
    for at in 0..count {
        let folder = if at % 2 == 0 { "wiki" } else { "sources" };
        std::fs::create_dir_all(dir.join(folder)).unwrap();
        std::fs::write(
            dir.join(folder).join(format!("note-{at:03}.md")),
            format!("# Note {at}\n\nPassage number {at} about quillwort and sedges.\n"),
        )
        .unwrap();
    }
    std::fs::canonicalize(&dir).unwrap()
}

pub(super) fn cleanup(root: &Path) {
    let _ = vault_index::delete(Some(root));
    let _ = std::fs::remove_dir_all(root);
}
