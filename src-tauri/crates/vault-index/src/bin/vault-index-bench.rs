//! Drives the crate outside the app for `pnpm perf:vault-index` and the crate's process tests.
//! Usage: vault-index-bench <build|reopen|update|search|size|read-loop> <vault> [args...]
//!        vault-index-bench <vectors-prepare|vectors-search> <vault> [--dims=N] [--delay-ms=N]
//!                          [--log=FILE] [--queries=N]
//! Prints one JSON object. The folder walk here is a test stand-in; the app passes its own. The
//! vector commands embed with a deterministic stand-in (`fake_embedding`), not a model.

#[path = "../../tests/common/walk.rs"]
mod walk;

use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::Path;
use std::time::{Duration, Instant};
use vault_index::vectors::{self, Model, PrepareProgress};
use vault_index::{canonical_vault_root, stored_bytes, sync, Check, Progress, Searcher};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!(
            "usage: vault-index-bench <build|reopen|update|search|size> <vault> [queries...]"
        );
        std::process::exit(2);
    }
    if std::env::var_os(vault_index::INDEX_DIR_OVERRIDE_ENV).is_some()
        && !vault_index::index_dir_override_honoured()
    {
        eprintln!("this build ignores OATLAS_INDEX_DIR; build with --features index-dir-override");
        std::process::exit(2);
    }
    let command = args.get(1).map_or("", String::as_str);
    let vault = args.get(2).map_or("", String::as_str);
    let root = canonical_vault_root(Path::new(vault)).expect("vault folder");
    let started = Instant::now();
    let files = walk::markdown_files(&root);
    let walk_ms = started.elapsed().as_secs_f64() * 1000.0;
    let progress = Progress::default();
    match command {
        "build" | "reopen" => {
            let report = sync(&root, &files, &progress, Check::IfInterrupted).expect("sync");
            println!(
                "{{\"files\":{},\"indexed\":{},\"unchanged\":{},\"walkMs\":{walk_ms:.1},\"stampPassMs\":{:.1},\"writeMs\":{:.1},\"totalMs\":{:.1}}}",
                report.files,
                report.indexed,
                report.unchanged,
                report.stamp_pass.as_secs_f64() * 1000.0,
                report.write.as_secs_f64() * 1000.0,
                started.elapsed().as_secs_f64() * 1000.0
            );
        }
        "update" => {
            let target = root.join(
                files
                    .get(files.len() / 2)
                    .expect("a vault with a Markdown file"),
            );
            let mut text = std::fs::read_to_string(&target).expect("target file");
            text.push_str("\n갱신된 문단 benchmarkupdate\n");
            std::fs::write(&target, text).expect("write target");
            let report = sync(&root, &files, &progress, Check::IfInterrupted).expect("sync");
            let searcher = Searcher::open(&root).expect("open").expect("index exists");
            let found = searcher.search("benchmarkupdate", 5).expect("search");
            println!(
                "{{\"indexed\":{},\"verified\":{},\"stampPassMs\":{:.1},\"writeMs\":{:.2},\"found\":{}}}",
                report.indexed,
                report.verified,
                report.stamp_pass.as_secs_f64() * 1000.0,
                report.write.as_secs_f64() * 1000.0,
                found.hits.len()
            );
        }
        "search" => {
            let searcher = Searcher::open(&root).expect("open").expect("index exists");
            let queries = args.get(3..).unwrap_or_default();
            let mut samples = Vec::new();
            let mut medians = Vec::new();
            for query in queries {
                let mut runs: Vec<f64> = (0..5)
                    .map(|_| {
                        let started = Instant::now();
                        searcher.search(query, 20).expect("search");
                        started.elapsed().as_secs_f64() * 1000.0
                    })
                    .collect();
                runs.sort_by(f64::total_cmp);
                medians.push(percentile(&mut runs, 0.5));
                samples.extend(runs);
            }
            println!(
                "{{\"queries\":{},\"p50Ms\":{:.2},\"p95Ms\":{:.2},\"maxMs\":{:.2},\"p95OfMediansMs\":{:.2}}}",
                queries.len(),
                percentile(&mut samples, 0.5),
                percentile(&mut samples, 0.95),
                percentile(&mut samples, 1.0),
                percentile(&mut medians, 0.95)
            );
        }
        "read-loop" => {
            let reads: usize = args
                .get(3)
                .and_then(|count| count.parse().ok())
                .expect("read count");
            let query = args.get(4).expect("query");
            let mut errors = 0;
            let mut done = 0;
            while done < reads {
                match Searcher::open(&root) {
                    Ok(Some(searcher)) => {
                        if searcher.search(query, 20).is_err() {
                            errors += 1;
                        }
                        done += 1;
                    }
                    Ok(None) => std::thread::sleep(std::time::Duration::from_millis(5)),
                    Err(_) => {
                        errors += 1;
                        done += 1;
                    }
                }
            }
            println!("{{\"reads\":{done},\"errors\":{errors}}}");
        }
        "size" => {
            let text_bytes: u64 = files
                .iter()
                .filter_map(|file| std::fs::metadata(root.join(file)).ok())
                .map(|meta| meta.len())
                .sum();
            let index_bytes = stored_bytes(Some(&root)).expect("size");
            println!("{{\"textBytes\":{text_bytes},\"indexBytes\":{index_bytes}}}");
        }
        "vectors-prepare" => vectors_prepare(&root, &files, &Options::parse(&args)),
        "vectors-search" => vectors_search(&root, &files, &Options::parse(&args)),
        other => {
            eprintln!("unknown command {other}");
            std::process::exit(2);
        }
    }
}

struct Options {
    model: Model,
    delay: Duration,
    log: Option<String>,
    queries: usize,
}

impl Options {
    fn parse(args: &[String]) -> Options {
        let mut options = Options {
            model: Model {
                name: "fake-embedding".into(),
                dimensions: 1024,
            },
            delay: Duration::ZERO,
            log: None,
            queries: 1000,
        };
        for arg in args.get(3..).unwrap_or_default() {
            let (key, value) = arg.split_once('=').expect("--key=value");
            match key {
                "--dims" => options.model.dimensions = value.parse().expect("dimensions"),
                "--delay-ms" => {
                    options.delay = Duration::from_millis(value.parse().expect("milliseconds"))
                }
                "--log" => options.log = Some(value.to_string()),
                "--queries" => options.queries = value.parse().expect("query count"),
                other => {
                    eprintln!("unknown option {other}");
                    std::process::exit(2);
                }
            }
        }
        options
    }
}

/// A unit-free pseudo-random vector seeded by the text's SHA-256: equal texts get equal vectors.
fn fake_embedding(text: &str, dimensions: usize) -> Vec<f32> {
    let digest = Sha256::digest(text.as_bytes());
    let seed = digest.get(..8).and_then(|bytes| bytes.try_into().ok());
    let mut state = u64::from_le_bytes(seed.expect("eight bytes")) | 1;
    (0..dimensions)
        .map(|_| {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            (state >> 40) as f32 / (1u64 << 23) as f32 - 1.0
        })
        .collect()
}

/// Physical footprint now and at its highest so far, in bytes (macOS only).
#[cfg(target_os = "macos")]
fn footprint() -> Option<(u64, u64)> {
    // SAFETY: `rusage_info_v4` is plain data, for which all zero bytes is a valid value.
    let mut info: libc::rusage_info_v4 = unsafe { std::mem::zeroed() };
    // SAFETY: `info` is the RUSAGE_INFO_V4 buffer the call fills, for this process's own pid.
    let read = unsafe {
        libc::proc_pid_rusage(
            std::process::id() as libc::c_int,
            libc::RUSAGE_INFO_V4,
            (&mut info as *mut libc::rusage_info_v4).cast(),
        )
    };
    (read == 0).then_some((info.ri_phys_footprint, info.ri_lifetime_max_phys_footprint))
}

#[cfg(not(target_os = "macos"))]
fn footprint() -> Option<(u64, u64)> {
    None
}

/// Asks the allocator to return the pages it keeps after frees, as the app may once it drops a
/// searcher; the footprint before and after says how much a drop alone leaves behind.
#[cfg(target_os = "macos")]
fn relieve_allocator() {
    extern "C" {
        fn malloc_zone_pressure_relief(zone: *mut std::ffi::c_void, goal: usize) -> usize;
    }
    // SAFETY: a null zone asks every malloc zone; a goal of 0 means as much as possible.
    unsafe {
        malloc_zone_pressure_relief(std::ptr::null_mut(), 0);
    }
}

#[cfg(not(target_os = "macos"))]
fn relieve_allocator() {}

fn mb(bytes: u64) -> f64 {
    bytes as f64 / (1024.0 * 1024.0)
}

/// Megabytes above `base`, as JSON (`null` where the footprint is not measured).
fn over(base: Option<(u64, u64)>, now: Option<u64>) -> String {
    match (base, now) {
        (Some((base, _)), Some(now)) => format!("{:.1}", mb(now.saturating_sub(base))),
        _ => "null".into(),
    }
}

fn vectors_prepare(root: &Path, files: &[String], options: &Options) {
    let base = footprint();
    let started = Instant::now();
    let plan = vectors::plan(root, &options.model, files).expect("plan");
    let planned_ms = started.elapsed().as_secs_f64() * 1000.0;
    let remaining = plan.remaining();
    let mut log = options.log.as_ref().map(|path| {
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("log file")
    });
    let progress = PrepareProgress::default();
    let prepared = vectors::prepare(plan, &progress, |texts: &[&str]| {
        if let Some(log) = log.as_mut() {
            let line: String = texts
                .iter()
                .map(|text| format!("{:x}\n", Sha256::digest(text.as_bytes())))
                .collect();
            log.write_all(line.as_bytes()).expect("log");
            log.flush().expect("log");
        }
        std::thread::sleep(options.delay);
        Ok::<_, std::convert::Infallible>(
            texts
                .iter()
                .map(|text| fake_embedding(text, options.model.dimensions))
                .collect(),
        )
    })
    .expect("prepare");
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    let peak = footprint().map(|(_, peak)| peak);
    let text_bytes: u64 = files
        .iter()
        .filter_map(|file| std::fs::metadata(root.join(file)).ok())
        .map(|meta| meta.len())
        .sum();
    let vector_bytes = vectors::vectors_bytes(root).expect("size");
    let status = vectors::status(root, &options.model)
        .expect("status")
        .expect("a store");
    println!(
        "{{\"files\":{},\"plannedFiles\":{},\"plannedPassages\":{},\"plannedChars\":{},\"preparedPassages\":{},\"planMs\":{planned_ms:.1},\"totalMs\":{total_ms:.1},\"textBytes\":{text_bytes},\"vectorBytes\":{vector_bytes},\"vectorToText\":{:.3},\"passagesStored\":{},\"filesReady\":{},\"filesCapped\":{},\"prepareFootprintPeakMb\":{}}}",
        files.len(),
        remaining.files,
        remaining.passages,
        remaining.chars,
        prepared.passages,
        vector_bytes as f64 / text_bytes.max(1) as f64,
        status.passages_stored,
        status.files_ready,
        status.files_capped,
        over(base, peak),
    );
}

/// Opens a searcher, runs `options.queries` searches for 8 passages, then drops it, reporting the
/// footprint above the process's own at each step. macOS keeps freed large blocks in the
/// footprint unless `MallocLargeCache=0` is set, so "after drop" is read with it.
fn vectors_search(root: &Path, files: &[String], options: &Options) {
    // Timed first, so the baseline already holds SQLite's one-time state, as the app's does.
    let status_started = Instant::now();
    vectors::status(root, &options.model).expect("status");
    let status_ms = status_started.elapsed().as_secs_f64() * 1000.0;
    let base = footprint();
    let started = Instant::now();
    let mut searcher = vectors::Searcher::open(root, &options.model)
        .expect("open")
        .expect("a store");
    let open_ms = started.elapsed().as_secs_f64() * 1000.0;
    let loaded = footprint().map(|(now, _)| now);
    let mut samples = Vec::with_capacity(options.queries);
    let (mut hits, mut stale) = (0usize, 0usize);
    for query in 0..options.queries {
        let vector = fake_embedding(&format!("question {query}"), options.model.dimensions);
        let started = Instant::now();
        let found = searcher.nearest(&vector, 8).expect("search");
        samples.push(started.elapsed().as_secs_f64() * 1000.0);
        hits += found.hits.len();
        stale += found.stale;
    }
    let peak = footprint().map(|(_, peak)| peak);
    let vectors_held = searcher.vectors();
    drop(searcher);
    let dropped = footprint().map(|(now, _)| now);
    relieve_allocator();
    let relieved = footprint().map(|(now, _)| now);
    let changed_started = Instant::now();
    vectors::changed_files(root, &options.model, files).expect("changed");
    let changed_ms = changed_started.elapsed().as_secs_f64() * 1000.0;
    println!(
        "{{\"vectors\":{vectors_held},\"openMs\":{open_ms:.1},\"statusMs\":{status_ms:.1},\"changedFilesMs\":{changed_ms:.1},\"queries\":{},\"p50Ms\":{:.2},\"p95Ms\":{:.2},\"maxMs\":{:.2},\"hits\":{hits},\"stale\":{stale},\"steadyMb\":{},\"peakMb\":{},\"afterDropMb\":{},\"afterDropRelievedMb\":{}}}",
        options.queries,
        percentile(&mut samples, 0.5),
        percentile(&mut samples, 0.95),
        percentile(&mut samples, 1.0),
        over(base, loaded),
        over(base, peak),
        over(base, dropped),
        over(base, relieved),
    );
}

/// Nearest-rank percentile.
fn percentile(values: &mut [f64], share: f64) -> f64 {
    values.sort_by(f64::total_cmp);
    let rank = ((values.len() as f64 * share).ceil() as usize).max(1);
    values
        .get(rank - 1)
        .or(values.last())
        .copied()
        .unwrap_or(0.0)
}
