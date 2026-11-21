use super::*;
use crate::llm::embed::{BuildPlan, Embedder, RunEnd};
use candle_core::{DType, Device};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::sync::Arc;
use std::time::Instant;

mod conversion;
mod downloads;
mod encoding;
mod fake;
mod fake_worker;
mod lifecycle;
mod measure;
mod preparation;
mod process;
mod serving;
mod tiny;
mod transport;

fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "atlas-builtin-{tag}-{}",
        uuid::Uuid::new_v4().simple()
    ));
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// A store nothing prepared; a fake worker never reads it, so it is never created.
fn no_store() -> ModelStore {
    ModelStore::at(std::env::temp_dir().join("atlas-builtin-no-store"))
}

fn audit_lines(vault: &Path) -> Vec<serde_json::Value> {
    fs::read_to_string(crate::llm_audit::audit_log_path(vault))
        .unwrap_or_default()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

/// An audit log that cannot be opened: a directory where the file belongs.
fn block_audit_log(vault: &Path) {
    fs::create_dir_all(crate::llm_audit::audit_log_path(vault)).unwrap();
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    dot / (na * nb)
}

fn never() -> AtomicBool {
    AtomicBool::new(false)
}
