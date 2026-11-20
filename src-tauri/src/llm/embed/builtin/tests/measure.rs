//! `pnpm perf:builtin-model` on the publisher's files in `ATLAS_BGE_M3_DIR`; each test
//! prints one JSON line. The worker is this binary again as `real_worker_child`,
//! serving `ATLAS_MEASURE_STORE` as the app's worker serves its own.

use super::super::client::{self, BuiltinModel, Launch, Spawned, WorkerState};
use super::super::download::file_matches;
use super::super::fetch::{Fetch, Head, Sink};
use super::super::infer::{self, groups, Encoder, Runtime};
use super::super::pins;
use super::super::worker::{serve, Model, Models, StoreModels, WORKER_IDLE};
use super::process::harness_child;
use super::*;
use candle_nn::VarBuilder;
use candle_transformers::models::xlm_roberta::XLMRobertaModel;

fn publisher_dir() -> PathBuf {
    PathBuf::from(std::env::var("ATLAS_BGE_M3_DIR").expect("set ATLAS_BGE_M3_DIR"))
}

fn measured_store() -> ModelStore {
    ModelStore::at(PathBuf::from(
        std::env::var("ATLAS_MEASURE_STORE").expect("set ATLAS_MEASURE_STORE"),
    ))
}

fn ready_store() -> ModelStore {
    let store = measured_store();
    assert!(store.is_ready(), "run the prepare step first");
    store
}

fn measure_vault(store: &ModelStore) -> PathBuf {
    let vault = store.dir().with_file_name("vault");
    fs::create_dir_all(&vault).unwrap();
    vault
}

/// Passages and questions split by the script with the desk harness's splitter.
#[derive(Deserialize)]
struct Texts {
    fixture: Vec<String>,
    questions: Vec<String>,
    docs: Vec<String>,
    probes: Vec<String>,
}

fn texts() -> Texts {
    let path = std::env::var("ATLAS_MEANING_TEXTS").expect("set ATLAS_MEANING_TEXTS");
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

/// A process's current and lifetime-peak physical footprint in MiB, as Activity
/// Monitor counts it.
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

/// This process: the app's side of the worker.
fn footprint() -> (f64, f64) {
    footprint_of(std::process::id())
}

#[cfg(unix)]
fn exists(pid: u32) -> bool {
    // SAFETY: signal 0 only checks that the process exists.
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[cfg(not(unix))]
fn exists(_: u32) -> bool {
    false
}

const STORE_ENV: &str = "ATLAS_WORKER_STORE";
const IDLE_ENV: &str = "ATLAS_WORKER_IDLE_MS";
const CPU_ENV: &str = "ATLAS_WORKER_CPU";

/// The store on the CPU in f32, as Windows and Linux run it.
struct CpuModels(ModelStore);

impl Models for CpuModels {
    fn load(&self) -> Result<Box<dyn Model>, EmbedError> {
        let encoder = Encoder::load(
            &self.0.weights(),
            &self.0.tokenizer(),
            &infer::config(pins::CONFIG_JSON)?,
            Device::Cpu,
            DType::F32,
        )?;
        Ok(Box::new(encoder))
    }

    fn convert(&self, _: &AtomicBool, _: &mut dyn FnMut(u64, u64)) -> Result<(), EmbedError> {
        Err(EmbedError::ModelNotReady)
    }

    fn check(&self) -> Result<(), EmbedError> {
        Err(EmbedError::ModelNotReady)
    }
}

#[test]
#[ignore = "the real worker the measurements start"]
fn real_worker_child() {
    let (Ok(store), Some(idle)) = (
        std::env::var(STORE_ENV),
        std::env::var(IDLE_ENV).ok().and_then(|ms| ms.parse().ok()),
    ) else {
        return;
    };
    let store = ModelStore::at(PathBuf::from(store));
    let idle = Duration::from_millis(idle);
    let code = if std::env::var_os(CPU_ENV).is_some() {
        serve(std::io::stdin(), std::io::stdout(), &CpuModels(store), idle)
    } else {
        serve(
            std::io::stdin(),
            std::io::stdout(),
            &StoreModels(store),
            idle,
        )
    };
    std::process::exit(code);
}

struct RealWorker {
    store: PathBuf,
    idle: Duration,
    cpu: bool,
}

impl Launch for RealWorker {
    fn launch(&self) -> Result<Spawned, EmbedError> {
        let mut env = vec![
            (STORE_ENV, self.store.to_string_lossy().into_owned()),
            (IDLE_ENV, self.idle.as_millis().to_string()),
        ];
        if self.cpu {
            env.push((CPU_ENV, "1".into()));
        }
        harness_child(
            "llm::embed::builtin::tests::measure::real_worker_child",
            &env,
        )
    }
}

/// Preparation's model work in a real worker on the measured store.
impl ModelWork for RealWorker {
    fn convert(
        &self,
        _: &ModelStore,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(u64, u64),
    ) -> Result<(), EmbedError> {
        client::convert_in_worker(self, client::LIMITS, cancel, on_progress)
    }

    fn check(&self, _: &ModelStore) -> Result<(), EmbedError> {
        client::check_in_worker(self, client::LIMITS)
    }
}

fn worker_model(store: ModelStore, idle: Duration, cpu: bool) -> BuiltinModel {
    let launch = RealWorker {
        store: store.dir().to_path_buf(),
        idle,
        cpu,
    };
    BuiltinModel::with_launch(store, Box::new(launch), client::LIMITS, pins::DIMENSIONS)
}

fn wait_for_exit(model: &BuiltinModel, pid: u32, within: Duration) -> f64 {
    let started = Instant::now();
    while model.state() != WorkerState::NotRunning || exists(pid) {
        assert!(started.elapsed() < within, "worker {pid} is still running");
        std::thread::sleep(Duration::from_millis(20));
    }
    started.elapsed().as_secs_f64()
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    sorted[((sorted.len() as f64 - 1.0) * p).round() as usize]
}

/// Serves the publisher's files from disk under their pinned URLs.
struct LocalFiles(PathBuf);

impl Fetch for LocalFiles {
    fn get(
        &self,
        url: &str,
        from: u64,
        cancel: &AtomicBool,
        sink: &mut dyn Sink,
    ) -> Result<(), EmbedError> {
        let name = url.rsplit('/').next().unwrap();
        let mut file = fs::File::open(self.0.join(name)).unwrap();
        let len = file.metadata().unwrap().len();
        assert_eq!(from, 0, "a fresh store resumes nothing");
        let head = Head {
            status: 200,
            content_length: Some(len),
            ..Head::default()
        };
        if !sink.head(&head)? {
            return Ok(());
        }
        let mut buffer = vec![0u8; 4 * 1024 * 1024];
        loop {
            if cancel.load(Ordering::Relaxed) {
                return Err(EmbedError::Cancelled);
            }
            let read = file.read(&mut buffer).unwrap();
            match buffer.get(..read) {
                Some(chunk) if !chunk.is_empty() => sink.body(chunk)?,
                _ => return Ok(()),
            }
        }
    }
}

#[test]
#[ignore = "reads the publisher's files; pnpm perf:builtin-model"]
fn publisher_files_match_the_pins() {
    for file in pins::DOWNLOADS {
        let path = publisher_dir().join(file.name);
        let matches = file_matches(&path, &file, &never(), &mut |_| {}).unwrap();
        println!(
            "{{\"file\":\"{}\",\"bytes\":{},\"matches_pin\":{matches}}}",
            file.name,
            fs::metadata(&path).map_or(0, |meta| meta.len())
        );
        assert!(matches, "{} differs from its pin", file.name);
    }
}

#[test]
#[ignore = "prepares the real model from the publisher's files; pnpm perf:builtin-model"]
fn prepare_from_the_publisher_files() {
    let store = measured_store();
    store.delete().unwrap();
    let vault = measure_vault(&store);
    let mut marks: Vec<(Stage, Instant)> = Vec::new();
    let launch = RealWorker {
        store: store.dir().to_path_buf(),
        idle: WORKER_IDLE,
        cpu: false,
    };
    let recipe = Recipe {
        work: &launch,
        ..PINNED
    };
    let before = footprint().0;
    let started = Instant::now();
    let prepared = store.prepare_with(
        &LocalFiles(publisher_dir()),
        &recipe,
        &vault,
        &never(),
        &mut |progress| {
            if marks.last().map(|mark| mark.0) != Some(progress.stage) {
                marks.push((progress.stage, Instant::now()));
            }
        },
    );
    prepared.result.unwrap();
    let ended = Instant::now();
    let (after, peak) = footprint();
    std::thread::sleep(Duration::from_secs(5));
    let after_5s = footprint().0;
    std::thread::sleep(Duration::from_secs(55));
    let after_60s = footprint().0;
    let seconds = |stage: Stage| {
        let at = marks.iter().position(|mark| mark.0 == stage).unwrap();
        let end = marks.get(at + 1).map_or(ended, |mark| mark.1);
        end.duration_since(marks[at].1).as_secs_f64()
    };
    let total_s = ended.duration_since(started).as_secs_f64();
    println!(
        "{{\"total_s\":{:.1},\"copy_and_hash_s\":{:.1},\"convert_in_worker_s\":{:.1},\"check_in_worker_s\":{:.1},\"kept_bytes\":{},\"app_before_mib\":{before:.0},\"app_peak_mib\":{peak:.0},\"app_after_mib\":{after:.0},\"app_after_5s_mib\":{after_5s:.0},\"app_after_60s_mib\":{after_60s:.0}}}",
        total_s,
        seconds(Stage::Download),
        seconds(Stage::Convert),
        seconds(Stage::Check),
        store.bytes()
    );
    assert!(store.is_ready());
}

#[test]
#[ignore = "loads fp32 and f16 bge-m3; pnpm perf:builtin-model"]
fn f16_matches_fp32_on_the_fixture() {
    let store = ready_store();
    let texts = texts().fixture;
    let texts: Vec<&str> = texts.iter().map(String::as_str).collect();
    let (device, dtype) = infer::device();
    let config = infer::config(pins::CONFIG_JSON).unwrap();
    let ours = Encoder::load(
        &store.weights(),
        &store.tokenizer(),
        &config,
        device.clone(),
        dtype,
    )
    .unwrap();
    let ours: Vec<Vec<f32>> = texts
        .chunks(32)
        .flat_map(|batch| ours.embed(batch).unwrap())
        .collect();
    let vb = VarBuilder::from_pth(
        publisher_dir().join(pins::WEIGHTS.name),
        DType::F32,
        &device,
    )
    .unwrap();
    let reference = Encoder::from_parts(
        infer::tokenizer(&store.tokenizer(), infer::MAX_TOKENS).unwrap(),
        XLMRobertaModel::new(&config, vb).unwrap(),
        device,
        config.pad_token_id,
        infer::MAX_TOKENS,
    );
    let mut cosines: Vec<f64> = texts
        .chunks(32)
        .flat_map(|batch| reference.embed(batch).unwrap())
        .zip(&ours)
        .map(|(a, b)| f64::from(cosine(&a, b)))
        .collect();
    cosines.sort_by(f64::total_cmp);
    println!(
        "{{\"passages\":{},\"min\":{:.6},\"p01\":{:.6},\"mean\":{:.6},\"below_0_999\":{}}}",
        cosines.len(),
        cosines[0],
        percentile(&cosines, 0.01),
        cosines.iter().sum::<f64>() / cosines.len() as f64,
        cosines.iter().filter(|&&c| c < 0.999).count()
    );
    assert!(cosines[0] >= 0.999);
}

#[test]
#[ignore = "embeds 2,000+ passages and 180 questions in a worker; pnpm perf:builtin-model"]
fn a_build_and_questions_on_this_computer() {
    let store = ready_store();
    let vault = measure_vault(&store);
    let model = worker_model(store.clone(), WORKER_IDLE, false);
    let texts = texts();
    let base = footprint().0;

    let started = Instant::now();
    Embedder::embed_query(&model, &vault, &texts.questions[0]).unwrap();
    let first_vector_s = started.elapsed().as_secs_f64();
    let pid = model.worker_id().unwrap();
    let worker_loaded = footprint_of(pid).0;

    let passages: Vec<&str> = texts
        .docs
        .iter()
        .chain(&texts.fixture)
        .step_by(2)
        .map(String::as_str)
        .collect();
    let chars = passages.iter().map(|text| text.chars().count()).sum();
    let mut session = Embedder::start_build(
        &model,
        &vault,
        BuildPlan {
            files: 1,
            passages: passages.len(),
            chars,
        },
    )
    .unwrap();
    let mut app_during = 0f64;
    let started = Instant::now();
    for range in crate::llm::embed::plan_batches(&passages) {
        let vectors = session.embed_batch(&passages[range]).unwrap();
        assert!(vectors.iter().all(|v| v.len() == pins::DIMENSIONS));
        app_during = app_during.max(footprint().0);
    }
    let build_s = started.elapsed().as_secs_f64();
    session.finish(RunEnd::Complete).unwrap();

    let mut latencies = Vec::new();
    for round in 0..4 {
        for question in &texts.questions {
            let started = Instant::now();
            Embedder::embed_query(&model, &vault, question).unwrap();
            if round > 0 {
                latencies.push(started.elapsed().as_secs_f64() * 1_000.0);
            }
        }
    }
    latencies.sort_by(f64::total_cmp);
    let (worker_now, worker_peak) = footprint_of(pid);
    let device = model.runtime().device;

    assert!(model.release());
    let gone_after_release = !exists(pid);
    let app_after_release = footprint().0;
    std::thread::sleep(Duration::from_secs(60));
    let app_after_60s = footprint().0;

    let short = worker_model(store, Duration::from_secs(3), false);
    Embedder::embed_query(&short, &vault, &texts.questions[0]).unwrap();
    let idle_pid = short.worker_id().unwrap();
    let idle_exit_s = wait_for_exit(&short, idle_pid, Duration::from_secs(30));

    let per_second = passages.len() as f64 / build_s;
    println!(
        "{{\"device\":\"{device}\",\"app_before_mib\":{base:.0},\"first_vector_s\":{first_vector_s:.2},\"worker_loaded_mib\":{worker_loaded:.0},\"passages\":{},\"passages_per_s\":{per_second:.2},\"app_during_build_max_mib\":{app_during:.0},\"questions\":{},\"query_ms_p50\":{:.1},\"query_ms_p95\":{:.1},\"query_ms_max\":{:.1},\"worker_now_mib\":{worker_now:.0},\"worker_peak_mib\":{worker_peak:.0},\"gone_after_release\":{gone_after_release},\"app_after_release_mib\":{app_after_release:.0},\"app_after_60s_mib\":{app_after_60s:.0},\"idle_limit_s\":3,\"gone_after_idle_s\":{idle_exit_s:.1}}}",
        passages.len(),
        latencies.len(),
        percentile(&latencies, 0.5),
        percentile(&latencies, 0.95),
        latencies.last().unwrap(),
    );
    assert!(gone_after_release);
}

#[test]
#[ignore = "runs bge-m3 on the CPU in f32 in a worker; pnpm perf:builtin-model"]
fn one_batch_on_the_cpu() {
    let store = ready_store();
    let vault = measure_vault(&store);
    let texts = texts();
    let mut passages: Vec<&str> = texts
        .docs
        .iter()
        .chain(&texts.fixture)
        .map(String::as_str)
        .collect();
    // The longest passage alone is the longest pass a stop can wait for.
    passages.sort_by_key(|text| std::cmp::Reverse(text.chars().count()));
    let batch: Vec<&str> = passages
        .iter()
        .step_by(passages.len() / 32)
        .take(32)
        .copied()
        .collect();
    let tokenizer = infer::tokenizer(&store.tokenizer(), infer::MAX_TOKENS).unwrap();
    let encode = |texts: &[&str]| -> Vec<Vec<u32>> {
        texts
            .iter()
            .map(|text| {
                let encoding = tokenizer.encode(infer::nfc(text), true).unwrap();
                let ids = encoding.get_ids();
                ids.get(..infer::MAX_TOKENS).unwrap_or(ids).to_vec()
            })
            .collect()
    };
    let ids = encode(&batch);
    let mut order: Vec<usize> = (0..ids.len()).collect();
    order.sort_by_key(|&index| ids[index].len());
    let passes = groups(&order, &ids, infer::CPU_BUDGET).len();
    let longest_tokens = encode(&[passages[0]])[0].len();

    let model = worker_model(store, WORKER_IDLE, true);
    let base = footprint().0;
    let chars = batch
        .iter()
        .chain([&passages[0]])
        .map(|t| t.chars().count())
        .sum();
    let mut session = Embedder::start_build(
        &model,
        &vault,
        BuildPlan {
            files: 1,
            passages: batch.len() + 1,
            chars,
        },
    )
    .unwrap();
    let pid = model.worker_id().unwrap();
    let loaded = footprint_of(pid).0;
    let runtime: Runtime = model.runtime();
    let started = Instant::now();
    session.embed_batch(&[passages[0]]).unwrap();
    let longest_s = started.elapsed().as_secs_f64();
    let started = Instant::now();
    session.embed_batch(&batch).unwrap();
    let batch_s = started.elapsed().as_secs_f64();
    session.finish(RunEnd::Complete).unwrap();
    let (worker_now, worker_peak) = footprint_of(pid);
    let app_now = footprint().0;
    assert!(model.release());
    println!(
        "{{\"device\":\"{}\",\"dtype\":\"{}\",\"worker_loaded_mib\":{loaded:.0},\"longest_passage_tokens\":{longest_tokens},\"longest_passage_s\":{longest_s:.2},\"batch\":{},\"passes\":{passes},\"batch_s\":{batch_s:.1},\"passages_per_s\":{:.2},\"worker_now_mib\":{worker_now:.0},\"worker_peak_mib\":{worker_peak:.0},\"app_before_mib\":{base:.0},\"app_after_mib\":{app_now:.0},\"gone_after_release\":{}}}",
        runtime.device,
        runtime.dtype,
        batch.len(),
        batch.len() as f64 / batch_s,
        !exists(pid),
    );
}

/// Our vectors for the fixture, its questions and the reference probes, for the
/// script to compare with another implementation of the same model.
#[test]
#[ignore = "writes the model's vectors for the fixture; pnpm perf:builtin-model"]
fn vectors_for_the_fixture() {
    let store = ready_store();
    let vault = measure_vault(&store);
    let model = worker_model(store, WORKER_IDLE, false);
    let texts = texts();
    let embed = |list: &[String]| -> Vec<Vec<f32>> {
        let list: Vec<&str> = list.iter().map(String::as_str).collect();
        let mut out = Vec::new();
        let chars = list.iter().map(|text| text.chars().count()).sum();
        let plan = BuildPlan {
            files: 1,
            passages: list.len(),
            chars,
        };
        let mut session = Embedder::start_build(&model, &vault, plan).unwrap();
        for range in crate::llm::embed::plan_batches(&list) {
            out.extend(session.embed_batch(&list[range]).unwrap());
        }
        session.finish(RunEnd::Complete).unwrap();
        out
    };
    let questions: Vec<Vec<f32>> = texts
        .questions
        .iter()
        .map(|question| Embedder::embed_query(&model, &vault, question).unwrap())
        .collect();
    let vectors = serde_json::json!({
        "fixture": embed(&texts.fixture),
        "questions": questions,
        "probes": embed(&texts.probes),
    });
    let out = std::env::var("ATLAS_VECTORS_OUT").expect("set ATLAS_VECTORS_OUT");
    fs::write(&out, vectors.to_string()).unwrap();
    println!(
        "{{\"fixture\":{},\"questions\":{},\"probes\":{}}}",
        texts.fixture.len(),
        texts.questions.len(),
        texts.probes.len()
    );
}
