//! The built-in model measured on the real bge-m3 files, run by
//! `pnpm perf:builtin-model`: `ATLAS_BGE_M3_DIR` names a folder holding the
//! publisher's `pytorch_model.bin` and `tokenizer.json` at the pinned commit.
//! Each test prints one JSON line; nothing here reaches the network.

use super::super::download::file_matches;
use super::super::fetch::{Fetch, Head, Sink};
use super::super::infer::{self, groups, Encoder};
use super::super::pins;
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

/// Current and lifetime-peak physical footprint in MiB, as Activity Monitor counts it.
#[cfg(target_os = "macos")]
fn footprint() -> (f64, f64) {
    extern "C" {
        fn proc_pid_rusage(pid: i32, flavor: i32, buffer: *mut u64) -> i32;
    }
    let mut info = [0u64; 64];
    // SAFETY: flavor 4 is RUSAGE_INFO_V4, which fits in 64 u64 words.
    let status = unsafe { proc_pid_rusage(std::process::id() as i32, 4, info.as_mut_ptr()) };
    assert_eq!(status, 0);
    let mib = |bytes: u64| bytes as f64 / 1_048_576.0;
    (mib(info[9]), mib(info[30]))
}

#[cfg(not(target_os = "macos"))]
fn footprint() -> (f64, f64) {
    (f64::NAN, f64::NAN)
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
    let started = Instant::now();
    let prepared = store.prepare_with(
        &LocalFiles(publisher_dir()),
        &PINNED,
        &vault,
        &never(),
        &mut |progress| {
            if marks.last().map(|mark| mark.0) != Some(progress.stage) {
                marks.push((progress.stage, Instant::now()));
            }
        },
    );
    prepared.result.unwrap();
    let seconds = |stage: Stage| {
        let at = marks.iter().position(|mark| mark.0 == stage).unwrap();
        let end = marks.get(at + 1).map_or_else(Instant::now, |mark| mark.1);
        end.duration_since(marks[at].1).as_secs_f64()
    };
    let (_, peak) = footprint();
    println!(
        "{{\"total_s\":{:.1},\"copy_and_hash_s\":{:.1},\"convert_s\":{:.1},\"check_s\":{:.1},\"kept_bytes\":{},\"peak_mib\":{peak:.0}}}",
        started.elapsed().as_secs_f64(),
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
        .flat_map(|batch| ours.embed(batch, false).unwrap())
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
        .flat_map(|batch| reference.embed(batch, false).unwrap())
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
#[ignore = "embeds 2,000+ passages and 180 questions; pnpm perf:builtin-model"]
fn a_build_and_questions_on_this_computer() {
    let model = BuiltinModel::new(ready_store());
    let vault = measure_vault(model.store());
    let texts = texts();
    let base = footprint();
    let started = Instant::now();
    model.load().unwrap();
    let load_s = started.elapsed().as_secs_f64();
    let loaded = footprint();

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
    let started = Instant::now();
    for range in crate::llm::embed::plan_batches(&passages) {
        let vectors = session.embed_batch(&passages[range]).unwrap();
        assert!(vectors.iter().all(|v| v.len() == pins::DIMENSIONS));
    }
    let build_s = started.elapsed().as_secs_f64();
    session.finish(RunEnd::Complete).unwrap();
    let built = footprint();

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

    assert!(model.unload());
    let unloaded = footprint();
    std::thread::sleep(Duration::from_secs(5));
    let after_5s = footprint();
    std::thread::sleep(Duration::from_secs(55));
    let after_60s = footprint();
    let per_second = passages.len() as f64 / build_s;
    println!(
        "{{\"device\":\"{}\",\"base_mib\":{:.0},\"load_s\":{load_s:.2},\"loaded_mib\":{:.0},\"passages\":{},\"passages_per_s\":{per_second:.2},\"peak_mib\":{:.0},\"after_build_mib\":{:.0},\"questions\":{},\"query_ms_p50\":{:.1},\"query_ms_p95\":{:.1},\"query_ms_max\":{:.1},\"after_unload_mib\":{:.0},\"after_unload_5s_mib\":{:.0},\"after_unload_60s_mib\":{:.0}}}",
        infer::runtime_of(&infer::device().0).device,
        base.0,
        loaded.0,
        passages.len(),
        after_5s.1,
        built.0,
        latencies.len(),
        percentile(&latencies, 0.5),
        percentile(&latencies, 0.95),
        latencies.last().unwrap(),
        unloaded.0,
        after_5s.0,
        after_60s.0
    );
}

#[test]
#[ignore = "runs bge-m3 on the CPU in f32 with Metal left out; pnpm perf:builtin-model"]
fn one_batch_on_the_cpu() {
    let store = ready_store();
    let started = Instant::now();
    let encoder = Encoder::load(
        &store.weights(),
        &store.tokenizer(),
        &infer::config(pins::CONFIG_JSON).unwrap(),
        Device::Cpu,
        DType::F32,
    )
    .unwrap();
    let load_s = started.elapsed().as_secs_f64();
    let loaded = footprint();
    let texts = texts();
    let mut passages: Vec<&str> = texts
        .docs
        .iter()
        .chain(&texts.fixture)
        .map(String::as_str)
        .collect();
    // The longest passage alone is the longest pass a stop can wait for.
    passages.sort_by_key(|text| std::cmp::Reverse(text.chars().count()));
    let started = Instant::now();
    encoder.embed(&[passages[0]], false).unwrap();
    let longest_s = started.elapsed().as_secs_f64();
    let batch: Vec<&str> = passages
        .iter()
        .step_by(passages.len() / 32)
        .take(32)
        .copied()
        .collect();
    let ids = encoder.encode(&batch).unwrap();
    let mut order: Vec<usize> = (0..ids.len()).collect();
    order.sort_by_key(|&index| ids[index].len());
    let passes = groups(&order, &ids, infer::CPU_BUDGET).len();
    let started = Instant::now();
    encoder.embed(&batch, false).unwrap();
    let batch_s = started.elapsed().as_secs_f64();
    let (now, peak) = footprint();
    println!(
        "{{\"device\":\"cpu\",\"dtype\":\"f32\",\"load_s\":{load_s:.1},\"loaded_mib\":{:.0},\"longest_passage_tokens\":{},\"longest_passage_s\":{longest_s:.2},\"batch\":{},\"passes\":{passes},\"batch_s\":{batch_s:.1},\"passages_per_s\":{:.2},\"footprint_mib\":{now:.0},\"peak_mib\":{peak:.0}}}",
        loaded.0,
        encoder.encode(&[passages[0]]).unwrap()[0].len(),
        batch.len(),
        batch.len() as f64 / batch_s
    );
}

/// Our vectors for the fixture, its questions and the reference probes, for the
/// script to compare with another implementation of the same model.
#[test]
#[ignore = "writes the model's vectors for the fixture; pnpm perf:builtin-model"]
fn vectors_for_the_fixture() {
    let model = BuiltinModel::new(ready_store());
    let vault = measure_vault(model.store());
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
