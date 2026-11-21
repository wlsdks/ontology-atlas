use super::job::{Entry, UPDATE_LATEST};
use super::memory::{RELEASE_AFTER, SEARCHER_IDLE};
use super::models::{builtin_model, readable_model};
use super::types::{FoundState, VectorFailure, VectorPhase, VectorSource, VectorStatus};
use crate::llm::embed::{EmbedError, RunEnd};
use fakes::{cleanup, lock, vault, Harness, WITHIN};
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

mod fakes;
mod measure;

fn entry(harness: &Harness, root: &Path) -> Arc<Entry> {
    harness.vectors.entry(root, &root.to_string_lossy())
}

fn status(harness: &Harness, entry: &Entry) -> VectorStatus {
    harness.vectors.status(entry, true, None)
}

fn runner() -> VectorSource {
    VectorSource::Runner {
        base_url: "http://localhost:11434".into(),
        model: "bge-m3".into(),
    }
}

/// Builds the folder's search index, as opening it in the app does.
fn indexed(root: &Path) {
    let files = crate::vault::index::markdown_files(root).unwrap().files;
    let progress = vault_index::Progress::default();
    vault_index::sync(root, &files, &progress, vault_index::Check::Always).unwrap();
}

/// Prepares with the built-in model and waits for the job to end.
fn prepare_and_wait(harness: &Harness, entry: &Arc<Entry>, source: VectorSource) {
    harness.vectors.prepare(entry, source, true);
    assert!(entry.wait_idle(WITHIN), "the job did not end");
}

mod contract;
mod held;
mod refused;
mod runs;
mod search;
mod statuses;
mod waits;
