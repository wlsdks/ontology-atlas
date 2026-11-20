//! Opt-in, in release, one test per process: `ATLAS_BGE_M3_DIR` (the publisher's
//! files), `ATLAS_MEASURE_DIR` (the converted model) and `ATLAS_MEANING_PASSAGES`
//! (`fixture`, `realistic` and `korean-long` `.jsonl` files of `{"text"}` rows).

use super::super::infer::{self, Encoder};
use super::super::pins;
use super::super::*;
use super::cosine;
use candle_core::DType;
use candle_nn::VarBuilder;
use candle_transformers::models::xlm_roberta::XLMRobertaModel;
use std::time::Instant;

fn env_dir(name: &str) -> PathBuf {
    PathBuf::from(std::env::var(name).unwrap_or_else(|_| panic!("set {name}")))
}

fn passages(file: &str) -> Vec<String> {
    fs::read_to_string(env_dir("ATLAS_MEANING_PASSAGES").join(file))
        .unwrap()
        .lines()
        .map(|line| {
            let row: serde_json::Value = serde_json::from_str(line).unwrap();
            row["text"].as_str().unwrap().to_string()
        })
        .collect()
}

fn converted() -> PathBuf {
    env_dir("ATLAS_MEASURE_DIR").join("model-f16.safetensors")
}

fn tokenizer_file() -> PathBuf {
    env_dir("ATLAS_BGE_M3_DIR").join("tokenizer.json")
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
    let index = ((sorted.len() as f64 - 1.0) * p).round() as usize;
    sorted[index]
}

fn token_stats(name: &str, counts: &mut [usize]) {
    counts.sort_unstable();
    let total: usize = counts.iter().sum();
    let at = |p: f64| counts[((counts.len() - 1) as f64 * p).round() as usize];
    println!(
        "{{\"tokens\":\"{name}\",\"n\":{},\"mean\":{:.0},\"p50\":{},\"p90\":{},\"p99\":{},\"max\":{},\"over_512\":{},\"over_1024\":{}}}",
        counts.len(),
        total as f64 / counts.len() as f64,
        at(0.5),
        at(0.9),
        at(0.99),
        at(1.0),
        counts.iter().filter(|&&n| n > 512).count(),
        counts.iter().filter(|&&n| n > 1_024).count()
    );
}

#[test]
#[ignore = "reads the real tokenizer; run by hand"]
fn measure_token_counts() {
    let tokenizer = infer::tokenizer(&tokenizer_file(), 8_192).unwrap();
    for file in ["fixture.jsonl", "realistic.jsonl", "korean-long.jsonl"] {
        let texts = passages(file);
        let mut counts: Vec<usize> = tokenizer
            .encode_batch(texts, true)
            .unwrap()
            .iter()
            .map(|encoding| encoding.get_ids().len())
            .collect();
        token_stats(file, &mut counts);
    }
}

#[test]
#[ignore = "converts the real 2.27 GB checkpoint; run by hand"]
fn measure_conversion() {
    let out = converted();
    fs::create_dir_all(out.parent().unwrap()).unwrap();
    let started = Instant::now();
    convert::convert(
        &env_dir("ATLAS_BGE_M3_DIR").join("pytorch_model.bin"),
        &out,
        &AtomicBool::new(false),
        &mut |_, _| {},
    )
    .unwrap();
    let convert_s = started.elapsed().as_secs_f64();
    let after_convert = footprint();
    let started = Instant::now();
    check(&PINNED, &out, &tokenizer_file()).unwrap();
    let check_s = started.elapsed().as_secs_f64();
    let digest = {
        let mut hasher = Sha256::new();
        let mut file = fs::File::open(&out).unwrap();
        std::io::copy(&mut file, &mut hasher).unwrap();
        hex(&hasher.finalize())
    };
    let (now, peak) = footprint();
    println!(
        "{{\"convert_s\":{convert_s:.1},\"peak_after_convert_mib\":{:.0},\"check_s\":{check_s:.1},\"bytes\":{},\"sha256\":\"{digest}\",\"footprint_mib\":{now:.0},\"peak_mib\":{peak:.0}}}",
        after_convert.1,
        fs::metadata(&out).unwrap().len()
    );
}

fn app_encoder() -> Encoder {
    let (device, dtype) = infer::device();
    Encoder::load(
        &converted(),
        &tokenizer_file(),
        &infer::config(pins::CONFIG_JSON).unwrap(),
        device,
        dtype,
    )
    .unwrap()
}

#[test]
#[ignore = "loads fp32 and f16 bge-m3; run by hand"]
fn measure_fidelity_against_fp32() {
    let fixture = passages("fixture.jsonl");
    let long = passages("korean-long.jsonl");
    let texts: Vec<&str> = fixture.iter().chain(&long).map(String::as_str).collect();

    let ours = {
        let encoder = app_encoder();
        texts
            .chunks(32)
            .flat_map(|batch| encoder.embed(batch, false).unwrap())
            .collect::<Vec<_>>()
    };
    let reference = {
        let (device, _) = infer::device();
        let config = infer::config(pins::CONFIG_JSON).unwrap();
        let vb = VarBuilder::from_pth(
            env_dir("ATLAS_BGE_M3_DIR").join("pytorch_model.bin"),
            DType::F32,
            &device,
        )
        .unwrap();
        let encoder = Encoder::from_parts(
            infer::tokenizer(&tokenizer_file(), infer::MAX_TOKENS).unwrap(),
            XLMRobertaModel::new(&config, vb).unwrap(),
            device,
            config.pad_token_id,
            infer::MAX_TOKENS,
        );
        texts
            .chunks(32)
            .flat_map(|batch| encoder.embed(batch, false).unwrap())
            .collect::<Vec<_>>()
    };
    let mut cosines: Vec<f64> = ours
        .iter()
        .zip(&reference)
        .map(|(a, b)| f64::from(cosine(a, b)))
        .collect();
    let long_min = cosines
        .iter()
        .skip(fixture.len())
        .copied()
        .fold(f64::INFINITY, f64::min);
    cosines.sort_by(f64::total_cmp);
    println!(
        "{{\"n\":{},\"fixture\":{},\"korean_long\":{},\"min\":{:.6},\"p01\":{:.6},\"mean\":{:.6},\"korean_long_min\":{long_min:.6},\"below_0_999\":{}}}",
        cosines.len(),
        fixture.len(),
        long.len(),
        cosines[0],
        percentile(&cosines, 0.01),
        cosines.iter().sum::<f64>() / cosines.len() as f64,
        cosines.iter().filter(|&&c| c < 0.999).count()
    );
    assert!(cosines[0] >= 0.999);
}

#[test]
#[ignore = "one padding strategy per process on the real model; run by hand"]
fn measure_padding_strategy() {
    // `ATLAS_BUDGET=tokens,cells`; 0 means unbounded (each batch padded to its longest).
    let budget: Vec<usize> = std::env::var("ATLAS_BUDGET")
        .unwrap()
        .split(',')
        .map(|n| n.parse::<usize>().unwrap())
        .map(|n| if n == 0 { usize::MAX } else { n })
        .collect();
    let texts = passages("realistic.jsonl");
    let texts: Vec<&str> = texts.iter().step_by(8).map(String::as_str).collect();
    let encoder = app_encoder().with_budget(infer::Budget {
        tokens: budget[0],
        cells: budget[1],
    });
    encoder.embed(&texts[..8], false).unwrap();
    let started = Instant::now();
    for batch in texts.chunks(32) {
        encoder.embed(batch, false).unwrap();
    }
    let seconds = started.elapsed().as_secs_f64();
    println!(
        "{{\"budget\":{:?},\"passages\":{},\"seconds\":{seconds:.1},\"passages_per_s\":{:.2},\"peak_mib\":{:.0}}}",
        std::env::var("ATLAS_BUDGET").unwrap(),
        texts.len(),
        texts.len() as f64 / seconds,
        footprint().1
    );
}

#[test]
#[ignore = "runs 2,000+ passages and 200 questions through the real model; run by hand"]
fn measure_build_and_questions() {
    let store_dir = env_dir("ATLAS_MEASURE_DIR");
    if !store_dir.join("tokenizer.json").exists() {
        fs::copy(tokenizer_file(), store_dir.join("tokenizer.json")).unwrap();
    }
    let vault = env_dir("ATLAS_MEASURE_DIR").join("vault");
    fs::create_dir_all(&vault).unwrap();
    let model = BuiltinModel::new(ModelStore::at(store_dir));
    let base = footprint();

    let started = Instant::now();
    model.load().unwrap();
    let load_s = started.elapsed().as_secs_f64();
    let loaded = footprint();

    let texts = passages("realistic.jsonl");
    let texts: Vec<&str> = texts.iter().step_by(2).map(String::as_str).collect();
    let chars = texts.iter().map(|t| t.chars().count()).sum();
    let embedder: &dyn Embedder = &model;
    let mut session = embedder
        .start_build(
            &vault,
            BuildPlan {
                files: 1,
                passages: texts.len(),
                chars,
            },
        )
        .unwrap();
    let started = Instant::now();
    let mut done = 0;
    for range in crate::llm::embed::plan_batches(&texts) {
        let vectors = session.embed_batch(&texts[range.clone()]).unwrap();
        assert!(vectors.iter().all(|v| v.len() == pins::DIMENSIONS));
        done += range.len();
    }
    let build_s = started.elapsed().as_secs_f64();
    session.finish(RunEnd::Complete).unwrap();
    let built = footprint();

    let questions: Vec<String> = {
        let raw = fs::read_to_string(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../tests/fixtures/meaning-search/questions.json"),
        )
        .unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        parsed["questions"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|q| q["question"].as_str())
            .map(str::to_string)
            .collect()
    };
    let mut latencies = Vec::new();
    for round in 0..4 {
        for question in &questions {
            let started = Instant::now();
            let vector = model.embed_query(&vault, question).unwrap();
            if round > 0 {
                latencies.push(started.elapsed().as_secs_f64() * 1_000.0);
            }
            assert_eq!(vector.len(), pins::DIMENSIONS);
        }
    }
    latencies.sort_by(f64::total_cmp);

    model.unload();
    let unloaded = footprint();
    std::thread::sleep(std::time::Duration::from_secs(5));
    let settled = footprint();
    std::thread::sleep(std::time::Duration::from_secs(55));
    let late = footprint();
    println!(
        "{{\"base_mib\":{:.0},\"load_s\":{load_s:.2},\"loaded_mib\":{:.0},\"passages\":{done},\"build_s\":{build_s:.1},\"passages_per_s\":{:.2},\"peak_mib\":{:.0},\"after_build_mib\":{:.0},\"questions\":{},\"query_ms_p50\":{:.1},\"query_ms_p95\":{:.1},\"query_ms_max\":{:.1},\"after_unload_mib\":{:.0},\"after_unload_5s_mib\":{:.0},\"after_unload_60s_mib\":{:.0}}}",
        base.0,
        loaded.0,
        done as f64 / build_s,
        settled.1,
        built.0,
        latencies.len(),
        percentile(&latencies, 0.5),
        percentile(&latencies, 0.95),
        latencies.last().unwrap(),
        unloaded.0,
        settled.0,
        late.0
    );
}
