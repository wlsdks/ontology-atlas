//! Drives the crate outside the app for `pnpm perf:vault-index` and the crate's process tests.
//! Usage: vault-index-bench <build|reopen|update|search|size|read-loop> <vault> [args...]
//! Prints one JSON object. The folder walk here is a test stand-in; the app passes its own.

#[path = "../../tests/common/walk.rs"]
mod walk;

use std::path::Path;
use std::time::Instant;
use vault_index::{canonical_vault_root, stored_bytes, sync, Check, Progress, Searcher};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!(
            "usage: vault-index-bench <build|reopen|update|search|size> <vault> [queries...]"
        );
        std::process::exit(2);
    }
    let root = canonical_vault_root(Path::new(&args[2])).expect("vault folder");
    let started = Instant::now();
    let files = walk::markdown_files(&root);
    let walk_ms = started.elapsed().as_secs_f64() * 1000.0;
    let progress = Progress::default();
    match args[1].as_str() {
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
            let target = root.join(&files[files.len() / 2]);
            let mut text = std::fs::read_to_string(&target).expect("target file");
            text.push_str("\n갱신된 문단 benchmarkupdate\n");
            std::fs::write(&target, text).expect("write target");
            let report = sync(&root, &files, &progress, Check::IfInterrupted).expect("sync");
            let searcher = Searcher::open(&root).expect("open").expect("index exists");
            let found = searcher.search("benchmarkupdate", 5).expect("search");
            println!(
                "{{\"indexed\":{},\"stampPassMs\":{:.1},\"writeMs\":{:.2},\"found\":{}}}",
                report.indexed,
                report.stamp_pass.as_secs_f64() * 1000.0,
                report.write.as_secs_f64() * 1000.0,
                found.hits.len()
            );
        }
        "search" => {
            let searcher = Searcher::open(&root).expect("open").expect("index exists");
            let queries = &args[3..];
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
                medians.push(runs[runs.len() / 2]);
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
            let reads: usize = args[3].parse().expect("read count");
            let mut errors = 0;
            let mut done = 0;
            while done < reads {
                match Searcher::open(&root) {
                    Ok(Some(searcher)) => {
                        if searcher.search(&args[4], 20).is_err() {
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
        other => {
            eprintln!("unknown command {other}");
            std::process::exit(2);
        }
    }
}

/// Nearest-rank percentile.
fn percentile(values: &mut [f64], share: f64) -> f64 {
    values.sort_by(f64::total_cmp);
    let rank = ((values.len() as f64 * share).ceil() as usize).clamp(1, values.len());
    values[rank - 1]
}
