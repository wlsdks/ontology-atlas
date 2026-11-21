//! The Tauri commands of the spec's command contract. Each is `async` and hands its arguments to
//! one plain function on the blocking pool, which takes the folder through the same granted-root
//! door as the search index and answers a model failure as a state, so the screen never parses an
//! error string. A command errs only for what the screens cannot produce: a folder not granted, a
//! runner address off this computer, a model name no runner holds, search prefixes outside the
//! contract, or an app closing; and for a Delete whose files stay on disk, which the screen shows.

use super::job::Entry;
use super::models::model_name;
use super::types::{
    BuiltinProbe, RunnerProbe, RunnerReach, VectorFound, VectorProbe, VectorSource, VectorStatus,
};
use super::{app, bind, Vectors};
use crate::blocking::run_blocking;
use crate::llm::embed::builtin::ModelStore;
use crate::llm::embed::{check_runner, runner_embedding_models, EmbedError};
use crate::vault::index::granted_root;
use std::path::Path;
use std::sync::Arc;
use tauri::AppHandle;

/// `vectors.sqlite` is about this many bytes per byte of Markdown (the spec's file budget).
const VECTORS_PER_TEXT_BYTE: f64 = 1.1;
/// The store's limit on a model's name, its source prefix included (`vault_index::vectors`).
const STORE_MODEL_NAME_MAX_CHARS: usize = 200;

/// A search names at most this many path prefixes,
const MAX_PREFIXES: usize = 16;
/// each at most this many bytes.
const MAX_PREFIX_BYTES: usize = 512;

impl Vectors {
    /// Reads the folder's files and their bytes from the search index alone, so nothing in the
    /// person's folder is listed, opened or measured; 0 before the index's first pass.
    pub(super) fn probe(&self, root: &Path, runner_base_url: Option<&str>) -> VectorProbe {
        let (files, text_bytes) = vault_index::Searcher::open(root)
            .ok()
            .flatten()
            .and_then(|index| index.indexed_text().ok())
            .unwrap_or((0, 0));
        let vectors_room = (text_bytes as f64 * VECTORS_PER_TEXT_BYTE) as u64;
        let builtin = match self.sources.builtin() {
            Ok(builtin) => {
                let runtime = builtin.runtime();
                BuiltinProbe {
                    on_disk: builtin.is_ready(),
                    model_bytes: builtin.model_bytes(),
                    download_bytes: ModelStore::download_bytes(),
                    kept_bytes: ModelStore::kept_bytes(),
                    needed_free_bytes: builtin.space_needed() + vectors_room,
                    free_bytes: builtin.free_bytes().unwrap_or(0),
                    memory_bytes: runtime.memory_bytes,
                    accelerated: runtime.device == "metal",
                    model_dir: builtin.dir().display().to_string(),
                }
            }
            Err(_) => BuiltinProbe {
                on_disk: false,
                model_bytes: 0,
                download_bytes: ModelStore::download_bytes(),
                kept_bytes: ModelStore::kept_bytes(),
                needed_free_bytes: 0,
                free_bytes: 0,
                memory_bytes: 0,
                accelerated: false,
                model_dir: String::new(),
            },
        };
        VectorProbe {
            files,
            builtin,
            runner: runner_base_url.map(probe_runner),
        }
    }
}

/// The address passes the loopback rule before anything is asked of it.
fn probe_runner(base_url: &str) -> RunnerProbe {
    let address = base_url.trim().to_string();
    let (state, models) = match runner_embedding_models(&address) {
        Ok(models) => (RunnerReach::Reachable, models),
        Err(EmbedError::NotLocal | EmbedError::ResolvesElsewhere | EmbedError::Endpoint(_)) => {
            (RunnerReach::NotLocal, Vec::new())
        }
        Err(_) => (RunnerReach::Unreachable, Vec::new()),
    };
    RunnerProbe {
        state,
        address,
        models,
    }
}

/// Every folder command's door: the folder the person granted, as the search index takes it.
fn granted_entry(vectors: &Vectors, root_path: &str) -> Result<Arc<Entry>, String> {
    let root = granted_root(root_path)?;
    Ok(vectors.entry(&root, root_path))
}

/// Refuses a source no screen offers: a runner off this computer, or a model name a runner or
/// the store cannot hold.
fn check_source(source: &VectorSource) -> Result<(), String> {
    let VectorSource::Runner { base_url, model } = source else {
        return Ok(());
    };
    check_runner(base_url, model).map_err(|error| error.code().to_string())?;
    if model_name(source).chars().count() > STORE_MODEL_NAME_MAX_CHARS {
        return Err("vectors-model-name-too-long".into());
    }
    Ok(())
}

/// Refuses prefixes no screen sends: too many, too long, absolute, or climbing out with `..`.
fn check_prefixes(prefixes: &[String]) -> Result<(), String> {
    if prefixes.len() > MAX_PREFIXES {
        return Err("vectors-prefixes-too-many".into());
    }
    for prefix in prefixes {
        if prefix.len() > MAX_PREFIX_BYTES {
            return Err("vectors-prefix-too-long".into());
        }
        let absolute = prefix.starts_with('/') || prefix.starts_with('\\');
        if absolute || prefix.split(['/', '\\']).any(|segment| segment == "..") {
            return Err("vectors-prefix-not-relative".into());
        }
    }
    Ok(())
}

pub(super) fn probe(
    vectors: &Vectors,
    root_path: &str,
    runner_base_url: Option<&str>,
) -> Result<VectorProbe, String> {
    let entry = granted_entry(vectors, root_path)?;
    Ok(vectors.probe(&entry.root, runner_base_url))
}

pub(super) fn status(
    vectors: &Arc<Vectors>,
    root_path: &str,
    enabled: bool,
    source: Option<&VectorSource>,
    paused: bool,
) -> Result<VectorStatus, String> {
    let entry = granted_entry(vectors, root_path)?;
    if let Some(source) = source {
        check_source(source)?;
        if enabled {
            vectors.arm(&entry, source, paused);
        }
    }
    Ok(vectors.status(&entry, enabled, source))
}

/// Only with `download`, the dialog's press, may the job fetch the built-in model.
pub(super) fn prepare(
    vectors: &Arc<Vectors>,
    root_path: &str,
    enabled: bool,
    source: VectorSource,
    download: bool,
) -> Result<VectorStatus, String> {
    let entry = granted_entry(vectors, root_path)?;
    check_source(&source)?;
    if enabled {
        vectors.prepare(&entry, source, download);
    }
    Ok(vectors.status(&entry, enabled, None))
}

pub(super) fn stop(vectors: &Vectors, root_path: &str) -> Result<VectorStatus, String> {
    let entry = granted_entry(vectors, root_path)?;
    vectors.stop(&entry);
    Ok(vectors.status(&entry, true, None))
}

/// `prefixes` keeps the passages whose file path starts, byte for byte, with one of them; none
/// keeps every file.
pub(super) fn search(
    vectors: &Arc<Vectors>,
    root_path: &str,
    source: &VectorSource,
    question: &str,
    limit: usize,
    prefixes: &[String],
) -> Result<VectorFound, String> {
    let entry = granted_entry(vectors, root_path)?;
    check_source(source)?;
    check_prefixes(prefixes)?;
    Ok(vectors.search(&entry, source, question, limit, prefixes))
}

/// A Delete that could not remove the store is no delete: the command errs with a code the
/// screen can show, and the folder's status says what is still on disk.
pub(super) fn delete(vectors: &Vectors, root_path: &str) -> Result<VectorStatus, String> {
    let entry = granted_entry(vectors, root_path)?;
    let root = &entry.root;
    vectors
        .forget(Some(root), || vault_index::vectors::delete_vectors(root))
        .map_err(|error| {
            log::warn!("search by meaning could not delete its vectors: {error}");
            "vectors-delete-failed".to_string()
        })?;
    Ok(vectors.status(&entry, true, None))
}

/// What the dialog states: files, the model's sizes and memory, and a runner on this computer.
/// A runner address off this computer is answered as `notLocal`, never asked.
#[tauri::command]
pub(crate) async fn vault_vectors_probe(
    root_path: String,
    runner_base_url: Option<String>,
) -> Result<VectorProbe, String> {
    run_blocking(move || probe(app(), &root_path, runner_base_url.as_deref())).await
}

/// Never creates anything and never waits for a model. With `paused`, a folder this launch has
/// not armed yet is held, as the person left it.
#[tauri::command]
pub(crate) async fn vault_vectors_status(
    app_handle: AppHandle,
    root_path: String,
    enabled: bool,
    source: Option<VectorSource>,
    paused: Option<bool>,
) -> Result<VectorStatus, String> {
    bind(&app_handle);
    run_blocking(move || {
        status(
            app(),
            &root_path,
            enabled,
            source.as_ref(),
            paused.unwrap_or(false),
        )
    })
    .await
}

/// Starts or continues the folder's one background job and returns at once; with the search
/// index off it answers `off` and starts nothing. Only with `download`, the dialog's press, may
/// it fetch the built-in model; without it a missing model answers `modelGone`.
#[tauri::command]
pub(crate) async fn vault_vectors_prepare(
    app_handle: AppHandle,
    root_path: String,
    enabled: bool,
    source: VectorSource,
    download: bool,
) -> Result<VectorStatus, String> {
    bind(&app_handle);
    run_blocking(move || prepare(app(), &root_path, enabled, source, download)).await
}

/// Stops at the next batch, download chunk or model step and holds the folder; everything stored
/// stays.
#[tauri::command]
pub(crate) async fn vault_vectors_stop(
    app_handle: AppHandle,
    root_path: String,
) -> Result<VectorStatus, String> {
    bind(&app_handle);
    run_blocking(move || stop(app(), &root_path)).await
}

/// Loads the built-in model for a question about to be asked and returns at once.
#[tauri::command]
pub(crate) async fn vault_vectors_warm(source: VectorSource) -> Result<(), String> {
    run_blocking(move || {
        app().warm(&source);
        Ok(())
    })
    .await
}

/// The nearest passages, at most 64, each still in its file and, with `prefixes`, under one of
/// them.
#[tauri::command]
pub(crate) async fn vault_vectors_search(
    app_handle: AppHandle,
    root_path: String,
    source: VectorSource,
    question: String,
    limit: usize,
    prefixes: Vec<String>,
) -> Result<VectorFound, String> {
    bind(&app_handle);
    run_blocking(move || search(app(), &root_path, &source, &question, limit, &prefixes)).await
}

/// Deletes this folder's vectors and ends its job; the vault itself is not touched.
#[tauri::command]
pub(crate) async fn vault_vectors_delete(
    app_handle: AppHandle,
    root_path: String,
) -> Result<VectorStatus, String> {
    bind(&app_handle);
    run_blocking(move || delete(app(), &root_path)).await
}

/// Ends every job using the built-in model, then deletes its files; vectors stay.
#[tauri::command]
pub(crate) async fn vault_vectors_delete_model() -> Result<(), String> {
    run_blocking(move || app().delete_model()).await
}

/// Shows the built-in model's folder in Finder or Explorer; the path is the app's own, never one
/// the screen names, and a folder the model does not hold yet is refused.
#[tauri::command]
pub(crate) async fn vault_vectors_reveal_model() -> Result<(), String> {
    run_blocking(move || {
        let builtin = app()
            .sources
            .builtin()
            .map_err(|error| error.code().to_string())?;
        reveal_model_dir(&builtin.dir())
    })
    .await
}

fn reveal_model_dir(dir: &Path) -> Result<(), String> {
    if !dir.is_dir() {
        return Err(crate::errors::coded(
            "reveal-failed",
            "the model folder is not there",
        ));
    }
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg("-R")
            .arg(dir)
            .status()
            .map_err(|err| crate::errors::coded("reveal-failed", err))?;
        if status.success() {
            Ok(())
        } else {
            Err(crate::errors::coded(
                "reveal-failed",
                format!("open exited with status {status}"),
            ))
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        crate::app_shell::reveal_in_file_manager(dir)
    }
}

#[cfg(test)]
mod reveal_tests {
    use super::reveal_model_dir;
    use std::path::Path;

    #[test]
    fn refuses_a_model_folder_that_is_not_there() {
        let error = reveal_model_dir(Path::new("/nonexistent/atlas/models/bge-m3")).unwrap_err();
        assert!(error.starts_with("reveal-failed"), "{error}");
    }
}
