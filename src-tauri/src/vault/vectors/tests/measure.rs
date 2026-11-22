//! `pnpm perf:meaning -- --builtin`: the app's own job and search over a generated vault, with the
//! built-in model in a real worker serving `ATLAS_VECTORS_MODEL_STORE`, a store that
//! `pnpm perf:builtin-model -- --only=prepare` made from local files. The store must already be
//! ready, so nothing is downloaded. Each mark prints one JSON line; the script reads this
//! process's heap while the job runs.

use super::super::job::Entry;
use super::super::models::{builtin_model, AppSources};
use super::super::report::MonotonicClock;
use super::super::types::{VectorPhase, VectorSource, VectorStatus};
use super::super::{lock, Emit, Vectors};
use crate::llm::embed::builtin::client::{spawn_piped, BuiltinModel, Launch, Spawned, LIMITS};
use crate::llm::embed::builtin::worker::{serve, StoreModels, WORKER_IDLE};
use crate::llm::embed::builtin::{pins, ModelStore};
use crate::llm::embed::EmbedError;
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

const STORE_ENV: &str = "ATLAS_VECTORS_MODEL_STORE";
const VAULT_ENV: &str = "ATLAS_VECTORS_VAULT";
const QUESTIONS_ENV: &str = "ATLAS_VECTORS_QUESTIONS";
const CHILD_ENV: &str = "ATLAS_VECTORS_WORKER_CHILD";
const CHILD_TEST: &str = "vault::vectors::tests::measure::measured_worker_child";
/// The memory the brief asks about once the app has settled after a job.
const SETTLE: Duration = Duration::from_secs(60);
const PREPARE_WITHIN: Duration = Duration::from_secs(4 * 60 * 60);

#[test]
#[ignore = "the worker the measurement starts"]
fn measured_worker_child() {
    let (Some(_), Ok(store)) = (std::env::var_os(CHILD_ENV), std::env::var(STORE_ENV)) else {
        return;
    };
    let models = StoreModels(ModelStore::at(PathBuf::from(store)));
    let code = serve(std::io::stdin(), std::io::stdout(), &models, WORKER_IDLE);
    std::process::exit(code);
}

/// The test harness prints `running 1 test` before the worker speaks.
struct AfterBanner<R> {
    inner: R,
    seen: bool,
}

impl<R: Read> Read for AfterBanner<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if !self.seen {
            const BANNER: &[u8] = b"running 1 test\n";
            let mut tail = Vec::new();
            let mut byte = [0u8; 1];
            while !tail.ends_with(BANNER) {
                if self.inner.read(&mut byte)? == 0 {
                    return Ok(0);
                }
                tail.push(byte[0]);
            }
            self.seen = true;
        }
        self.inner.read(buf)
    }
}

struct MeasuredWorker;

impl Launch for MeasuredWorker {
    fn launch(&self) -> Result<Spawned, EmbedError> {
        let mut command =
            Command::new(std::env::current_exe().map_err(|_| EmbedError::WorkerExited)?);
        crate::child_process::no_console::hide_console(&mut command)
            .args([
                "--exact",
                CHILD_TEST,
                "--ignored",
                "--nocapture",
                "--test-threads=1",
                "-q",
            ])
            .env(CHILD_ENV, "1");
        let mut spawned = spawn_piped(command)?;
        spawned.output = Box::new(AfterBanner {
            inner: spawned.output,
            seen: false,
        });
        Ok(spawned)
    }
}

/// The last status the job sent, for a measurement waiting on a phase, and the last rate it
/// reported while preparing (`ready` carries none).
#[derive(Default)]
struct Latest {
    status: Mutex<Option<VectorStatus>>,
    rate: Mutex<Option<f64>>,
    changed: Condvar,
}

impl Emit for Latest {
    fn emit(&self, _: &str, status: &VectorStatus) {
        if status.passages_per_second.is_some() {
            *lock(&self.rate) = status.passages_per_second;
        }
        *lock(&self.status) = Some(status.clone());
        self.changed.notify_all();
    }
}

impl Latest {
    fn wait_until_done(&self) -> VectorStatus {
        let status = lock(&self.status);
        let (status, _) = self
            .changed
            .wait_timeout_while(status, PREPARE_WITHIN, |status| {
                !status.as_ref().is_some_and(|status| {
                    matches!(
                        status.phase,
                        VectorPhase::Ready | VectorPhase::Stopped | VectorPhase::Failed
                    )
                })
            })
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        status.clone().expect("the job sent no status")
    }

    fn rate(&self) -> Option<f64> {
        *lock(&self.rate)
    }
}

/// A process's current and lifetime-peak physical footprint in MiB, as Activity Monitor counts it.
#[cfg(target_os = "macos")]
fn footprint_of(pid: u32) -> (f64, f64) {
    extern "C" {
        fn proc_pid_rusage(pid: i32, flavor: i32, buffer: *mut u64) -> i32;
    }
    let mut info = [0u64; 64];
    // SAFETY: flavor 4 is RUSAGE_INFO_V4, which fits in 64 u64 words.
    let status = unsafe { proc_pid_rusage(pid as i32, 4, info.as_mut_ptr()) };
    if status != 0 {
        return (f64::NAN, f64::NAN);
    }
    let mib = |bytes: u64| bytes as f64 / 1_048_576.0;
    (mib(info[9]), mib(info[30]))
}

#[cfg(not(target_os = "macos"))]
fn footprint_of(_: u32) -> (f64, f64) {
    (f64::NAN, f64::NAN)
}

fn app_footprint() -> f64 {
    footprint_of(std::process::id()).0
}

/// The largest footprint of the app and of its worker while a job runs, read every 250 ms.
struct Sampler {
    running: Arc<AtomicBool>,
    thread: std::thread::JoinHandle<(f64, f64)>,
}

impl Sampler {
    fn start(model: Arc<BuiltinModel>) -> Self {
        let running = Arc::new(AtomicBool::new(true));
        let flag = running.clone();
        let thread = std::thread::spawn(move || {
            let (mut app, mut worker) = (0f64, 0f64);
            while flag.load(Ordering::SeqCst) {
                app = app.max(app_footprint());
                if let Some(pid) = model.worker_id() {
                    worker = worker.max(footprint_of(pid).0);
                }
                std::thread::sleep(Duration::from_millis(250));
            }
            (app, worker)
        });
        Self { running, thread }
    }

    fn stop(self) -> (f64, f64) {
        self.running.store(false, Ordering::SeqCst);
        self.thread.join().unwrap()
    }
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    sorted[((sorted.len() as f64 - 1.0) * p).round() as usize]
}

fn questions() -> Vec<String> {
    #[derive(serde::Deserialize)]
    struct Labelled {
        questions: Vec<Question>,
    }
    #[derive(serde::Deserialize)]
    struct Question {
        question: String,
    }
    let path = std::env::var(QUESTIONS_ENV).expect("set ATLAS_VECTORS_QUESTIONS");
    let labelled: Labelled = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    labelled.questions.into_iter().map(|q| q.question).collect()
}

fn ask(vectors: &Arc<Vectors>, entry: &Arc<Entry>, question: &str) -> f64 {
    let started = Instant::now();
    let found = vectors.search(entry, &VectorSource::Builtin, question, 8, &[]);
    let ms = started.elapsed().as_secs_f64() * 1_000.0;
    assert_eq!(found.failure, None, "the search failed: {:?}", found.state);
    assert!(!found.hits.is_empty(), "the search found nothing");
    ms
}

#[test]
#[ignore = "prepares a generated vault with the real model; pnpm perf:meaning -- --builtin"]
fn a_folder_prepared_and_asked_on_this_computer() {
    assert!(
        vault_index::index_dir_override_honoured(),
        "build with --features vault-index/index-dir-override so the index stays in its own folder"
    );
    let store = ModelStore::at(PathBuf::from(
        std::env::var(STORE_ENV).expect("set ATLAS_VECTORS_MODEL_STORE"),
    ));
    assert!(
        store.is_ready(),
        "prepare the store with perf:builtin-model first"
    );
    let root =
        std::fs::canonicalize(std::env::var(VAULT_ENV).expect("set ATLAS_VECTORS_VAULT")).unwrap();
    let questions = questions();

    let model = Arc::new(BuiltinModel::with_launch(
        store,
        Box::new(MeasuredWorker),
        LIMITS,
        pins::DIMENSIONS,
    ));
    let latest = Arc::new(Latest::default());
    let vectors = Arc::new(Vectors::new(
        Arc::new(AppSources::with_builtin(model.clone())),
        Arc::new(MonotonicClock::new()),
        latest.clone(),
        true,
    ));
    let entry = vectors.entry(&root, &root.to_string_lossy());

    let app_before = app_footprint();
    println!("{{\"mark\":\"preparing\",\"pid\":{}}}", std::process::id());
    let sampler = Sampler::start(model.clone());
    let started = Instant::now();
    vectors.prepare(&entry, VectorSource::Builtin, true);
    let done = latest.wait_until_done();
    let prepare_s = started.elapsed().as_secs_f64();
    let (app_peak, worker_peak) = sampler.stop();
    let app_lifetime_peak = footprint_of(std::process::id()).1;
    assert_eq!(done.phase, VectorPhase::Ready, "{done:?}");
    println!(
        "{{\"mark\":\"prepared\",\"files\":{},\"passages\":{},\"prepare_s\":{prepare_s:.1},\"passages_per_s\":{:.2},\"reported_passages_per_s\":{},\"vectors_bytes\":{},\"app_before_mib\":{app_before:.0},\"app_peak_mib\":{app_peak:.0},\"app_lifetime_peak_mib\":{app_lifetime_peak:.0},\"worker_peak_mib\":{worker_peak:.0}}}",
        done.files_total,
        done.passages_total,
        done.passages_total as f64 / prepare_s,
        latest.rate().map_or("null".into(), |rate| format!("{rate:.2}")),
        done.vectors_bytes,
    );

    let ended = Instant::now();
    std::thread::sleep(SETTLE.saturating_sub(ended.elapsed()));
    println!(
        "{{\"mark\":\"settled\",\"after_s\":{:.0},\"app_mib\":{:.0},\"worker_running\":{}}}",
        ended.elapsed().as_secs_f64(),
        app_footprint(),
        model.worker_id().is_some()
    );

    let cold_ms = ask(&vectors, &entry, &questions[0]);
    let mut warm = Vec::new();
    for question in questions.iter().cycle().skip(1).take(500) {
        warm.push(ask(&vectors, &entry, question));
    }
    warm.sort_by(f64::total_cmp);
    println!(
        "{{\"mark\":\"asked\",\"cold_ms\":{cold_ms:.0},\"questions\":{},\"p50_ms\":{:.1},\"p95_ms\":{:.1},\"max_ms\":{:.1},\"app_mib\":{:.0}}}",
        warm.len(),
        percentile(&warm, 0.5),
        percentile(&warm, 0.95),
        warm.last().unwrap(),
        app_footprint()
    );

    let files = crate::vault::index::markdown_files(&root).unwrap().files;
    let mut plans = Vec::new();
    for _ in 0..5 {
        let started = Instant::now();
        let plan = vault_index::vectors::plan(
            &root,
            &builtin_model(),
            &files,
            &vault_index::vectors::PrepareProgress::default(),
        )
        .unwrap();
        plans.push(started.elapsed().as_secs_f64() * 1_000.0);
        assert_eq!(
            plan.remaining().passages,
            0,
            "nothing changed, so nothing remains"
        );
    }
    plans.sort_by(f64::total_cmp);
    println!(
        "{{\"mark\":\"planned\",\"files\":{},\"plan_ms_median\":{:.0},\"plan_ms_max\":{:.0}}}",
        files.len(),
        percentile(&plans, 0.5),
        plans.last().unwrap()
    );
    assert!(model.release());
}
