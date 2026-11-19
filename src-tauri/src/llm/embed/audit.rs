// The run's start line is synced before its first request and closed by a second
// line; a query reserves its line before sending and finalizes it after.

use super::super::local_endpoint::LOCAL_PROVIDER;
use super::{BuildPlan, EmbedError, LocalRunner, Sent};
use crate::llm_audit::{
    self, AuditDraft, AuditEmbedRun, AuditOutcome, AuditReservation, AuditScope,
};
use std::path::Path;
use std::time::Instant;

pub(super) const BUILD_PURPOSE: &str = "embed-build";
pub(super) const QUERY_PURPOSE: &str = "embed-query";

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

fn draft(
    runner: &LocalRunner,
    purpose: &str,
    question: Option<&str>,
    vault_chars: usize,
    payload_sha256: String,
    embed: Option<AuditEmbedRun>,
) -> AuditDraft {
    AuditDraft {
        v: 1,
        at: llm_audit::now_iso(),
        provider: LOCAL_PROVIDER.into(),
        host: runner.host().to_string(),
        model: Some(runner.model().to_string()),
        purpose: purpose.into(),
        question: question.map(str::to_string),
        scope: AuditScope {
            nodes: vec![],
            prompt_chars: question.map_or(0, |q| q.chars().count()),
            vault_chars,
        },
        tools: None,
        payload_sha256,
        embed,
    }
}

fn blocked(error: String) -> EmbedError {
    EmbedError::AuditBlocked(error)
}

/// Returns the run id the closing line repeats.
pub(super) fn write_start(
    vault_dir: &Path,
    runner: &LocalRunner,
    plan: BuildPlan,
) -> Result<String, EmbedError> {
    let run = uuid::Uuid::new_v4().to_string();
    let line = draft(
        runner,
        BUILD_PURPOSE,
        None,
        plan.chars,
        // Nothing has been sent when this line is written.
        llm_audit::sha256_hex(""),
        Some(AuditEmbedRun {
            run: run.clone(),
            phase: "start".into(),
            files_planned: plan.files,
            passages_planned: plan.passages,
            chars_planned: plan.chars,
            passages_sent: 0,
            chars_sent: 0,
            ended: None,
        }),
    );
    // Left without outcome fields: the outcome belongs to the closing line.
    llm_audit::reserve(vault_dir, line).map_err(blocked)?;
    Ok(run)
}

pub(super) fn write_close(
    vault_dir: &Path,
    runner: &LocalRunner,
    close: &Close<'_>,
) -> Result<(), EmbedError> {
    let line = draft(
        runner,
        BUILD_PURPOSE,
        None,
        close.chars_sent,
        close.sent_sha256.to_string(),
        Some(AuditEmbedRun {
            run: close.run.to_string(),
            phase: "close".into(),
            files_planned: close.plan.files,
            passages_planned: close.plan.passages,
            chars_planned: close.plan.chars,
            passages_sent: close.passages_sent,
            chars_sent: close.chars_sent,
            ended: Some(close.ended.label().into()),
        }),
    );
    let reservation = llm_audit::reserve(vault_dir, line).map_err(blocked)?;
    let outcome = match close.ended {
        RunEnd::Failed => "error",
        RunEnd::Complete | RunEnd::Stopped => "ok",
    };
    llm_audit::finalize(
        reservation,
        &AuditOutcome {
            outcome: outcome.into(),
            http_status: None,
            response_chars: 0,
            duration_ms: close.duration_ms,
        },
    )
    .map_err(blocked)
}

/// The line holds the question, as the agent's lines do.
pub(super) fn reserve_query(
    vault_dir: &Path,
    runner: &LocalRunner,
    question: &str,
    body: &str,
) -> Result<AuditReservation, EmbedError> {
    let line = draft(
        runner,
        QUERY_PURPOSE,
        Some(question),
        0,
        llm_audit::sha256_hex(body),
        None,
    );
    llm_audit::reserve(vault_dir, line).map_err(blocked)
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
