// bge-m3 run by candle in this process. Preparing downloads the pinned files once,
// converts the weights to f16 here and deletes the download. Passages never leave
// the process; each build and question still writes its audit line first.

mod convert;
mod download;
mod fetch;
mod infer;
pub(crate) mod pins;

use super::audit::{self, RunEnd};
use super::{check_passages, hex, BuildPlan, EmbedError, EmbedSession, Embedder};
use super::{MAX_BATCH_BYTES, MAX_BATCH_PASSAGES};
use candle_core::{DType, Device};
use download::Downloader;
use fetch::Fetch;
use infer::Encoder;
use pins::{PinnedFile, MODEL_NAME};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};

pub(crate) use download::DownloadReport;

/// Where the passages went, in every line the built-in model writes.
pub(crate) const BUILTIN_PROVIDER: &str = "built-in";
pub(crate) const BUILTIN_HOST: &str = "in-process";
/// The download's first host; its redirects may add hosts under huggingface.co or hf.co.
pub(crate) const DOWNLOAD_HOST: &str = "huggingface.co";

const WEIGHTS_FILE: &str = "model-f16.safetensors";
const CONVERTING_FILE: &str = "model-f16.safetensors.converting";
const TOKENIZER_FILE: &str = "tokenizer.json";
const DOWNLOAD_DIR: &str = "download";

/// The built-in model's lines; a download's lines name the host it asks first.
pub(crate) struct BuiltinSource {
    host: &'static str,
}

pub(crate) const BUILTIN_SOURCE: BuiltinSource = BuiltinSource { host: BUILTIN_HOST };
pub(crate) const DOWNLOAD_SOURCE: BuiltinSource = BuiltinSource {
    host: DOWNLOAD_HOST,
};

impl audit::Source for BuiltinSource {
    fn provider(&self) -> &str {
        BUILTIN_PROVIDER
    }

    fn host(&self) -> &str {
        self.host
    }

    fn model(&self) -> &str {
        MODEL_NAME
    }

    fn line_wait(&self) -> Duration {
        super::TIMEOUTS.line_wait
    }

    fn query_line_wait(&self) -> Duration {
        super::TIMEOUTS.query_line_wait
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Stage {
    /// Hashing a file already on disk, before asking the network for the rest.
    Verify,
    Download,
    Convert,
    /// Loading the converted file and embedding one probe sentence.
    Check,
}

/// `done` and `total` are bytes, except in `Check`, which is 0 of 1 until it ends.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Progress {
    pub stage: Stage,
    pub done: u64,
    pub total: u64,
}

/// What `prepare` fetches and how it checks the result; tests pass a tiny model.
struct Recipe<'a> {
    files: &'a [PinnedFile],
    config: &'a str,
    device: fn() -> (Device, DType),
}

const PINNED: Recipe<'static> = Recipe {
    files: &pins::DOWNLOADS,
    config: pins::CONFIG_JSON,
    device: infer::device,
};

/// Model directories being prepared or deleted in this process, whichever window
/// asked; a second request for the same directory is refused, not queued.
static BUSY: LazyLock<Mutex<HashSet<PathBuf>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

struct Busy(PathBuf);

impl Busy {
    fn claim(dir: &Path) -> Result<Self, EmbedError> {
        let mut busy = BUSY.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if !busy.insert(dir.to_path_buf()) {
            return Err(EmbedError::ModelBusy);
        }
        Ok(Self(dir.to_path_buf()))
    }
}

impl Drop for Busy {
    fn drop(&mut self) {
        BUSY.lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&self.0);
    }
}

/// The model's directory in the app's data directory for this user account:
/// outside every vault, Git and the cache the index sweep clears.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ModelStore {
    dir: PathBuf,
}

impl ModelStore {
    pub(crate) fn in_app_data(app_data_dir: &Path) -> Self {
        Self::at(app_data_dir.join("models").join(MODEL_NAME))
    }

    pub(crate) fn at(dir: PathBuf) -> Self {
        Self { dir }
    }

    pub(crate) fn dir(&self) -> &Path {
        &self.dir
    }

    fn weights(&self) -> PathBuf {
        self.dir.join(WEIGHTS_FILE)
    }

    fn tokenizer(&self) -> PathBuf {
        self.dir.join(TOKENIZER_FILE)
    }

    fn download_dir(&self) -> PathBuf {
        self.dir.join(DOWNLOAD_DIR)
    }

    /// The converted weights and the tokenizer are in place.
    pub(crate) fn is_ready(&self) -> bool {
        self.weights().is_file() && self.tokenizer().is_file()
    }

    /// Every byte under the directory, a partial download included.
    pub(crate) fn bytes(&self) -> u64 {
        fn walk(dir: &Path) -> u64 {
            let Ok(entries) = fs::read_dir(dir) else {
                return 0;
            };
            entries
                .flatten()
                .map(|entry| match entry.file_type() {
                    Ok(kind) if kind.is_dir() => walk(&entry.path()),
                    Ok(kind) if kind.is_file() => entry.metadata().map_or(0, |meta| meta.len()),
                    _ => 0,
                })
                .sum()
        }
        walk(&self.dir)
    }

    /// Removes the model and any partial download. A loaded model keeps working
    /// until it is unloaded; the next load finds nothing.
    pub(crate) fn delete(&self) -> Result<(), EmbedError> {
        let _busy = Busy::claim(&self.dir)?;
        match fs::remove_dir_all(&self.dir) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(store_error(error)),
        }
    }

    /// Downloads, verifies, converts and checks the model, then deletes the
    /// download. Resumes whatever an earlier run left; returns at once when ready.
    pub(crate) fn prepare(
        &self,
        vault_dir: &Path,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
    ) -> Result<DownloadReport, EmbedError> {
        self.prepare_with(&fetch::HTTPS_ONLY, &PINNED, vault_dir, cancel, on_progress)
    }

    fn prepare_with(
        &self,
        fetch: &dyn Fetch,
        recipe: &Recipe<'_>,
        vault_dir: &Path,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
    ) -> Result<DownloadReport, EmbedError> {
        let _busy = Busy::claim(&self.dir)?;
        if self.is_ready() {
            return Ok(DownloadReport::default());
        }
        let downloads = self.download_dir();
        let report = Downloader {
            fetch,
            files: recipe.files,
            dir: &downloads,
            vault_dir,
            cancel,
            on_progress: &mut *on_progress,
        }
        .run()?;
        self.convert_and_check(recipe, &downloads, cancel, on_progress)?;
        Ok(report)
    }

    fn convert_and_check(
        &self,
        recipe: &Recipe<'_>,
        downloads: &Path,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
    ) -> Result<(), EmbedError> {
        let converting = self.dir.join(CONVERTING_FILE);
        convert::convert(
            &downloads.join(pins::WEIGHTS.name),
            &converting,
            cancel,
            &mut |done, total| {
                on_progress(&Progress {
                    stage: Stage::Convert,
                    done,
                    total,
                })
            },
        )?;
        if cancel.load(std::sync::atomic::Ordering::Relaxed) {
            download::remove_if_present(&converting)?;
            return Err(EmbedError::Cancelled);
        }
        on_progress(&Progress {
            stage: Stage::Check,
            done: 0,
            total: 1,
        });
        let tokenizer = downloads.join(pins::TOKENIZER.name);
        if let Err(error) = check(recipe, &converting, &tokenizer) {
            download::remove_if_present(&converting)?;
            return Err(error);
        }
        fs::rename(&tokenizer, self.tokenizer()).map_err(store_error)?;
        fs::rename(&converting, self.weights()).map_err(store_error)?;
        on_progress(&Progress {
            stage: Stage::Check,
            done: 1,
            total: 1,
        });
        match fs::remove_dir_all(downloads) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(store_error(error)),
        }
    }
}

/// The converted file loads and turns a sentence into a finite unit vector.
fn check(recipe: &Recipe<'_>, weights: &Path, tokenizer: &Path) -> Result<(), EmbedError> {
    let (device, dtype) = (recipe.device)();
    let config = infer::config(recipe.config)?;
    let encoder = Encoder::load(weights, tokenizer, &config, device, dtype)?;
    let vectors = encoder.embed(&["Search by meaning reads this sentence."], true)?;
    match vectors.first() {
        Some(vector) if vector.len() == config.hidden_size => Ok(()),
        _ => Err(EmbedError::ModelLoad("probe".into())),
    }
}

fn store_error(error: std::io::Error) -> EmbedError {
    EmbedError::Store(crate::errors::squeeze(&error.to_string()))
}

/// The built-in model, loaded on first use and dropped on request.
pub(crate) struct BuiltinModel {
    store: ModelStore,
    loaded: Mutex<Option<Arc<Encoder>>>,
    last_used: Mutex<Option<Instant>>,
}

impl BuiltinModel {
    pub(crate) fn new(store: ModelStore) -> Self {
        Self {
            store,
            loaded: Mutex::new(None),
            last_used: Mutex::new(None),
        }
    }

    pub(crate) fn store(&self) -> &ModelStore {
        &self.store
    }

    /// Loads the model unless it is loaded; refuses when it is not prepared.
    pub(crate) fn load(&self) -> Result<(), EmbedError> {
        self.encoder().map(|_| ())
    }

    /// Frees the model's memory once no build or question still holds it.
    pub(crate) fn unload(&self) {
        let mut loaded = self
            .loaded
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *loaded = None;
    }

    pub(crate) fn is_loaded(&self) -> bool {
        self.loaded
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .is_some()
    }

    /// Time since the model last embedded anything; `None` before its first use.
    pub(crate) fn idle_for(&self) -> Option<Duration> {
        self.last_used
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .map(|at| at.elapsed())
    }

    fn encoder(&self) -> Result<Arc<Encoder>, EmbedError> {
        let mut loaded = self
            .loaded
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(encoder) = loaded.as_ref() {
            return Ok(encoder.clone());
        }
        if !self.store.is_ready() {
            return Err(EmbedError::ModelNotReady);
        }
        let (device, dtype) = infer::device();
        let encoder = Arc::new(Encoder::load(
            &self.store.weights(),
            &self.store.tokenizer(),
            &infer::config(pins::CONFIG_JSON)?,
            device,
            dtype,
        )?);
        *loaded = Some(encoder.clone());
        Ok(encoder)
    }

    #[cfg(test)]
    fn with_encoder(store: ModelStore, encoder: Encoder) -> Self {
        let model = Self::new(store);
        *model
            .loaded
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(Arc::new(encoder));
        model
    }

    fn touch(&self) {
        *self
            .last_used
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(Instant::now());
    }
}

impl Embedder for BuiltinModel {
    fn model(&self) -> &str {
        MODEL_NAME
    }

    /// Loads the model, then writes the run's start line; no passage is read before
    /// the line is on disk.
    fn start_build<'a>(
        &'a self,
        vault_dir: &Path,
        plan: BuildPlan,
    ) -> Result<Box<dyn EmbedSession + 'a>, EmbedError> {
        let encoder = self.encoder()?;
        let run = audit::write_start(vault_dir, &BUILTIN_SOURCE, plan)?;
        Ok(Box::new(BuiltinRun {
            model: self,
            encoder: Some(encoder),
            vault_dir: vault_dir.to_path_buf(),
            run,
            plan,
            passages_read: 0,
            chars_read: 0,
            read_hash: Sha256::new(),
            started: Instant::now(),
            closed: false,
        }))
    }

    fn embed_query(&self, vault_dir: &Path, question: &str) -> Result<Vec<f32>, EmbedError> {
        check_passages(&[question])?;
        let encoder = self.encoder()?;
        let payload = serde_json::json!([question]).to_string();
        let reservation = audit::reserve_query(vault_dir, &BUILTIN_SOURCE, question, &payload)?;
        let started = Instant::now();
        let embedded = encoder.embed(&[question], true);
        self.touch();
        let outcome = if embedded.is_ok() { "ok" } else { "error" };
        audit::finalize_query(reservation, outcome, None, 0, started)?;
        embedded?.pop().ok_or(EmbedError::ResponseInvalid("count"))
    }
}

/// One open build: the same caps and plan as the loopback run, and the same
/// closing line, with `passagesSent` counting passages the model read.
struct BuiltinRun<'m> {
    model: &'m BuiltinModel,
    encoder: Option<Arc<Encoder>>,
    vault_dir: PathBuf,
    run: String,
    plan: BuildPlan,
    passages_read: usize,
    chars_read: usize,
    read_hash: Sha256,
    started: Instant,
    closed: bool,
}

impl BuiltinRun<'_> {
    fn close(&mut self, ended: RunEnd) -> Result<(), EmbedError> {
        self.closed = true;
        self.encoder = None;
        let hash = std::mem::take(&mut self.read_hash).finalize();
        audit::write_close(
            &self.vault_dir,
            &BUILTIN_SOURCE,
            &audit::Close {
                run: &self.run,
                plan: self.plan,
                passages_sent: self.passages_read,
                chars_sent: self.chars_read,
                sent_sha256: &hex(&hash),
                ended,
                duration_ms: self.started.elapsed().as_millis() as u64,
            },
        )
    }
}

impl EmbedSession for BuiltinRun<'_> {
    fn embed_batch(&mut self, passages: &[&str]) -> Result<Vec<Vec<f32>>, EmbedError> {
        let chars = check_passages(passages)?;
        if passages.len() > MAX_BATCH_PASSAGES
            || passages.iter().map(|p| p.len()).sum::<usize>() > MAX_BATCH_BYTES
        {
            return Err(EmbedError::BatchTooLarge);
        }
        if self.passages_read + passages.len() > self.plan.passages
            || self.chars_read + chars > self.plan.chars
        {
            return Err(EmbedError::OverPlan);
        }
        let encoder = self.encoder.clone().ok_or(EmbedError::ModelNotReady)?;
        self.passages_read += passages.len();
        self.chars_read += chars;
        self.read_hash
            .update(serde_json::json!(passages).to_string().as_bytes());
        let vectors = encoder.embed(passages, false);
        self.model.touch();
        vectors
    }

    fn finish(mut self: Box<Self>, ended: RunEnd) -> Result<(), EmbedError> {
        self.close(ended)
    }
}

impl Drop for BuiltinRun<'_> {
    fn drop(&mut self) {
        if !self.closed {
            if let Err(error) = self.close(RunEnd::Stopped) {
                log::error!("embed-build run {} has no closing line: {error}", self.run);
            }
        }
    }
}

#[cfg(test)]
mod tests;
