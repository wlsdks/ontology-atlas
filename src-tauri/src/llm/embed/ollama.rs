// Ollama's own routes: whether it answers, which embedding models it holds, whether
// a model is a cloud model, and a pull of an allow-listed model. None carries folder
// content; the pull still writes `model-download` lines because it starts a download.

use super::audit::{self, Download, RunEnd};
use super::transport::Request;
use super::{EmbedError, LocalRunner, PULLABLE_MODELS};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::Instant;

/// Ollama's progress for one pull; `percent` never goes back even when a new
/// layer raises the total.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PullProgress {
    pub status: String,
    pub completed: u64,
    pub total: u64,
    pub percent: u8,
}

/// A model is a handful of layers; more distinct digests than this is not a pull.
const MAX_LAYERS: usize = 64;

pub(super) fn version(runner: &LocalRunner) -> Result<String, EmbedError> {
    #[derive(Deserialize)]
    struct Version {
        version: String,
    }
    let text = runner.get("version")?;
    let parsed: Version =
        serde_json::from_str(&text).map_err(|_| EmbedError::ResponseInvalid("not-json"))?;
    Ok(short(&parsed.version, 40))
}

pub(super) fn embedding_models(runner: &LocalRunner) -> Result<Vec<String>, EmbedError> {
    #[derive(Deserialize)]
    struct Tags {
        models: Vec<Value>,
    }
    let text = runner.get("tags")?;
    let tags: Tags =
        serde_json::from_str(&text).map_err(|_| EmbedError::ResponseInvalid("not-json"))?;
    let mut names: Vec<String> = tags
        .models
        .iter()
        .filter_map(|model| {
            let name = model.get("name")?.as_str()?;
            if is_cloud_name(name) || has_remote_marker(model, 0) {
                return None;
            }
            let embeds = match model.get("capabilities").and_then(Value::as_array) {
                Some(capabilities) => capabilities.iter().any(|c| c == "embedding"),
                // Older Ollama lists no capabilities; the name is the only evidence.
                None => is_embedding_only_name(name),
            };
            embeds.then(|| name.to_string())
        })
        .collect();
    names.sort_by_key(|name| (family(name) != "bge-m3", name.clone()));
    names.dedup();
    Ok(names)
}

/// Ollama names its cloud models `…:cloud` or `…-cloud`.
pub(super) fn is_cloud_name(name: &str) -> bool {
    name.to_ascii_lowercase()
        .split([':', '-', '/'])
        .any(|part| part == "cloud")
}

/// Any non-empty `remote…` field, at the top or one level down, marks a model the
/// runner would forward to another host.
fn has_remote_marker(value: &Value, depth: u8) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    object.iter().any(|(key, field)| {
        let marked = key.to_ascii_lowercase().starts_with("remote")
            && match field {
                Value::Null | Value::Bool(false) => false,
                Value::String(text) => !text.trim().is_empty(),
                Value::Array(items) => !items.is_empty(),
                Value::Object(map) => !map.is_empty(),
                _ => true,
            };
        marked || (depth < 1 && has_remote_marker(field, depth + 1))
    })
}

/// `/api/show` for the configured model. A runner that is not Ollama answers 404
/// or 405 and has no cloud models.
pub(super) fn refuse_remote_model(runner: &LocalRunner) -> Result<(), EmbedError> {
    let body = serde_json::json!({ "model": runner.model() }).to_string();
    let url = runner.endpoint.api_url("show");
    let (status, text) = runner.transport.send(&Request {
        url: &url,
        body: Some(&body),
        timeout: runner.timeouts.probe,
        pin: runner.endpoint.pin(),
    })?;
    match status {
        200..=299 => {
            let shown: Value =
                serde_json::from_str(&text).map_err(|_| EmbedError::ResponseInvalid("not-json"))?;
            if has_remote_marker(&shown, 0) {
                Err(EmbedError::ModelRemote)
            } else {
                Ok(())
            }
        }
        300..=399 => Err(EmbedError::Redirected(status)),
        404 | 405 => Ok(()),
        _ => Err(EmbedError::Http(status)),
    }
}

/// `isEmbeddingOnlyModel` in `src/shared/lib/llm-connection/local-endpoint.ts`.
pub(super) fn is_embedding_only_name(name: &str) -> bool {
    let base = family(name).trim().to_lowercase();
    base.contains("embed")
        || ["bge", "gte", "e5", "all-minilm", "paraphrase-multilingual"]
            .iter()
            .any(|prefix| base == *prefix || base.starts_with(&format!("{prefix}-")))
}

fn family(name: &str) -> &str {
    name.split(':').next().unwrap_or(name)
}

pub(super) fn pull(
    runner: &LocalRunner,
    vault_dir: &Path,
    model: &str,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(&PullProgress),
) -> Result<(), EmbedError> {
    if !PULLABLE_MODELS.contains(&model) {
        return Err(EmbedError::ModelNotAllowed(short(model, 60)));
    }
    let body = serde_json::json!({ "model": model, "stream": true }).to_string();
    let run = uuid::Uuid::new_v4().to_string();
    let mut line = Download {
        run: &run,
        model,
        source: "ollama-pull",
        revision: None,
        bytes: None,
        ended: None,
        payload_sha256: crate::llm_audit::sha256_hex(&body),
    };
    audit::write_download_start(vault_dir, runner, &line)?;

    let started = Instant::now();
    let url = runner.endpoint.api_url("pull");
    let mut progress = PullTracker::default();
    let streamed = runner.transport.stream(
        &Request {
            url: &url,
            body: Some(&body),
            timeout: runner.timeouts.probe,
            pin: runner.endpoint.pin(),
        },
        &runner.timeouts.pull,
        cancel,
        &mut |text| {
            if let Some(update) = progress.read(text) {
                on_progress(&update);
            }
            progress.error.is_none()
        },
    );
    let outcome = match streamed {
        _ if progress.error.is_some() => Err(EmbedError::PullFailed(
            progress.error.clone().unwrap_or_default(),
        )),
        Err(error) => Err(error),
        Ok(None) => Err(EmbedError::PullFailed("stopped".into())),
        Ok(Some(200..=299)) if progress.succeeded => Ok(()),
        Ok(Some(200..=299)) => Err(EmbedError::PullFailed("ended-without-success".into())),
        Ok(Some(status @ 300..=399)) => Err(EmbedError::Redirected(status)),
        Ok(Some(status)) => Err(EmbedError::Http(status)),
    };
    line.revision = progress.largest_digest();
    line.bytes = Some(progress.completed);
    line.ended = Some(match &outcome {
        Ok(()) => RunEnd::Complete,
        Err(EmbedError::Cancelled) => RunEnd::Stopped,
        Err(_) => RunEnd::Failed,
    });
    let closed = audit::write_download_close(
        vault_dir,
        runner,
        &line,
        started.elapsed().as_millis() as u64,
    );
    outcome?;
    closed
}

/// Running sums over a map keyed by digest, so each line costs O(1).
#[derive(Default)]
pub(super) struct PullTracker {
    layers: HashMap<String, (u64, u64)>,
    completed: u64,
    total: u64,
    percent: u8,
    pub(super) succeeded: bool,
    pub(super) error: Option<String>,
}

impl PullTracker {
    /// One NDJSON line of `/api/pull`; a line that is not progress is ignored.
    pub(super) fn read(&mut self, line: &str) -> Option<PullProgress> {
        #[derive(Deserialize)]
        struct Line {
            #[serde(default)]
            status: Option<String>,
            #[serde(default)]
            error: Option<String>,
            #[serde(default)]
            digest: Option<String>,
            #[serde(default)]
            total: Option<u64>,
            #[serde(default)]
            completed: Option<u64>,
        }
        if self.error.is_some() {
            return None;
        }
        let parsed: Line = serde_json::from_str(line).ok()?;
        if let Some(error) = parsed.error {
            self.error = Some(short(&error, 200));
            return None;
        }
        let status = short(parsed.status.as_deref().unwrap_or(""), 80);
        if status == "success" {
            self.succeeded = true;
            self.percent = 100;
        }
        if let (Some(digest), Some(total)) = (parsed.digest, parsed.total) {
            let completed = parsed.completed.unwrap_or(0).min(total);
            let digest = short(&digest, 80);
            if !self.layers.contains_key(&digest) && self.layers.len() >= MAX_LAYERS {
                self.error = Some("too-many-layers".into());
                return None;
            }
            let (old_completed, old_total) = self
                .layers
                .insert(digest, (completed, total))
                .unwrap_or((0, 0));
            self.completed = self
                .completed
                .saturating_sub(old_completed)
                .saturating_add(completed);
            self.total = self.total.saturating_sub(old_total).saturating_add(total);
        }
        if let Some(now) = self.completed.saturating_mul(100).checked_div(self.total) {
            self.percent = self.percent.max(now.min(100) as u8);
        }
        Some(PullProgress {
            status,
            completed: self.completed,
            total: self.total,
            percent: self.percent,
        })
    }

    fn largest_digest(&self) -> Option<String> {
        self.layers
            .iter()
            .max_by_key(|(_, (_, total))| *total)
            .map(|(digest, _)| digest.clone())
    }
}

/// Runner text reaches the screen; bound it and strip control characters.
fn short(text: &str, max: usize) -> String {
    text.chars()
        .filter(|ch| !ch.is_control())
        .take(max)
        .collect()
}
