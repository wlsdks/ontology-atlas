//! Temporary folders holding a vault, planted files and offers, shared by the Library tests.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::import_destination::ImportDestination;
use super::source_import::{import_sources, ImportControl, SourceImportResult};
use super::source_picker::remember_source_path;

/// Over the 64-byte floor, so discovery offers it.
pub(super) const PLAN_PDF_BYTES: &[u8] = &[b'x'; 64];

const DISCOVERY_CASES: &str = include_str!("../../../tests/fixtures/source-discovery-cases.json");

pub(super) fn discovery_cases() -> serde_json::Value {
    serde_json::from_str(DISCOVERY_CASES).unwrap()
}

pub(super) fn offer_as_picked(path: &Path) -> String {
    let offer_key = path.to_string_lossy().to_string();
    remember_source_path(offer_key.clone(), fs::canonicalize(path).unwrap());
    offer_key
}

pub(super) fn fixture_with_vault(label: &str) -> (PathBuf, String) {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("atlas-{label}-{}-{nonce}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("vault")).unwrap();
    let vault = fs::canonicalize(root.join("vault"))
        .unwrap()
        .to_string_lossy()
        .into_owned();
    (root, vault)
}

/// Drops share one "last drop" slot, so tests that drop take turns.
pub(super) fn take_drop_turn() -> std::sync::MutexGuard<'static, ()> {
    static TURN: Mutex<()> = Mutex::new(());
    TURN.lock().unwrap_or_else(|err| err.into_inner())
}

pub(super) fn plant_file(path: &Path, bytes: usize) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let body: Vec<u8> = path.to_string_lossy().bytes().cycle().take(bytes).collect();
    fs::write(path, body).unwrap();
}

pub(super) fn import_offered(vault: &str, keys: Vec<String>) -> Vec<SourceImportResult> {
    import_sources(
        vault,
        keys,
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap()
}
