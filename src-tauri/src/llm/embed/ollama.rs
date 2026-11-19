// Ollama's own routes: whether it answers, which embedding models it holds, and a
// pull of an allow-listed model. None of them carries folder content, so none
// writes an audit line.

use super::transport::Request;
use super::{EmbedError, LocalRunner, PULLABLE_MODELS};
use serde::Deserialize;
use std::sync::atomic::AtomicBool;

/// Ollama's progress for one pull; `percent` never goes back even when a new
/// layer raises the total.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PullProgress {
    pub status: String,
    pub completed: u64,
    pub total: u64,
    pub percent: u8,
}

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
        models: Vec<Model>,
    }
    #[derive(Deserialize)]
    struct Model {
        name: String,
        #[serde(default)]
        capabilities: Option<Vec<String>>,
    }
    let text = runner.get("tags")?;
    let tags: Tags =
        serde_json::from_str(&text).map_err(|_| EmbedError::ResponseInvalid("not-json"))?;
    let mut names: Vec<String> = tags
        .models
        .into_iter()
        .filter(|model| match &model.capabilities {
            Some(capabilities) => capabilities.iter().any(|c| c == "embedding"),
            // Older Ollama lists no capabilities; the name is the only evidence.
            None => is_embedding_only_name(&model.name),
        })
        .map(|model| model.name)
        .collect();
    names.sort_by_key(|name| (family(name) != "bge-m3", name.clone()));
    names.dedup();
    Ok(names)
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
    model: &str,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(&PullProgress),
) -> Result<(), EmbedError> {
    if !PULLABLE_MODELS.contains(&model) {
        return Err(EmbedError::ModelNotAllowed(short(model, 60)));
    }
    let body = serde_json::json!({ "model": model, "stream": true }).to_string();
    let url = runner.endpoint.api_url("pull");
    let mut progress = PullTracker::default();
    let status = runner.transport.stream(
        &Request {
            url: &url,
            body: Some(&body),
            timeout: runner.timeouts.probe,
            pin: runner.endpoint.pin(),
        },
        cancel,
        &mut |line| {
            if let Some(update) = progress.read(line) {
                on_progress(&update);
            }
        },
    )?;
    if let Some(error) = progress.error {
        return Err(EmbedError::PullFailed(error));
    }
    match status {
        200..=299 if progress.succeeded => Ok(()),
        200..=299 => Err(EmbedError::PullFailed("ended-without-success".into())),
        300..=399 => Err(EmbedError::Redirected(status)),
        _ => Err(EmbedError::Http(status)),
    }
}

#[derive(Default)]
pub(super) struct PullTracker {
    /// Per layer digest: completed and total bytes.
    layers: Vec<(String, u64, u64)>,
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
            match self.layers.iter_mut().find(|(d, _, _)| *d == digest) {
                Some(layer) => *layer = (digest, completed, total),
                None => self.layers.push((digest, completed, total)),
            }
        }
        let completed: u64 = self.layers.iter().map(|(_, c, _)| c).sum();
        let total: u64 = self.layers.iter().map(|(_, _, t)| t).sum();
        if let Some(now) = completed.saturating_mul(100).checked_div(total) {
            self.percent = self.percent.max(now.min(100) as u8);
        }
        Some(PullProgress {
            status,
            completed,
            total,
            percent: self.percent,
        })
    }
}

/// Runner text reaches the screen; bound it and strip control characters.
fn short(text: &str, max: usize) -> String {
    text.chars()
        .filter(|ch| !ch.is_control())
        .take(max)
        .collect()
}
