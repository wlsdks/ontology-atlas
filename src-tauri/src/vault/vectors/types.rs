//! What crosses to the WebView: the spec's command contract, camelCase, nothing else. A status
//! names files only by their vault-relative path and failures only by a code.

use crate::llm::embed::EmbedError;
use serde::{Deserialize, Serialize};

/// The person's choice for a folder; the WebView keeps it and sends it with every command.
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum VectorSource {
    Builtin,
    Runner { base_url: String, model: String },
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum VectorPhase {
    Off,
    NotSetUp,
    WaitingTurn,
    ModelDownloading,
    ModelConverting,
    Preparing,
    Stopped,
    Ready,
    Failed,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum VectorFailure {
    Download,
    ModelCheck,
    NeedsDirect,
    DiskShort,
    ModelGone,
    RunnerDown,
    ModelMissing,
    /// The model could not be converted, loaded or checked, could not start, stopped answering,
    /// or answered with vectors Atlas refused; also a job that failed inside (detail `internal`).
    ModelFailed,
    Write,
    AuditBlocked,
    Unreadable,
}

/// Where an embedding error happened decides which failure the person sees.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum During {
    /// Downloading the built-in model, and the space check before it.
    ModelPrepare,
    /// A worker converting the download or checking the converted model; the download is kept.
    ModelConvert,
    /// Preparing passages or answering a question, through the built-in model or a runner.
    Embedding { runner: bool },
}

pub(super) fn failure_of(error: &EmbedError, during: During) -> VectorFailure {
    use EmbedError as E;
    if let E::AuditBlocked(_) = error {
        return VectorFailure::AuditBlocked;
    }
    match during {
        During::ModelPrepare => match error {
            E::NoDirectConnection => VectorFailure::NeedsDirect,
            E::DiskSpace { .. } => VectorFailure::DiskShort,
            // The two ways a download fails to match the published file; each deletes it.
            E::HashMismatch(_) | E::SizeMismatch(_) => VectorFailure::ModelCheck,
            E::Store(_) => VectorFailure::Write,
            _ => VectorFailure::Download,
        },
        During::ModelConvert => match error {
            E::DiskSpace { .. } => VectorFailure::DiskShort,
            E::Store(_) => VectorFailure::Write,
            _ => VectorFailure::ModelFailed,
        },
        During::Embedding { runner } => match error {
            E::ModelNotReady => VectorFailure::ModelGone,
            E::ModelMissing => VectorFailure::ModelMissing,
            E::Request(_)
            | E::TimedOut
            | E::Http(_)
            | E::Redirected(_)
            | E::NotLocal
            | E::ResolvesElsewhere
            | E::Endpoint(_)
                if runner =>
            {
                VectorFailure::RunnerDown
            }
            _ => VectorFailure::ModelFailed,
        },
    }
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelBytes {
    pub done_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VectorStatus {
    pub phase: VectorPhase,
    /// Set with `failed`, and with `stopped` after a failure.
    pub failure: Option<VectorFailure>,
    /// A coded reason, never vault text.
    pub failure_detail: Option<String>,
    pub files_done: u64,
    pub files_total: u64,
    pub passages_done: u64,
    pub passages_total: u64,
    /// Preparing only files that changed after `ready`.
    pub updating: bool,
    /// Vault-relative, the file whose passages are being embedded.
    pub current_path: Option<String>,
    /// Over at least the last 30 s; `None` until measured.
    pub passages_per_second: Option<f64>,
    /// While `modelDownloading`.
    pub model: Option<ModelBytes>,
    pub vectors_bytes: u64,
}

impl VectorStatus {
    pub(super) fn of_phase(phase: VectorPhase) -> Self {
        Self {
            phase,
            failure: None,
            failure_detail: None,
            files_done: 0,
            files_total: 0,
            passages_done: 0,
            passages_total: 0,
            updating: false,
            current_path: None,
            passages_per_second: None,
            model: None,
            vectors_bytes: 0,
        }
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuiltinProbe {
    pub on_disk: bool,
    pub download_bytes: u64,
    pub kept_bytes: u64,
    pub needed_free_bytes: u64,
    pub free_bytes: u64,
    pub memory_bytes: u64,
    pub accelerated: bool,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum RunnerReach {
    Reachable,
    Unreachable,
    NotLocal,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunnerProbe {
    pub state: RunnerReach,
    pub address: String,
    pub models: Vec<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VectorProbe {
    pub files: u64,
    pub builtin: BuiltinProbe,
    pub runner: Option<RunnerProbe>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PassageHit {
    pub path: String,
    pub line_start: u32,
    pub line_end: u32,
    pub heading: String,
    pub score: f64,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum FoundState {
    Ok,
    NotReady,
    Failed,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VectorFound {
    pub state: FoundState,
    pub failure: Option<VectorFailure>,
    pub hits: Vec<PassageHit>,
    pub stale_dropped: u64,
    pub files_ready: u64,
    pub files_total: u64,
}

impl VectorFound {
    pub(super) fn empty(state: FoundState, failure: Option<VectorFailure>) -> Self {
        Self {
            state,
            failure,
            hits: Vec::new(),
            stale_dropped: 0,
            files_ready: 0,
            files_total: 0,
        }
    }
}

/// The event's payload: which folder, as the WebView named it, and its status.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(super) struct StatusEvent<'a> {
    pub root_path: &'a str,
    pub status: &'a VectorStatus,
}
