use super::*;
use std::sync::atomic::AtomicBool;

mod conversion;
mod downloads;
mod encoding;
mod fake;
mod lifecycle;
mod measure;
mod preparation;
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
