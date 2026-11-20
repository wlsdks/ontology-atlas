// The run's start line is synced before its first request and closed by a second
// line; a query reserves its line before sending and finalizes it after; a model
// download opens and closes the same way. A line that finds the log held by
// another send waits for it, within a bound, instead of being lost.

use super::super::local_endpoint::LOCAL_PROVIDER;
use super::super::AUDIT_BLOCKED_PREFIX;
use super::{BuildPlan, EmbedError, LocalRunner, Sent};
use crate::llm_audit::{
    self, AuditDownload, AuditDraft, AuditEmbedRun, AuditOutcome, AuditReservation, AuditScope,
};
use std::path::Path;
use std::time::{Duration, Instant};

pub(super) const BUILD_PURPOSE: &str = "embed-build";
pub(super) const QUERY_PURPOSE: &str = "embed-query";
pub(super) const DOWNLOAD_PURPOSE: &str = "model-download";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RunEnd {
    Complete,
    Stopped,
    Failed,
}

impl RunEnd {
    fn label(self) -> &'static str {
        match self {
            Self::Complete => "complete",
            Self::Stopped => "stopped",
            Self::Failed => "failed",
        }
    }

    fn outcome(self) -> &'static str {
        match self {
            Self::Failed => "error",
            Self::Complete | Self::Stopped => "ok",
        }
    }
}

/// Who writes a line: the provider and the host the passages went to.
pub(super) trait Source {
    fn provider(&self) -> &str;
    fn host(&self) -> &str;
    fn model(&self) -> &str;
    fn line_wait(&self) -> Duration;
}

impl Source for LocalRunner {
    fn provider(&self) -> &str {
        LOCAL_PROVIDER
    }

    fn host(&self) -> &str {
        LocalRunner::host(self)
    }

    fn model(&self) -> &str {
        LocalRunner::model(self)
    }

    fn line_wait(&self) -> Duration {
        self.timeouts.line_wait
    }
}

pub(super) struct Close<'a> {
    pub run: &'a str,
    pub plan: BuildPlan,
    pub passages_sent: usize,
    pub chars_sent: usize,
    pub sent_sha256: &'a str,
    pub ended: RunEnd,
    pub duration_ms: u64,
}

/// What a download line states: never folder content.
pub(super) struct Download<'a> {
    pub run: &'a str,
    pub model: &'a str,
    /// `ollama-pull` or `hugging-face`.
    pub source: &'a str,
    pub revision: Option<String>,
    pub bytes: Option<u64>,
    pub ended: Option<RunEnd>,
    pub payload_sha256: String,
}

struct Line<'a> {
    purpose: &'a str,
    model: &'a str,
    question: Option<&'a str>,
    vault_chars: usize,
    payload_sha256: String,
    embed: Option<AuditEmbedRun>,
    download: Option<AuditDownload>,
}

fn draft(source: &dyn Source, line: &Line<'_>) -> AuditDraft {
    AuditDraft {
        v: 1,
        at: llm_audit::now_iso(),
        provider: source.provider().into(),
        host: source.host().to_string(),
        model: Some(line.model.to_string()),
        purpose: line.purpose.into(),
        question: line.question.map(str::to_string),
        scope: AuditScope {
            nodes: vec![],
            prompt_chars: line.question.map_or(0, |q| q.chars().count()),
            vault_chars: line.vault_chars,
        },
        tools: None,
        payload_sha256: line.payload_sha256.clone(),
        embed: line.embed.clone(),
        download: line.download.clone(),
    }
}

fn blocked(error: String) -> EmbedError {
    EmbedError::AuditBlocked(format!("{AUDIT_BLOCKED_PREFIX}{error}"))
}

/// Retries only while another send holds the log, with a growing pause, until
/// `wait` has passed; every other refusal returns at once.
fn reserve_waiting(
    vault_dir: &Path,
    wait: Duration,
    make: impl Fn() -> AuditDraft,
) -> Result<AuditReservation, EmbedError> {
    let deadline = Instant::now() + wait;
    let mut pause = Duration::from_millis(10);
    let busy = format!("{AUDIT_BLOCKED_PREFIX}audit-log-busy");
    loop {
        let error = match llm_audit::reserve(vault_dir, make()) {
            Ok(reservation) => return Ok(reservation),
            Err(error) => format!("{AUDIT_BLOCKED_PREFIX}{error}"),
        };
        if !error.starts_with(&busy) || Instant::now() >= deadline {
            return Err(EmbedError::AuditBlocked(error));
        }
        std::thread::sleep(pause.min(deadline.saturating_duration_since(Instant::now())));
        pause = (pause * 2).min(Duration::from_millis(250));
    }
}

fn write_closed(
    vault_dir: &Path,
    wait: Duration,
    make: impl Fn() -> AuditDraft,
    outcome: &AuditOutcome,
) -> Result<(), EmbedError> {
    let reservation = reserve_waiting(vault_dir, wait, make)?;
    llm_audit::finalize(reservation, outcome).map_err(blocked)
}

/// Returns the run id the closing line repeats.
pub(super) fn write_start(
    vault_dir: &Path,
    source: &dyn Source,
    plan: BuildPlan,
) -> Result<String, EmbedError> {
    let run = uuid::Uuid::new_v4().to_string();
    let line = Line {
        purpose: BUILD_PURPOSE,
        model: source.model(),
        question: None,
        vault_chars: plan.chars,
        // Nothing has been sent when this line is written.
        payload_sha256: llm_audit::sha256_hex(""),
        embed: Some(AuditEmbedRun {
            run: run.clone(),
            phase: "start".into(),
            files_planned: plan.files,
            passages_planned: plan.passages,
            chars_planned: plan.chars,
            passages_sent: 0,
            chars_sent: 0,
            ended: None,
        }),
        download: None,
    };
    // Left without outcome fields: the outcome belongs to the closing line.
    reserve_waiting(vault_dir, source.line_wait(), || draft(source, &line))?;
    Ok(run)
}

pub(super) fn write_close(
    vault_dir: &Path,
    source: &dyn Source,
    close: &Close<'_>,
) -> Result<(), EmbedError> {
    let line = Line {
        purpose: BUILD_PURPOSE,
        model: source.model(),
        question: None,
        vault_chars: close.chars_sent,
        payload_sha256: close.sent_sha256.to_string(),
        embed: Some(AuditEmbedRun {
            run: close.run.to_string(),
            phase: "close".into(),
            files_planned: close.plan.files,
            passages_planned: close.plan.passages,
            chars_planned: close.plan.chars,
            passages_sent: close.passages_sent,
            chars_sent: close.chars_sent,
            ended: Some(close.ended.label().into()),
        }),
        download: None,
    };
    write_closed(
        vault_dir,
        source.line_wait(),
        || draft(source, &line),
        &AuditOutcome {
            outcome: close.ended.outcome().into(),
            http_status: None,
            response_chars: 0,
            duration_ms: close.duration_ms,
        },
    )
}

/// The line holds the question, as the agent's lines do. Waits at most `wait` for a log another
/// send holds.
pub(super) fn reserve_query(
    vault_dir: &Path,
    source: &dyn Source,
    question: &str,
    payload: &str,
    wait: Duration,
) -> Result<AuditReservation, EmbedError> {
    let line = Line {
        purpose: QUERY_PURPOSE,
        model: source.model(),
        question: Some(question),
        vault_chars: 0,
        payload_sha256: llm_audit::sha256_hex(payload),
        embed: None,
        download: None,
    };
    reserve_waiting(vault_dir, wait, || draft(source, &line))
}

pub(super) fn finish_query(
    reservation: AuditReservation,
    sent: &Result<Sent, EmbedError>,
    started: Instant,
) -> Result<(), EmbedError> {
    let (outcome, http_status, response_chars) = match sent {
        Ok(sent) => ("ok", Some(sent.status), sent.response_chars),
        Err(EmbedError::Http(status) | EmbedError::Redirected(status)) => {
            ("error", Some(*status), 0)
        }
        Err(_) => ("error", None, 0),
    };
    finalize_query(reservation, outcome, http_status, response_chars, started)
}

/// Closes a reserved query line; a source with no HTTP exchange passes no status.
pub(super) fn finalize_query(
    reservation: AuditReservation,
    outcome: &str,
    http_status: Option<u16>,
    response_chars: usize,
    started: Instant,
) -> Result<(), EmbedError> {
    llm_audit::finalize(
        reservation,
        &AuditOutcome {
            outcome: outcome.into(),
            http_status,
            response_chars,
            duration_ms: started.elapsed().as_millis() as u64,
        },
    )
    .map_err(blocked)
}

fn download_line<'a>(download: &'a Download<'a>, hosts: &[String]) -> Line<'a> {
    Line {
        purpose: DOWNLOAD_PURPOSE,
        model: download.model,
        question: None,
        vault_chars: 0,
        payload_sha256: download.payload_sha256.clone(),
        embed: None,
        download: Some(AuditDownload {
            run: download.run.to_string(),
            phase: if download.ended.is_some() {
                "close"
            } else {
                "start"
            }
            .into(),
            source: download.source.to_string(),
            revision: download.revision.clone(),
            bytes: download.bytes,
            ended: download.ended.map(|ended| ended.label().to_string()),
            hosts: hosts.to_vec(),
        }),
    }
}

/// Before the download request; on failure nothing is requested.
pub(super) fn write_download_start(
    vault_dir: &Path,
    source: &dyn Source,
    download: &Download<'_>,
) -> Result<(), EmbedError> {
    let line = download_line(download, &[]);
    reserve_waiting(vault_dir, source.line_wait(), || draft(source, &line))?;
    Ok(())
}

pub(super) fn write_download_close(
    vault_dir: &Path,
    source: &dyn Source,
    download: &Download<'_>,
    duration_ms: u64,
) -> Result<(), EmbedError> {
    write_download_close_naming(vault_dir, source, download, duration_ms, &[])
}

/// The close line, naming every host the download asked.
pub(super) fn write_download_close_naming(
    vault_dir: &Path,
    source: &dyn Source,
    download: &Download<'_>,
    duration_ms: u64,
    hosts: &[String],
) -> Result<(), EmbedError> {
    let line = download_line(download, hosts);
    let outcome = download.ended.unwrap_or(RunEnd::Failed).outcome();
    write_closed(
        vault_dir,
        source.line_wait(),
        || draft(source, &line),
        &AuditOutcome {
            outcome: outcome.into(),
            http_status: None,
            response_chars: 0,
            duration_ms,
        },
    )
}
