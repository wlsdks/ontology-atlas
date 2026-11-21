//! Where vectors come from: the built-in model in its worker, or a runner on this computer. The
//! job and the search see them through these traits, so tests pass fakes and no model file.

use super::types::VectorSource;
use crate::llm::embed::builtin::client::BuiltinModel;
use crate::llm::embed::builtin::infer::Runtime;
use crate::llm::embed::builtin::{pins, worker, Progress};
use crate::llm::embed::{EmbedError, Embedder, LocalRunner};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, OnceLock};
use vault_index::vectors::Model;

/// A store names its source as well as its model, so switching between the built-in model and a
/// runner starts a new store rather than mixing two implementations' vectors.
const BUILTIN_PREFIX: &str = "builtin/";
const RUNNER_PREFIX: &str = "runner/";

/// The built-in model as the job uses it: one per app, its worker shared by builds and questions.
pub(crate) trait Builtin: Embedder + Send + Sync {
    fn is_ready(&self) -> bool;
    /// Downloads, converts and checks the model; returns at once when it is ready.
    fn prepare(
        &self,
        vault_dir: &Path,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
    ) -> Result<(), EmbedError>;
    /// Ends the worker and deletes the model's files in one turn of the worker, so no question
    /// starts a worker in between; refused while a build is open.
    fn delete(&self) -> Result<(), EmbedError>;
    /// Starts loading the worker and returns at once.
    fn warm(&self);
    /// Ends the worker now (`true`), or when the last open build ends (`false`).
    fn release(&self) -> bool;
    fn runtime(&self) -> Runtime;
    fn space_needed(&self) -> u64;
    fn free_bytes(&self) -> Option<u64>;
    /// Every byte the model holds in the app's data folder, ready or not.
    fn model_bytes(&self) -> u64;
    /// The folder in the app's data folder that holds the model, made or not.
    fn dir(&self) -> PathBuf;
}

/// A runner on this computer, past the loopback rule.
pub(crate) trait Runner: Embedder + Send + Sync {
    /// The width of the model's vectors, as the runner states it.
    fn dimensions(&self) -> Result<Option<usize>, EmbedError>;
}

pub(crate) trait Sources: Send + Sync {
    /// The app's one built-in model; made on first use, which starts no worker.
    fn builtin(&self) -> Result<Arc<dyn Builtin>, EmbedError>;
    /// The built-in model only if something already made it.
    fn builtin_if_made(&self) -> Option<Arc<dyn Builtin>>;
    fn runner(&self, base_url: &str, model: &str) -> Result<Arc<dyn Runner>, EmbedError>;
    /// The folder's Markdown files, relative and `/`-separated, as the search index lists them.
    fn markdown_files(&self, root: &Path) -> Result<Vec<String>, String>;
}

/// The store's model name for a source; the width is the built-in model's or the store's own.
pub(super) fn model_name(source: &VectorSource) -> String {
    match source {
        VectorSource::Builtin => format!("{BUILTIN_PREFIX}{}", pins::MODEL_NAME),
        VectorSource::Runner { model, .. } => format!("{RUNNER_PREFIX}{}", model.trim()),
    }
}

pub(super) fn builtin_model() -> Model {
    Model {
        name: model_name(&VectorSource::Builtin),
        dimensions: pins::DIMENSIONS,
    }
}

/// The model a search or a status reads for `source`: the built-in one, or the store's own when
/// it holds this runner model. `None` while no store for it exists.
pub(super) fn readable_model(root: &Path, source: &VectorSource) -> Option<Model> {
    let stored = vault_index::vectors::store_model(root).ok().flatten()?;
    let wanted = match source {
        VectorSource::Builtin => builtin_model(),
        VectorSource::Runner { .. } => Model {
            name: model_name(source),
            dimensions: stored.dimensions,
        },
    };
    (stored == wanted).then_some(stored)
}

pub(super) fn is_builtin_model(model: &Model) -> bool {
    model.name.starts_with(BUILTIN_PREFIX)
}

struct AppBuiltin(Arc<BuiltinModel>);

impl Embedder for AppBuiltin {
    fn model(&self) -> &str {
        self.0.model()
    }

    fn start_build<'a>(
        &'a self,
        vault_dir: &Path,
        plan: crate::llm::embed::BuildPlan,
    ) -> Result<Box<dyn crate::llm::embed::EmbedSession + 'a>, EmbedError> {
        self.0.start_build(vault_dir, plan)
    }

    fn embed_query(&self, vault_dir: &Path, question: &str) -> Result<Vec<f32>, EmbedError> {
        self.0.embed_query(vault_dir, question)
    }
}

impl Builtin for AppBuiltin {
    fn is_ready(&self) -> bool {
        self.0.store().is_ready()
    }

    fn prepare(
        &self,
        vault_dir: &Path,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
    ) -> Result<(), EmbedError> {
        let prepared = self.0.store().prepare(vault_dir, cancel, on_progress);
        if !prepared.report.hosts.is_empty() {
            log::info!(
                "built-in model download asked {} ({} bytes)",
                prepared.report.hosts.join(", "),
                prepared.report.bytes_received
            );
        }
        prepared.result
    }

    fn delete(&self) -> Result<(), EmbedError> {
        self.0.delete_model()
    }

    fn warm(&self) {
        self.0.warm();
    }

    fn release(&self) -> bool {
        self.0.release()
    }

    fn runtime(&self) -> Runtime {
        self.0.runtime()
    }

    fn space_needed(&self) -> u64 {
        self.0.store().space_needed()
    }

    fn free_bytes(&self) -> Option<u64> {
        self.0.store().free_bytes()
    }

    fn model_bytes(&self) -> u64 {
        self.0.store().bytes()
    }

    fn dir(&self) -> PathBuf {
        self.0.store().dir().to_path_buf()
    }
}

struct AppRunner(LocalRunner);

impl Embedder for AppRunner {
    fn model(&self) -> &str {
        self.0.model()
    }

    fn start_build<'a>(
        &'a self,
        vault_dir: &Path,
        plan: crate::llm::embed::BuildPlan,
    ) -> Result<Box<dyn crate::llm::embed::EmbedSession + 'a>, EmbedError> {
        Embedder::start_build(&self.0, vault_dir, plan)
    }

    fn embed_query(&self, vault_dir: &Path, question: &str) -> Result<Vec<f32>, EmbedError> {
        self.0.embed_query(vault_dir, question)
    }
}

impl Runner for AppRunner {
    fn dimensions(&self) -> Result<Option<usize>, EmbedError> {
        self.0.reported_dimensions()
    }
}

/// A runner the app keeps, by its address and model.
type KeptRunner = ((String, String), Arc<AppRunner>);

/// The app's sources: the model store in the app's data directory, and runners by address.
#[derive(Default)]
pub(super) struct AppSources {
    builtin: OnceLock<Arc<AppBuiltin>>,
    /// One per address and model, so the remote-model check runs once; the least recently used
    /// first, at most `MAX_RUNNERS`.
    runners: Mutex<Vec<KeptRunner>>,
}

/// Runners the app keeps connected; an address typed many times over does not grow the list.
const MAX_RUNNERS: usize = 8;

#[cfg(test)]
impl AppSources {
    /// The app's sources around a built-in model the caller started, as the measurement does.
    pub(super) fn with_builtin(model: Arc<BuiltinModel>) -> Self {
        let sources = Self::default();
        let _ = sources.builtin.set(Arc::new(AppBuiltin(model)));
        sources
    }

    /// The runners kept, the least recently used first.
    pub(super) fn runner_addresses(&self) -> Vec<String> {
        self.runners
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter()
            .map(|((address, _), _)| address.clone())
            .collect()
    }
}

impl Sources for AppSources {
    fn builtin(&self) -> Result<Arc<dyn Builtin>, EmbedError> {
        if let Some(made) = self.builtin.get() {
            return Ok(made.clone());
        }
        // The worker finds its store by the same rule, so the app can only prepare that one.
        let store = worker::app_store().ok_or_else(|| EmbedError::Store("no-data-dir".into()))?;
        let made = self
            .builtin
            .get_or_init(|| Arc::new(AppBuiltin(Arc::new(BuiltinModel::new(store)))));
        Ok(made.clone())
    }

    fn builtin_if_made(&self) -> Option<Arc<dyn Builtin>> {
        self.builtin
            .get()
            .map(|made| made.clone() as Arc<dyn Builtin>)
    }

    fn runner(&self, base_url: &str, model: &str) -> Result<Arc<dyn Runner>, EmbedError> {
        let key = (base_url.trim().to_string(), model.trim().to_string());
        let mut runners = self
            .runners
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(at) = runners.iter().position(|(known, _)| known == &key) {
            let used = runners.remove(at);
            let runner = used.1.clone();
            runners.push(used);
            return Ok(runner);
        }
        let runner = Arc::new(AppRunner(LocalRunner::connect(&key.0, &key.1)?));
        if runners.len() >= MAX_RUNNERS {
            runners.remove(0);
        }
        runners.push((key, runner.clone()));
        Ok(runner)
    }

    fn markdown_files(&self, root: &Path) -> Result<Vec<String>, String> {
        super::super::index::markdown_files(root).map(|walked| walked.files)
    }
}
