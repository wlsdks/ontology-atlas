// bge-m3 run by candle in a worker process the app starts. Preparing downloads the
// pinned files, has a worker convert and check them, and deletes the download.
// Passages and questions go only to the worker, so they write no audit line; the
// download, the one thing that leaves the computer, writes its lines first.

pub(crate) mod client;
mod convert;
mod download;
mod fetch;
pub(crate) mod infer;
pub(crate) mod pins;
mod protocol;
pub(crate) mod worker;

use super::audit;
use super::EmbedError;
use crate::lower_hex::lower_hex;
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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

pub(crate) use download::DownloadReport;

/// The provider in the download's lines, the only lines the built-in model writes.
pub(crate) const BUILTIN_PROVIDER: &str = "built-in";
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

/// The download's lines, which name the host it asks first.
pub(crate) struct BuiltinSource {
    host: &'static str,
}

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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Stage {
    /// Hashing a file already on disk, before asking the network for the rest.
    Verify,
    Download,
    Convert,
    /// A worker loading the converted file and comparing it with the reference vectors.
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

/// The model work preparation hands off, so its memory never stays in the app.
trait ModelWork: Sync {
    /// Writes the store's converting file from the downloaded weights.
    fn convert(
        &self,
        store: &ModelStore,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(u64, u64),
    ) -> Result<(), EmbedError>;
    /// Compares the store's two files with the reference vectors; `Cancelled` at a stop.
    fn check(&self, store: &ModelStore, cancel: &AtomicBool) -> Result<(), EmbedError>;
}

/// What `prepare` fetches and who converts and checks it; tests pass a tiny model.
struct Recipe<'a> {
    files: &'a [PinnedFile],
    /// The converted file's size, for the space check.
    converted_bytes: u64,
    free_space: fn(&Path) -> std::io::Result<u64>,
    work: &'a dyn ModelWork,
}

const PINNED: Recipe<'static> = Recipe {
    files: &pins::DOWNLOADS,
    converted_bytes: pins::CONVERTED_BYTES,
    free_space,
    work: &InWorker,
};

/// A worker of this executable; it finds the store by the app's own rule, so only
/// that store can be prepared.
struct InWorker;

impl InWorker {
    fn guard(store: &ModelStore) -> Result<(), EmbedError> {
        if worker::app_store().as_ref() != Some(store) {
            return Err(EmbedError::Store("outside-app-data".into()));
        }
        Ok(())
    }
}

impl ModelWork for InWorker {
    fn convert(
        &self,
        store: &ModelStore,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(u64, u64),
    ) -> Result<(), EmbedError> {
        Self::guard(store)?;
        client::convert_in_worker(&client::SelfLaunch, client::LIMITS, cancel, on_progress)
    }

    fn check(&self, store: &ModelStore, cancel: &AtomicBool) -> Result<(), EmbedError> {
        Self::guard(store)?;
        client::check_in_worker(&client::SelfLaunch, client::LIMITS, cancel)
    }
}

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
    open_for_sync(path)
        .and_then(|file| file.sync_all())
        .map_err(store_error)
}

/// Windows flushes only through a handle that may write (`FlushFileBuffers`), and answers
/// "Access is denied" for a read-only one.
fn open_for_sync(path: &Path) -> std::io::Result<fs::File> {
    fs::OpenOptions::new().write(true).open(path)
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
            _ => return Ok(lower_hex(&hasher.finalize())),
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

    fn converting(&self) -> PathBuf {
        self.dir.join(CONVERTING_FILE)
    }

    /// The worker's half of preparing: the downloaded weights to the converting file.
    fn convert_download(
        &self,
        config: &str,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(u64, u64),
    ) -> Result<(), EmbedError> {
        convert::convert(
            &self.download_dir().join(pins::WEIGHTS.name),
            &infer::config(config)?,
            &self.converting(),
            cancel,
            on_progress,
        )
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

    /// Removes the model and any partial download. Release the model first: a
    /// running worker maps the weights, and Windows refuses to delete a mapped file.
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
        let needed = self.space_needed_for(recipe);
        let free = (recipe.free_space)(self.space_probe()).map_err(store_error)?;
        if free < needed {
            return Err(EmbedError::DiskSpace { needed, free });
        }
        Ok(())
    }

    /// What `prepare` would refuse to start without: the rest of the download, the
    /// converted file and the margin; 0 once the model is ready.
    pub(crate) fn space_needed(&self) -> u64 {
        if self.is_ready() {
            return 0;
        }
        self.space_needed_for(&PINNED)
    }

    /// Bytes still free on the volume that will hold the model.
    pub(crate) fn free_bytes(&self) -> Option<u64> {
        (PINNED.free_space)(self.space_probe()).ok()
    }

    /// Every pinned file's size: what a download from nothing fetches.
    pub(crate) fn download_bytes() -> u64 {
        PINNED.files.iter().map(|file| file.bytes).sum()
    }

    /// What a ready store keeps: the converted weights and the tokenizer.
    pub(crate) fn kept_bytes() -> u64 {
        PINNED.converted_bytes + pins::TOKENIZER.bytes
    }

    fn space_probe(&self) -> &Path {
        self.dir
            .ancestors()
            .find(|dir| dir.is_dir())
            .unwrap_or(&self.dir)
    }

    fn space_needed_for(&self, recipe: &Recipe<'_>) -> u64 {
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
        still + recipe.converted_bytes + SPACE_MARGIN
    }

    fn convert_and_check(
        &self,
        recipe: &Recipe<'_>,
        downloads: &Path,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
    ) -> Result<(), EmbedError> {
        let converting = self.converting();
        // The download is done: a failure from here is the model's, not the network's.
        on_progress(&Progress {
            stage: Stage::Convert,
            done: 0,
            total: 0,
        });
        let converted = recipe.work.convert(self, cancel, &mut |done, total| {
            on_progress(&Progress {
                stage: Stage::Convert,
                done,
                total,
            })
        });
        if let Err(error) = converted {
            // A worker that was killed mid-write leaves its file behind.
            remove_if_present(&converting)?;
            return Err(error);
        }
        let checked = (|| {
            if cancel.load(Ordering::Relaxed) {
                return Err(EmbedError::Cancelled);
            }
            sync_file(&converting)?;
            let digest = sha256_file(&converting, cancel)?;
            on_progress(&Progress {
                stage: Stage::Check,
                done: 0,
                total: 1,
            });
            // Copied, so a failed check leaves the download whole for the next try.
            fs::copy(downloads.join(TOKENIZER_FILE), self.tokenizer()).map_err(store_error)?;
            sync_file(&self.tokenizer())?;
            fs::rename(&converting, self.weights()).map_err(store_error)?;
            sync_dir(&self.dir)?;
            recipe.work.check(self, cancel)?;
            Ok(digest)
        })();
        let weights_sha256 = match checked {
            Ok(digest) => digest,
            Err(error) => {
                for path in [converting, self.weights(), self.tokenizer()] {
                    remove_if_present(&path)?;
                }
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
                bytes: file_len(&self.weights()),
                sha256: weights_sha256,
            },
            tokenizer: ManifestFile {
                bytes: tokenizer.bytes,
                sha256: tokenizer.sha256.into(),
            },
        };
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
pub(crate) fn check_conversion(
    references: &str,
    config: &str,
    (device, dtype): (Device, DType),
    weights: &Path,
    tokenizer: &Path,
) -> Result<(), EmbedError> {
    let references: References =
        serde_json::from_str(references).map_err(|_| EmbedError::ModelLoad("references".into()))?;
    if references.probes.is_empty() {
        return Err(EmbedError::ModelLoad("references".into()));
    }
    let config = infer::config(config)?;
    let encoder = Encoder::load(weights, tokenizer, &config, device, dtype)?;
    let texts: Vec<&str> = references
        .probes
        .iter()
        .map(|probe| probe.text.as_str())
        .collect();
    let vectors = encoder.embed(&texts)?;
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

#[cfg(test)]
mod tests;
