// Embeddings for search by meaning, from a model runner on this computer only.
// Vault text is hostile and leaves only as JSON strings to a loopback address the
// address check resolved and pinned; what comes back is numbers, checked before
// anyone stores them. Every send is preceded by a synced audit line.

mod audit;
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "the store's size, the worker's id and idle time serve Settings and tests"
    )
)]
pub(crate) mod builtin;
mod loopback;
mod ollama;
mod response;
mod transport;

use crate::errors::coded;
use loopback::{Endpoint, Resolve};
use sha2::{Digest, Sha256};
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use transport::{CurlTransport, Request, StreamLimits, Transport};

pub(crate) use audit::RunEnd;
pub(crate) use ollama::PullProgress;

/// One batch: what a cold model load can finish inside the batch timeout.
pub(crate) const MAX_BATCH_PASSAGES: usize = 32;
pub(crate) const MAX_BATCH_BYTES: usize = 64 * 1024;
/// The passage cap the store splits to; a longer one here is a caller bug.
pub(crate) const MAX_PASSAGE_CHARS: usize = 2_000;
/// No embedding model in use has more; a larger answer is not an embedding.
const MAX_DIMENSIONS: usize = 8_192;
/// Only these may be pulled: both MIT-compatible (bge-m3 MIT, qwen3-embedding
/// Apache-2.0). Gemma-licensed models are never offered.
pub(crate) const PULLABLE_MODELS: [&str; 2] = ["bge-m3", "qwen3-embedding:0.6b"];
const MAX_MODEL_CHARS: usize = 200;

/// curl's `--max-time` values: a batch may wait for a cold model load, a query is
/// a person waiting, a probe only asks whether something answers. The waits bound
/// how long a line waits for the audit log another send holds.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Timeouts {
    pub batch: &'static str,
    pub query: &'static str,
    pub probe: &'static str,
    /// Outlasts a query's 10 s hold, so a closing line is not lost to it.
    pub line_wait: Duration,
    pub query_line_wait: Duration,
    /// A question's one limit, from the call: the model check, the audit wait and the request.
    pub question: Duration,
    pub pull: StreamLimits,
}

pub(crate) const TIMEOUTS: Timeouts = Timeouts {
    batch: "120",
    query: "10",
    probe: "5",
    line_wait: Duration::from_secs(15),
    query_line_wait: Duration::from_secs(2),
    question: Duration::from_secs(10),
    pull: StreamLimits {
        max_bytes: 32 * 1024 * 1024,
        idle: Duration::from_secs(120),
        total: Duration::from_secs(3 * 60 * 60),
    },
};

/// The screen branches on `code()`; `Display` is the crate's `code: detail` form.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum EmbedError {
    /// `normalize_base_url` refused the address; holds its coded reason.
    Endpoint(String),
    NotLocal,
    ResolvesElsewhere,
    AuditBlocked(String),
    ModelInvalid,
    /// The runner would forward the text to another host (an Ollama cloud model).
    ModelRemote,
    ModelNotAllowed(String),
    BatchEmpty,
    BatchTooLarge,
    PassageTooLong(usize),
    OverPlan,
    Request(String),
    TimedOut,
    Redirected(u16),
    ModelMissing,
    Http(u16),
    ResponseTooLarge,
    ResponseInvalid(&'static str),
    Cancelled,
    PullFailed(String),
    /// A download hop named a scheme, host or port outside the allowed set.
    HostRefused(String),
    SizeMismatch(String),
    HashMismatch(String),
    ModelNotReady,
    ModelBusy,
    ModelLoad(String),
    Convert(String),
    Inference(String),
    Store(String),
    /// The volume lacks the space the whole preparation needs; nothing was kept.
    DiskSpace {
        needed: u64,
        free: u64,
    },
    /// The download host could not be reached directly; no proxy is used.
    NoDirectConnection,
    /// The model worker could not be started or did not introduce itself.
    WorkerStart(String),
    WorkerExited,
    /// The model worker refused a request with a code this side does not know.
    WorkerFailed(String),
}

impl EmbedError {
    pub(crate) fn code(&self) -> &'static str {
        match self {
            Self::Endpoint(_) => "embed-endpoint-invalid",
            Self::NotLocal => "embed-not-local",
            Self::ResolvesElsewhere => "embed-resolves-elsewhere",
            Self::AuditBlocked(_) => "embed-audit-blocked",
            Self::ModelInvalid => "embed-model-invalid",
            Self::ModelRemote => "embed-model-remote",
            Self::ModelNotAllowed(_) => "embed-model-not-allowed",
            Self::BatchEmpty => "embed-batch-empty",
            Self::BatchTooLarge => "embed-batch-too-large",
            Self::PassageTooLong(_) => "embed-passage-too-long",
            Self::OverPlan => "embed-over-plan",
            Self::Request(_) => "embed-request-failed",
            Self::TimedOut => "embed-timed-out",
            Self::Redirected(_) => "embed-redirect-refused",
            Self::ModelMissing => "embed-model-missing",
            Self::Http(_) => "embed-http-error",
            Self::ResponseTooLarge => "embed-response-too-large",
            Self::ResponseInvalid(_) => "embed-response-invalid",
            Self::Cancelled => "embed-cancelled",
            Self::PullFailed(_) => "embed-pull-failed",
            Self::HostRefused(_) => "embed-download-host-refused",
            Self::SizeMismatch(_) => "embed-download-size-mismatch",
            Self::HashMismatch(_) => "embed-download-hash-mismatch",
            Self::ModelNotReady => "embed-model-not-ready",
            Self::ModelBusy => "embed-model-busy",
            Self::ModelLoad(_) => "embed-model-load-failed",
            Self::Convert(_) => "embed-model-convert-failed",
            Self::Inference(_) => "embed-inference-failed",
            Self::Store(_) => "embed-model-store-failed",
            Self::DiskSpace { .. } => "embed-model-disk-space",
            Self::NoDirectConnection => "embed-download-no-direct-connection",
            Self::WorkerStart(_) => "embed-worker-start-failed",
            Self::WorkerExited => "embed-worker-exited",
            Self::WorkerFailed(_) => "embed-worker-failed",
        }
    }

    pub(crate) fn detail(&self) -> String {
        match self {
            Self::Endpoint(detail)
            | Self::WorkerStart(detail)
            | Self::WorkerFailed(detail)
            | Self::AuditBlocked(detail)
            | Self::Request(detail)
            | Self::ModelNotAllowed(detail)
            | Self::PullFailed(detail)
            | Self::HostRefused(detail)
            | Self::SizeMismatch(detail)
            | Self::HashMismatch(detail)
            | Self::ModelLoad(detail)
            | Self::Convert(detail)
            | Self::Inference(detail)
            | Self::Store(detail) => detail.clone(),
            Self::PassageTooLong(index) => index.to_string(),
            Self::Redirected(status) | Self::Http(status) => status.to_string(),
            Self::ResponseInvalid(reason) => (*reason).to_string(),
            Self::DiskSpace { needed, free } => format!("needed={needed} free={free}"),
            _ => String::new(),
        }
    }
}

impl fmt::Display for EmbedError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&coded(self.code(), self.detail()))
    }
}

/// Files, passages and characters a run intends to send; the start line states
/// them and the run refuses to send more.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct BuildPlan {
    pub files: usize,
    pub passages: usize,
    pub chars: usize,
}

/// A runner address that passed the loopback rule, with its model.
pub(crate) struct LocalRunner {
    endpoint: Endpoint,
    model: String,
    dimensions: Option<usize>,
    transport: Arc<dyn Transport>,
    timeouts: Timeouts,
    /// Set once `/api/show` showed no remote marker for this model.
    checked_local: OnceLock<()>,
}

/// Builds from different folders still send one batch at a time; a query does
/// not wait behind them.
static BATCH_IN_FLIGHT: Mutex<()> = Mutex::new(());

/// How often a batch waiting behind another looks at its stop.
const BATCH_TURN_POLL: Duration = Duration::from_millis(20);

/// The one batch in flight, or `Cancelled` once `stop` is set while waiting for it.
fn batch_turn(stop: Option<&AtomicBool>) -> Result<std::sync::MutexGuard<'static, ()>, EmbedError> {
    let Some(stop) = stop else {
        return Ok(BATCH_IN_FLIGHT
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()));
    };
    loop {
        if stop.load(Ordering::SeqCst) {
            return Err(EmbedError::Cancelled);
        }
        match BATCH_IN_FLIGHT.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(std::sync::TryLockError::Poisoned(poisoned)) => return Ok(poisoned.into_inner()),
            Err(std::sync::TryLockError::WouldBlock) => std::thread::sleep(BATCH_TURN_POLL),
        }
    }
}

impl LocalRunner {
    pub(crate) fn connect(base_url: &str, model: &str) -> Result<Self, EmbedError> {
        Self::connect_with(
            base_url,
            model,
            &loopback::system_resolve,
            Arc::new(CurlTransport),
            TIMEOUTS,
        )
    }

    fn connect_with(
        base_url: &str,
        model: &str,
        resolve: &Resolve,
        transport: Arc<dyn Transport>,
        timeouts: Timeouts,
    ) -> Result<Self, EmbedError> {
        let endpoint = loopback::local_endpoint(base_url, resolve)?;
        Ok(Self {
            endpoint,
            model: validate_model(model)?.to_string(),
            dimensions: None,
            transport,
            timeouts,
            checked_local: OnceLock::new(),
        })
    }

    /// For Matryoshka models; every vector must then have exactly this many values.
    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "no store asks a runner for fewer dimensions yet")
    )]
    pub(crate) fn with_dimensions(mut self, dimensions: usize) -> Self {
        self.dimensions = Some(dimensions);
        self
    }

    pub(crate) fn host(&self) -> &str {
        self.endpoint.host()
    }

    pub(crate) fn model(&self) -> &str {
        &self.model
    }

    /// Writes the run's start line; on failure nothing is sent.
    pub(crate) fn start_build(
        &self,
        vault_dir: &Path,
        plan: BuildPlan,
    ) -> Result<BuildRun<'_>, EmbedError> {
        self.ensure_local_model(None)?;
        let run = audit::write_start(vault_dir, self, plan)?;
        Ok(BuildRun {
            runner: self,
            vault_dir: vault_dir.to_path_buf(),
            run,
            plan,
            passages_sent: 0,
            chars_sent: 0,
            sent_hash: Sha256::new(),
            started: Instant::now(),
            closed: false,
        })
    }

    /// One `embed-query` line, then one request. The model check, the wait for the audit log and
    /// the request share one limit, `Timeouts::question` from the call, and end at it.
    pub(crate) fn embed_query(
        &self,
        vault_dir: &Path,
        question: &str,
    ) -> Result<Vec<f32>, EmbedError> {
        let deadline = Instant::now() + self.timeouts.question;
        check_passages(&[question])?;
        self.ensure_local_model(Some(deadline))?;
        let body = self.request_body(&[question]);
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return Err(EmbedError::TimedOut);
        }
        let wait = self.timeouts.query_line_wait.min(left);
        let reservation = audit::reserve_query(vault_dir, self, question, &body, wait)?;
        let started = Instant::now();
        let sent = self.send_embeddings(&body, 1, self.timeouts.query, None, Some(deadline));
        audit::finish_query(reservation, &sent, started)?;
        let mut vectors = sent?.vectors;
        vectors.pop().ok_or(EmbedError::ResponseInvalid("count"))
    }

    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "the setup dialog's runner check is not wired yet")
    )]
    pub(crate) fn version(&self) -> Result<String, EmbedError> {
        ollama::version(self)
    }

    /// Embedding models the runner holds, bge-m3 first.
    pub(crate) fn embedding_models(&self) -> Result<Vec<String>, EmbedError> {
        ollama::embedding_models(self)
    }

    /// Asks the runner to download an allow-listed model. It sends no folder
    /// content, and a `model-download` line opens and closes it.
    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "a runner model pull is not wired yet")
    )]
    pub(crate) fn pull(
        &self,
        vault_dir: &Path,
        model: &str,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&PullProgress),
    ) -> Result<(), EmbedError> {
        ollama::pull(self, vault_dir, model, cancel, on_progress)
    }

    /// The width of the model's vectors as `/api/show` states it (a
    /// `<family>.embedding_length` field), so a store can be made before any passage
    /// is sent; `None` when the runner does not say.
    pub(crate) fn reported_dimensions(&self) -> Result<Option<usize>, EmbedError> {
        let body = serde_json::json!({ "model": self.model }).to_string();
        let url = self.endpoint.api_url("show");
        let (status, text) = self.transport.send(&Request {
            url: &url,
            body: Some(&body),
            timeout: self.timeouts.probe,
            pin: self.endpoint.pin(),
            deadline: None,
        })?;
        match status {
            200..=299 => {}
            300..=399 => return Err(EmbedError::Redirected(status)),
            404 => return Err(EmbedError::ModelMissing),
            405 => return Ok(None),
            _ => return Err(EmbedError::Http(status)),
        }
        let shown: serde_json::Value =
            serde_json::from_str(&text).map_err(|_| EmbedError::ResponseInvalid("not-json"))?;
        let width = shown
            .get("model_info")
            .and_then(serde_json::Value::as_object)
            .and_then(|info| {
                info.iter()
                    .find(|(key, _)| key.ends_with(".embedding_length"))
                    .and_then(|(_, value)| value.as_u64())
            })
            .and_then(|width| usize::try_from(width).ok())
            .filter(|width| (1..=MAX_DIMENSIONS).contains(width));
        Ok(width)
    }

    /// Ollama forwards a cloud model's input to its own servers, so a model the
    /// runner marks as remote is refused before any passage is sent.
    fn ensure_local_model(&self, deadline: Option<Instant>) -> Result<(), EmbedError> {
        if self.checked_local.get().is_none() {
            ollama::refuse_remote_model(self, deadline)?;
            let _ = self.checked_local.set(());
        }
        Ok(())
    }

    fn request_body(&self, passages: &[&str]) -> String {
        let mut body = serde_json::json!({ "model": self.model, "input": passages });
        if let (Some(dimensions), Some(object)) = (self.dimensions, body.as_object_mut()) {
            object.insert("dimensions".into(), dimensions.into());
        }
        body.to_string()
    }

    /// The OpenAI-compatible route, so every runner the address field accepts
    /// answers the same way (decision 2026-08-01, "a door, not a vendor").
    fn send_embeddings(
        &self,
        body: &str,
        count: usize,
        timeout: &'static str,
        cancel: Option<&AtomicBool>,
        deadline: Option<Instant>,
    ) -> Result<Sent, EmbedError> {
        let url = self.endpoint.openai_url("embeddings");
        let request = Request {
            url: &url,
            body: Some(body),
            timeout,
            pin: self.endpoint.pin(),
            deadline,
        };
        let (status, text) = match cancel {
            Some(cancel) => self.transport.send_until(&request, cancel)?,
            None => self.transport.send(&request)?,
        };
        match status {
            200..=299 => {}
            300..=399 => return Err(EmbedError::Redirected(status)),
            404 => return Err(EmbedError::ModelMissing),
            _ => return Err(EmbedError::Http(status)),
        }
        let vectors = response::parse_embeddings(&text, count, self.dimensions)?;
        Ok(Sent {
            status,
            response_chars: text.chars().count(),
            vectors,
        })
    }

    fn get(&self, path: &str) -> Result<String, EmbedError> {
        let url = self.endpoint.api_url(path);
        let (status, text) = self.transport.send(&Request {
            url: &url,
            body: None,
            timeout: self.timeouts.probe,
            pin: self.endpoint.pin(),
            deadline: None,
        })?;
        match status {
            200..=299 => Ok(text),
            300..=399 => Err(EmbedError::Redirected(status)),
            _ => Err(EmbedError::Http(status)),
        }
    }
}

struct Sent {
    status: u16,
    response_chars: usize,
    vectors: Vec<Vec<f32>>,
}

/// One open run: batches go out one at a time and the closing line follows.
pub(crate) struct BuildRun<'r> {
    runner: &'r LocalRunner,
    vault_dir: PathBuf,
    run: String,
    plan: BuildPlan,
    passages_sent: usize,
    chars_sent: usize,
    sent_hash: Sha256,
    started: Instant,
    closed: bool,
}

impl BuildRun<'_> {
    /// Exactly one finite vector per passage, in order, or an error and nothing.
    pub(crate) fn embed_batch(&mut self, passages: &[&str]) -> Result<Vec<Vec<f32>>, EmbedError> {
        self.embed_batch_in(passages, None)
    }

    /// `embed_batch` that kills the request and answers `Cancelled` once `stop` is set, whether
    /// it waits behind another folder's batch or for the runner's answer.
    fn embed_batch_in(
        &mut self,
        passages: &[&str],
        stop: Option<&AtomicBool>,
    ) -> Result<Vec<Vec<f32>>, EmbedError> {
        let chars = check_passages(passages)?;
        if passages.len() > MAX_BATCH_PASSAGES
            || passages.iter().map(|p| p.len()).sum::<usize>() > MAX_BATCH_BYTES
        {
            return Err(EmbedError::BatchTooLarge);
        }
        if self.passages_sent + passages.len() > self.plan.passages
            || self.chars_sent + chars > self.plan.chars
        {
            return Err(EmbedError::OverPlan);
        }
        let body = self.runner.request_body(passages);
        let _one_in_flight = batch_turn(stop)?;
        // Counted before the answer: a timed-out batch may still have been read.
        self.passages_sent += passages.len();
        self.chars_sent += chars;
        self.sent_hash.update(body.as_bytes());
        let sent = self.runner.send_embeddings(
            &body,
            passages.len(),
            self.runner.timeouts.batch,
            stop,
            None,
        )?;
        Ok(sent.vectors)
    }

    #[cfg_attr(not(test), expect(dead_code, reason = "tests read what a run sent"))]
    pub(crate) fn passages_sent(&self) -> usize {
        self.passages_sent
    }

    /// Writes the closing line. Dropping a run without this closes it as stopped.
    pub(crate) fn finish(mut self, ended: RunEnd) -> Result<(), EmbedError> {
        self.close(ended)
    }

    fn close(&mut self, ended: RunEnd) -> Result<(), EmbedError> {
        self.closed = true;
        let hash = std::mem::take(&mut self.sent_hash).finalize();
        audit::write_close(
            &self.vault_dir,
            self.runner,
            &audit::Close {
                run: &self.run,
                plan: self.plan,
                passages_sent: self.passages_sent,
                chars_sent: self.chars_sent,
                sent_sha256: &crate::lower_hex::lower_hex(&hash),
                ended,
                duration_ms: self.started.elapsed().as_millis() as u64,
            },
        )
    }
}

impl Drop for BuildRun<'_> {
    fn drop(&mut self) {
        if !self.closed {
            if let Err(error) = self.close(RunEnd::Stopped) {
                // Drop cannot return it; the app log keeps the run that has no close.
                log::error!("embed-build run {} has no closing line: {error}", self.run);
            }
        }
    }
}

/// What the store asks of any source of vectors: the loopback runner or the
/// built-in model. Each source keeps its own audit duty. Every call blocks, so
/// none belongs on the UI thread.
pub(crate) trait Embedder {
    fn model(&self) -> &str;
    fn start_build<'a>(
        &'a self,
        vault_dir: &Path,
        plan: BuildPlan,
    ) -> Result<Box<dyn EmbedSession + 'a>, EmbedError>;
    fn embed_query(&self, vault_dir: &Path, question: &str) -> Result<Vec<f32>, EmbedError>;
}

pub(crate) trait EmbedSession {
    fn embed_batch(&mut self, passages: &[&str]) -> Result<Vec<Vec<f32>>, EmbedError>;
    /// `embed_batch` that returns `Cancelled` once `stop` is set; a source that cannot
    /// stop inside a batch checks it only before starting.
    fn embed_batch_until(
        &mut self,
        passages: &[&str],
        stop: &AtomicBool,
    ) -> Result<Vec<Vec<f32>>, EmbedError> {
        if stop.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(EmbedError::Cancelled);
        }
        self.embed_batch(passages)
    }
    fn finish(self: Box<Self>, ended: RunEnd) -> Result<(), EmbedError>;
}

impl Embedder for LocalRunner {
    fn model(&self) -> &str {
        LocalRunner::model(self)
    }

    fn start_build<'a>(
        &'a self,
        vault_dir: &Path,
        plan: BuildPlan,
    ) -> Result<Box<dyn EmbedSession + 'a>, EmbedError> {
        Ok(Box::new(LocalRunner::start_build(self, vault_dir, plan)?))
    }

    fn embed_query(&self, vault_dir: &Path, question: &str) -> Result<Vec<f32>, EmbedError> {
        LocalRunner::embed_query(self, vault_dir, question)
    }
}

impl EmbedSession for BuildRun<'_> {
    fn embed_batch(&mut self, passages: &[&str]) -> Result<Vec<Vec<f32>>, EmbedError> {
        BuildRun::embed_batch(self, passages)
    }

    fn embed_batch_until(
        &mut self,
        passages: &[&str],
        stop: &AtomicBool,
    ) -> Result<Vec<Vec<f32>>, EmbedError> {
        if stop.load(Ordering::SeqCst) {
            return Err(EmbedError::Cancelled);
        }
        self.embed_batch_in(passages, Some(stop))
    }

    fn finish(self: Box<Self>, ended: RunEnd) -> Result<(), EmbedError> {
        BuildRun::finish(*self, ended)
    }
}

/// The embedding models a runner at `base_url` lists, bge-m3 first. The address
/// passes the loopback rule before anything is asked, so nothing reaches another
/// computer.
pub(crate) fn runner_embedding_models(base_url: &str) -> Result<Vec<String>, EmbedError> {
    let listing_model = PULLABLE_MODELS[0];
    LocalRunner::connect(base_url, listing_model)?.embedding_models()
}

/// Splits passages into batches within both caps, in order.
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "the store splits its own batches; tests check the caps"
    )
)]
pub(crate) fn plan_batches(passages: &[&str]) -> Vec<std::ops::Range<usize>> {
    let mut batches = Vec::new();
    let mut start = 0;
    let mut bytes = 0;
    for (index, passage) in passages.iter().enumerate() {
        let full = index - start == MAX_BATCH_PASSAGES || bytes + passage.len() > MAX_BATCH_BYTES;
        if full && index > start {
            batches.push(start..index);
            start = index;
            bytes = 0;
        }
        bytes += passage.len();
    }
    if start < passages.len() {
        batches.push(start..passages.len());
    }
    batches
}

/// Returns the character count; refuses an empty batch or an over-long passage.
fn check_passages(passages: &[&str]) -> Result<usize, EmbedError> {
    if passages.is_empty() {
        return Err(EmbedError::BatchEmpty);
    }
    let mut chars = 0;
    for (index, passage) in passages.iter().enumerate() {
        let count = passage.chars().count();
        if count == 0 || count > MAX_PASSAGE_CHARS {
            return Err(EmbedError::PassageTooLong(index));
        }
        chars += count;
    }
    Ok(chars)
}

/// What `LocalRunner::connect` refuses before anything is sent: an address that is not this
/// computer (a name such as `localhost` is resolved, as connecting does), or a model name a runner
/// cannot hold or that names a remote model.
pub(crate) fn check_runner(base_url: &str, model: &str) -> Result<(), EmbedError> {
    loopback::local_endpoint(base_url, &loopback::system_resolve)?;
    validate_model(model)?;
    Ok(())
}

fn validate_model(model: &str) -> Result<&str, EmbedError> {
    let model = model.trim();
    if model.is_empty()
        || model.chars().count() > MAX_MODEL_CHARS
        || model
            .chars()
            .any(|ch| ch.is_whitespace() || ch.is_control())
    {
        return Err(EmbedError::ModelInvalid);
    }
    if ollama::is_cloud_name(model) {
        return Err(EmbedError::ModelRemote);
    }
    Ok(model)
}

#[cfg(test)]
mod tests;
