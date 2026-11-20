// bge-m3 run by candle in this process. Preparing downloads the pinned files once,
// converts the weights to f16 here, checks them against reference vectors and
// deletes the download. Passages never leave the process; each build and question
// still writes its audit line first.

mod convert;
mod download;
mod fetch;
mod infer;
pub(crate) mod pins;

use super::audit::{self, RunEnd};
use super::{check_passages, hex, BuildPlan, EmbedError, EmbedSession, Embedder};
use super::{MAX_BATCH_BYTES, MAX_BATCH_PASSAGES};
use candle_core::{DType, Device};
use download::{remove_if_present, remove_link, write_synced, Downloader};
use fetch::Fetch;
use infer::Encoder;
use pins::{PinnedFile, MODEL_NAME};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Condvar, LazyLock, Mutex, MutexGuard};
use std::time::{Duration, Instant};

pub(crate) use download::DownloadReport;
pub(crate) use infer::Runtime;

/// Where the passages went, in every line the built-in model writes.
pub(crate) const BUILTIN_PROVIDER: &str = "built-in";
pub(crate) const BUILTIN_HOST: &str = "in-process";
/// The download's first host; the close line names the hosts its redirects added.
pub(crate) const DOWNLOAD_HOST: &str = "huggingface.co";

const WEIGHTS_FILE: &str = "model-f16.safetensors";
const CONVERTING_FILE: &str = "model-f16.safetensors.converting";
const TOKENIZER_FILE: &str = "tokenizer.json";
/// Written last: without it, or when it disagrees with the pins, nothing is ready.
const MANIFEST_FILE: &str = "manifest.json";
const DOWNLOAD_DIR: &str = "download";
/// Room left over once preparing has written everything it needs.
const SPACE_MARGIN: u64 = 256 * 1024 * 1024;

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
    /// Loading the converted file and comparing it with the reference vectors.
    Check,
}

/// `done` and `total` are bytes, except in `Check`, which is 0 of 1 until it ends.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Progress {
    pub stage: Stage,
    pub done: u64,
    pub total: u64,
}

/// What a preparation did, kept when it fails: the hosts it asked are in `report`.
#[derive(Debug)]
pub(crate) struct Prepared {
    pub report: DownloadReport,
    pub result: Result<(), EmbedError>,
}

/// Whether the store can be loaded, and if not, why.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Readiness {
    Ready,
    /// Nothing prepared, or a preparation that has not finished.
    NotPrepared,
    /// A manifest that disagrees with this build's pins or with the files on disk:
    /// `revision`, `tokenizer`, `weights-size`, `tokenizer-size` or `manifest`.
    Mismatch(&'static str),
}

/// What `prepare` fetches and how it checks the result; tests pass a tiny model.
struct Recipe<'a> {
    files: &'a [PinnedFile],
    config: &'a str,
    /// `pins::REFERENCES_JSON` outside tests.
    references: &'a str,
    /// The converted file's size, for the space check.
    converted_bytes: u64,
    device: fn() -> (Device, DType),
    free_space: fn(&Path) -> std::io::Result<u64>,
}

const PINNED: Recipe<'static> = Recipe {
    files: &pins::DOWNLOADS,
    config: pins::CONFIG_JSON,
    references: pins::REFERENCES_JSON,
    converted_bytes: pins::CONVERTED_BYTES,
    device: infer::device,
    free_space,
};

impl Recipe<'_> {
    fn file(&self, name: &str) -> Option<&PinnedFile> {
        self.files.iter().find(|file| file.name == name)
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct Manifest {
    model: String,
    repository: String,
    revision: String,
    weights: ManifestFile,
    tokenizer: ManifestFile,
}

#[derive(Debug, Serialize, Deserialize)]
struct ManifestFile {
    bytes: u64,
    sha256: String,
}

#[derive(Debug, Deserialize)]
struct References {
    /// The least cosine each probe may show against its reference vector.
    floor: f32,
    probes: Vec<Probe>,
}

#[derive(Debug, Deserialize)]
struct Probe {
    text: String,
    vector: Vec<f32>,
}

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

/// Bytes the current user may still write on the volume holding `path`.
#[cfg(unix)]
fn free_space(path: &Path) -> std::io::Result<u64> {
    use std::os::unix::ffi::OsStrExt;
    let name = std::ffi::CString::new(path.as_os_str().as_bytes())?;
    // SAFETY: `statvfs` only writes into the zeroed struct it is given.
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: `name` is a valid C string and `stat` outlives the call.
    if unsafe { libc::statvfs(name.as_ptr(), &mut stat) } != 0 {
        return Err(std::io::Error::last_os_error());
    }
    #[allow(
        clippy::useless_conversion,
        reason = "the field widths differ by platform"
    )]
    let free = u64::from(stat.f_bavail).saturating_mul(u64::from(stat.f_frsize));
    Ok(free)
}

#[cfg(windows)]
fn free_space(path: &Path) -> std::io::Result<u64> {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut available = 0u64;
    // SAFETY: `wide` is NUL-terminated and `available` outlives the call.
    let ok = unsafe {
        windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(available)
}

fn file_len(path: &Path) -> u64 {
    fs::symlink_metadata(path)
        .ok()
        .filter(fs::Metadata::is_file)
        .map_or(0, |meta| meta.len())
}

/// Makes the renames in `dir` survive a power loss; Windows has no directory handle
/// to sync and journals the rename itself.
fn sync_dir(dir: &Path) -> Result<(), EmbedError> {
    #[cfg(unix)]
    fs::File::open(dir)
        .and_then(|file| file.sync_all())
        .map_err(store_error)?;
    #[cfg(not(unix))]
    let _ = dir;
    Ok(())
}

fn sync_file(path: &Path) -> Result<(), EmbedError> {
    fs::File::open(path)
        .and_then(|file| file.sync_all())
        .map_err(store_error)
}

fn sha256_file(path: &Path, cancel: &AtomicBool) -> Result<String, EmbedError> {
    let mut file = fs::File::open(path).map_err(store_error)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(EmbedError::Cancelled);
        }
        let read = file.read(&mut buffer).map_err(store_error)?;
        match buffer.get(..read) {
            Some(chunk) if !chunk.is_empty() => hasher.update(chunk),
            _ => return Ok(hex(&hasher.finalize())),
        }
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

    pub(crate) fn readiness(&self) -> Readiness {
        self.readiness_for(&PINNED)
    }

    pub(crate) fn is_ready(&self) -> bool {
        self.readiness() == Readiness::Ready
    }

    /// Reads only the manifest and two file sizes: the content was hashed and
    /// synced before the manifest was written.
    fn readiness_for(&self, recipe: &Recipe<'_>) -> Readiness {
        let path = self.dir.join(MANIFEST_FILE);
        let is_file = fs::symlink_metadata(&path).is_ok_and(|meta| meta.is_file());
        let Some(text) = is_file.then(|| fs::read_to_string(&path).ok()).flatten() else {
            return Readiness::NotPrepared;
        };
        let Ok(manifest) = serde_json::from_str::<Manifest>(&text) else {
            return Readiness::Mismatch("manifest");
        };
        if manifest.revision != pins::REVISION || manifest.model != MODEL_NAME {
            return Readiness::Mismatch("revision");
        }
        let pinned = recipe.file(TOKENIZER_FILE);
        if pinned.is_none_or(|pin| {
            pin.sha256 != manifest.tokenizer.sha256 || pin.bytes != manifest.tokenizer.bytes
        }) {
            return Readiness::Mismatch("tokenizer");
        }
        if file_len(&self.weights()) != manifest.weights.bytes {
            return Readiness::Mismatch("weights-size");
        }
        if file_len(&self.tokenizer()) != manifest.tokenizer.bytes {
            return Readiness::Mismatch("tokenizer-size");
        }
        Readiness::Ready
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
    #[cfg_attr(
        test,
        expect(dead_code, reason = "tests drive prepare_with with a fake transport")
    )]
    pub(crate) fn prepare(
        &self,
        vault_dir: &Path,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
    ) -> Prepared {
        self.prepare_with(&fetch::HTTPS_ONLY, &PINNED, vault_dir, cancel, on_progress)
    }

    fn prepare_with(
        &self,
        fetch: &dyn Fetch,
        recipe: &Recipe<'_>,
        vault_dir: &Path,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
    ) -> Prepared {
        let mut report = DownloadReport::default();
        let result = self.prepare_steps(fetch, recipe, vault_dir, cancel, on_progress, &mut report);
        Prepared { report, result }
    }

    fn prepare_steps(
        &self,
        fetch: &dyn Fetch,
        recipe: &Recipe<'_>,
        vault_dir: &Path,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
        report: &mut DownloadReport,
    ) -> Result<(), EmbedError> {
        let _busy = Busy::claim(&self.dir)?;
        let ready = self.readiness_for(recipe) == Readiness::Ready;
        self.sweep(recipe, ready)?;
        if ready {
            return Ok(());
        }
        self.check_space(recipe)?;
        let downloads = self.download_dir();
        Downloader {
            fetch,
            files: recipe.files,
            dir: &downloads,
            vault_dir,
            cancel,
            on_progress: &mut *on_progress,
        }
        .run(report)?;
        self.convert_and_check(recipe, &downloads, cancel, on_progress)
    }

    /// Removes what no step will use: a quit can leave the writer's hidden
    /// temporary file, a half-converted file or the download of a ready model.
    /// When not ready, only the download's own files stay.
    fn sweep(&self, recipe: &Recipe<'_>, ready: bool) -> Result<(), EmbedError> {
        let kept: &[&str] = if ready {
            &[WEIGHTS_FILE, TOKENIZER_FILE, MANIFEST_FILE]
        } else {
            &[DOWNLOAD_DIR]
        };
        sweep_dir(&self.dir, &|name, meta| {
            kept.contains(&name) && (meta.is_file() || (name == DOWNLOAD_DIR && meta.is_dir()))
        })?;
        if ready {
            return Ok(());
        }
        let mut names: Vec<String> = vec![download::OPEN_RUN.to_string()];
        for file in recipe.files {
            names.push(file.name.to_string());
            names.push(format!("{}.part", file.name));
        }
        sweep_dir(&self.download_dir(), &|name, meta| {
            meta.is_file() && names.iter().any(|kept| kept == name)
        })
    }

    /// Refuses before the first byte when the volume cannot hold the rest of the
    /// download, the converted file beside it, and the margin.
    fn check_space(&self, recipe: &Recipe<'_>) -> Result<(), EmbedError> {
        let downloads = self.download_dir();
        let still: u64 = recipe
            .files
            .iter()
            .map(|file| {
                let done = file_len(&downloads.join(file.name));
                let have = if done == file.bytes {
                    done
                } else {
                    file_len(&download::part_path(&downloads, file)).min(file.bytes)
                };
                file.bytes - have
            })
            .sum();
        let needed = still + recipe.converted_bytes + SPACE_MARGIN;
        let probe = self
            .dir
            .ancestors()
            .find(|dir| dir.is_dir())
            .unwrap_or(&self.dir);
        let free = (recipe.free_space)(probe).map_err(store_error)?;
        if free < needed {
            return Err(EmbedError::DiskSpace { needed, free });
        }
        Ok(())
    }

    fn convert_and_check(
        &self,
        recipe: &Recipe<'_>,
        downloads: &Path,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
    ) -> Result<(), EmbedError> {
        let converting = self.dir.join(CONVERTING_FILE);
        let config = infer::config(recipe.config)?;
        convert::convert(
            &downloads.join(pins::WEIGHTS.name),
            &config,
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
        let checked = (|| {
            if cancel.load(Ordering::Relaxed) {
                return Err(EmbedError::Cancelled);
            }
            sync_file(&converting)?;
            on_progress(&Progress {
                stage: Stage::Check,
                done: 0,
                total: 1,
            });
            check(recipe, &converting, &downloads.join(TOKENIZER_FILE))?;
            sha256_file(&converting, cancel)
        })();
        let weights_sha256 = match checked {
            Ok(digest) => digest,
            Err(error) => {
                remove_if_present(&converting)?;
                return Err(error);
            }
        };
        let tokenizer = recipe
            .file(TOKENIZER_FILE)
            .ok_or_else(|| EmbedError::Store("recipe".into()))?;
        let manifest = Manifest {
            model: MODEL_NAME.into(),
            repository: pins::REPOSITORY.into(),
            revision: pins::REVISION.into(),
            weights: ManifestFile {
                bytes: file_len(&converting),
                sha256: weights_sha256,
            },
            tokenizer: ManifestFile {
                bytes: tokenizer.bytes,
                sha256: tokenizer.sha256.into(),
            },
        };
        fs::rename(downloads.join(TOKENIZER_FILE), self.tokenizer()).map_err(store_error)?;
        fs::rename(&converting, self.weights()).map_err(store_error)?;
        sync_dir(&self.dir)?;
        let text =
            serde_json::to_vec(&manifest).map_err(|error| EmbedError::Store(error.to_string()))?;
        write_synced(&self.dir.join(MANIFEST_FILE), &text)?;
        sync_dir(&self.dir)?;
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

/// Deletes every entry of `dir` that `keep` rejects; a link is removed, never followed.
fn sweep_dir(dir: &Path, keep: &dyn Fn(&str, &fs::Metadata) -> bool) -> Result<(), EmbedError> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(store_error(error)),
    };
    for entry in entries {
        let entry = entry.map_err(store_error)?;
        let path = entry.path();
        let meta = fs::symlink_metadata(&path).map_err(store_error)?;
        let name = entry.file_name();
        if keep(&name.to_string_lossy(), &meta) {
            continue;
        }
        if meta.is_dir() {
            fs::remove_dir_all(&path).map_err(store_error)?;
        } else {
            remove_link(&path)?;
            remove_if_present(&path)?;
        }
    }
    Ok(())
}

/// The converted file must turn each reference text into a vector within the floor
/// of the one recorded from an independent implementation of the same model.
fn check(recipe: &Recipe<'_>, weights: &Path, tokenizer: &Path) -> Result<(), EmbedError> {
    let references: References = serde_json::from_str(recipe.references)
        .map_err(|_| EmbedError::ModelLoad("references".into()))?;
    if references.probes.is_empty() {
        return Err(EmbedError::ModelLoad("references".into()));
    }
    let (device, dtype) = (recipe.device)();
    let config = infer::config(recipe.config)?;
    let encoder = Encoder::load(weights, tokenizer, &config, device, dtype)?;
    let texts: Vec<&str> = references
        .probes
        .iter()
        .map(|probe| probe.text.as_str())
        .collect();
    let vectors = encoder.embed(&texts, true)?;
    for (index, (vector, probe)) in vectors.iter().zip(&references.probes).enumerate() {
        let mut expected = probe.vector.clone();
        if vector.len() != config.hidden_size || expected.len() != vector.len() {
            return Err(EmbedError::ModelLoad(format!("reference {index} width")));
        }
        infer::normalize(&mut expected)?;
        let cosine: f32 = vector.iter().zip(&expected).map(|(a, b)| a * b).sum();
        if cosine < references.floor {
            return Err(EmbedError::ModelLoad(format!(
                "reference {index} cosine {cosine:.4}"
            )));
        }
    }
    Ok(())
}

fn store_error(error: std::io::Error) -> EmbedError {
    EmbedError::Store(crate::errors::squeeze(&error.to_string()))
}

/// A status read never waits for a load.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ModelState {
    Unloaded,
    Loading,
    Loaded,
}

const UNLOADED: u8 = 0;
const LOADING: u8 = 1;
const LOADED: u8 = 2;

/// The one copy in memory and who is using it; held only for bookkeeping, never
/// across a load or a pass.
#[derive(Default)]
struct Slot {
    encoder: Option<Arc<Encoder>>,
    loading: bool,
    /// Open builds and running questions.
    holders: usize,
    /// An unload asked for while holders remained; the last one to finish frees it.
    unload_pending: bool,
}

type Loader = dyn Fn(&ModelStore) -> Result<Encoder, EmbedError> + Send + Sync;

fn load_from_store(store: &ModelStore) -> Result<Encoder, EmbedError> {
    if !store.is_ready() {
        return Err(EmbedError::ModelNotReady);
    }
    let (device, dtype) = infer::device();
    Encoder::load(
        &store.weights(),
        &store.tokenizer(),
        &infer::config(pins::CONFIG_JSON)?,
        device,
        dtype,
    )
}

/// The built-in model, loaded on first use and dropped on request. At most one
/// copy exists: builds and questions share it, and a load waits for one running.
pub(crate) struct BuiltinModel {
    store: ModelStore,
    slot: Mutex<Slot>,
    changed: Condvar,
    state: AtomicU8,
    last_used: Mutex<Option<Instant>>,
    loader: Box<Loader>,
}

/// One user of the loaded copy; the last one out applies a pending unload.
struct Lease<'m> {
    model: &'m BuiltinModel,
    encoder: Option<Arc<Encoder>>,
}

impl Lease<'_> {
    fn encoder(&self) -> Result<&Encoder, EmbedError> {
        self.encoder.as_deref().ok_or(EmbedError::ModelNotReady)
    }
}

impl Drop for Lease<'_> {
    fn drop(&mut self) {
        drop(self.encoder.take());
        let freed = {
            let mut slot = self.model.slot();
            slot.holders = slot.holders.saturating_sub(1);
            if slot.holders == 0 && slot.unload_pending {
                self.model.take_encoder(&mut slot)
            } else {
                None
            }
        };
        if let Some(encoder) = freed {
            drop(encoder);
            infer::release_memory();
        }
    }
}

impl BuiltinModel {
    pub(crate) fn new(store: ModelStore) -> Self {
        Self::with_loader(store, Box::new(load_from_store))
    }

    fn with_loader(store: ModelStore, loader: Box<Loader>) -> Self {
        Self {
            store,
            slot: Mutex::new(Slot::default()),
            changed: Condvar::new(),
            state: AtomicU8::new(UNLOADED),
            last_used: Mutex::new(None),
            loader,
        }
    }

    pub(crate) fn store(&self) -> &ModelStore {
        &self.store
    }

    fn slot(&self) -> MutexGuard<'_, Slot> {
        self.slot
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn take_encoder(&self, slot: &mut Slot) -> Option<Arc<Encoder>> {
        slot.unload_pending = false;
        self.state.store(UNLOADED, Ordering::SeqCst);
        slot.encoder.take()
    }

    /// Loads the model unless it is loaded and keeps it, cancelling an unload that
    /// waits for a build; an unload asked for after this call still wins.
    pub(crate) fn load(&self) -> Result<(), EmbedError> {
        self.slot().unload_pending = false;
        let lease = self.lease()?;
        self.touch();
        drop(lease);
        Ok(())
    }

    /// Frees the model now and returns `true`, or, while a build or a question
    /// uses it, when the last of them ends and returns `false`.
    pub(crate) fn unload(&self) -> bool {
        let freed = {
            let mut slot = self.slot();
            if slot.holders > 0 || slot.loading {
                slot.unload_pending = true;
                return false;
            }
            self.take_encoder(&mut slot)
        };
        if let Some(encoder) = freed {
            drop(encoder);
            infer::release_memory();
        }
        true
    }

    pub(crate) fn state(&self) -> ModelState {
        match self.state.load(Ordering::SeqCst) {
            LOADING => ModelState::Loading,
            LOADED => ModelState::Loaded,
            _ => ModelState::Unloaded,
        }
    }

    pub(crate) fn is_loaded(&self) -> bool {
        self.state() == ModelState::Loaded
    }

    /// Where the model runs or would run, and the memory it needs there.
    pub(crate) fn runtime(&self) -> Runtime {
        let loaded = self.slot().encoder.clone();
        match loaded {
            Some(encoder) => encoder.runtime(),
            None => infer::runtime_of(&infer::device().0),
        }
    }

    /// Time since the model was loaded or last embedded; `None` before either.
    pub(crate) fn idle_for(&self) -> Option<Duration> {
        self.last_used
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .map(|at| at.elapsed())
    }

    /// The loaded copy, loading it first when needed; a caller that finds a load
    /// running waits for it rather than starting another.
    fn lease(&self) -> Result<Lease<'_>, EmbedError> {
        let mut slot = self.slot();
        loop {
            if let Some(encoder) = slot.encoder.clone() {
                slot.holders += 1;
                return Ok(Lease {
                    model: self,
                    encoder: Some(encoder),
                });
            }
            if !slot.loading {
                break;
            }
            slot = self
                .changed
                .wait(slot)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
        }
        slot.loading = true;
        self.state.store(LOADING, Ordering::SeqCst);
        drop(slot);

        let loaded = (self.loader)(&self.store);
        let mut slot = self.slot();
        slot.loading = false;
        let lease = match loaded {
            Ok(encoder) => {
                let encoder = Arc::new(encoder);
                slot.encoder = Some(encoder.clone());
                slot.holders += 1;
                self.state.store(LOADED, Ordering::SeqCst);
                Ok(Lease {
                    model: self,
                    encoder: Some(encoder),
                })
            }
            Err(error) => {
                slot.unload_pending = false;
                self.state.store(UNLOADED, Ordering::SeqCst);
                Err(error)
            }
        };
        drop(slot);
        self.changed.notify_all();
        lease
    }

    #[cfg(test)]
    fn with_encoder(store: ModelStore, encoder: Encoder) -> Self {
        let model = Self::new(store);
        model.slot().encoder = Some(Arc::new(encoder));
        model.state.store(LOADED, Ordering::SeqCst);
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
        let lease = self.lease()?;
        let run = audit::write_start(vault_dir, &BUILTIN_SOURCE, plan)?;
        Ok(Box::new(BuiltinRun {
            model: self,
            lease: Some(lease),
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
        let lease = self.lease()?;
        let payload = serde_json::json!([question]).to_string();
        let reservation = audit::reserve_query(vault_dir, &BUILTIN_SOURCE, question, &payload)?;
        let started = Instant::now();
        let embedded = lease.encoder()?.embed(&[question], true);
        drop(lease);
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
    lease: Option<Lease<'m>>,
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
        self.lease = None;
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
        self.embed_batch_until(passages, &AtomicBool::new(false))
    }

    /// Stops between padded groups, within about a second on the CPU.
    fn embed_batch_until(
        &mut self,
        passages: &[&str],
        stop: &AtomicBool,
    ) -> Result<Vec<Vec<f32>>, EmbedError> {
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
        let lease = self.lease.as_ref().ok_or(EmbedError::ModelNotReady)?;
        self.passages_read += passages.len();
        self.chars_read += chars;
        self.read_hash
            .update(serde_json::json!(passages).to_string().as_bytes());
        let vectors = lease.encoder()?.embed_until(passages, false, stop);
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
