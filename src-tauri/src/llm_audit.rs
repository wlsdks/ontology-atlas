// LLM call audit log in the vault's `.ontology-atlas/llm-audit.jsonl`. Log before
// send: if `reserve()` cannot sync a line, the caller sends nothing. `finalize`
// rewrites only that tail line under a lock; response bodies are never recorded.
// Rust writes it because Rust sends, or a front-end bug could send without a record.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex, MutexGuard};

use crate::coded_error::coded;

mod log_file;
#[cfg(test)]
mod tests;

use log_file::{canonical_vault_dir, ensure_reservation_path, open_audit_file};

const SIDECAR_DIR: &str = ".ontology-atlas";
const AUDIT_FILE: &str = "llm-audit.jsonl";

/// What left the vault and how much; connection checks are all 0.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditScope {
    pub nodes: Vec<String>,
    pub prompt_chars: usize,
    pub vault_chars: usize,
}

/// Name and target only: arguments may carry vault text. Additive and absent on
/// connection-check lines, so lines already on disk keep their shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditToolRef {
    pub name: String,
    pub target: String,
}

/// Committed before transmission; this is the whole reservation line.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditDraft {
    pub v: u8,
    pub at: String,
    pub provider: String,
    /// Where vault content went. Additive so `v` stays 1: raising it would make lines
    /// already on user disks unreadable.
    pub host: String,
    pub model: Option<String>,
    /// Extensions add values without raising `v`.
    pub purpose: String,
    /// Only the user's own words; `null` for connection checks.
    pub question: Option<String>,
    pub scope: AuditScope,
    /// Absent on connection-check lines.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<AuditToolRef>>,
    /// Lets a person check the payload matches the preview.
    pub payload_sha256: String,
    /// Absent on every line but an embedding run's two lines.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embed: Option<AuditEmbedRun>,
    /// Absent on every line but a model download's two lines.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download: Option<AuditDownload>,
}

/// A model download sends a model name, never folder content; one line opens it
/// before the request and a second with the same `run` closes it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditDownload {
    pub run: String,
    /// `start` or `close`.
    pub phase: String,
    /// `ollama-pull` (the runner fetches from its own registry) or `hugging-face`.
    pub source: String,
    /// The pinned commit, or the largest layer digest Ollama reported.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes: Option<u64>,
    /// `complete`, `stopped` or `failed`; absent on the start line.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended: Option<String>,
    /// On the close line: every host the download asked, in order, the redirect hosts
    /// that served the bytes included. `host` stays the first one asked.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub hosts: Vec<String>,
}

/// An embedding run sends thousands of requests, so one line opens it before the
/// first and a second line with the same `run` closes it; `flock` cannot be held
/// for an hour.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEmbedRun {
    pub run: String,
    /// `start` or `close`.
    pub phase: String,
    pub files_planned: usize,
    pub passages_planned: usize,
    pub chars_planned: usize,
    pub passages_sent: usize,
    pub chars_sent: usize,
    /// `complete`, `stopped` or `failed`; absent on the start line.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditOutcome {
    /// Absent on reservation lines.
    pub outcome: String,
    pub http_status: Option<u16>,
    pub response_chars: usize,
    pub duration_ms: u64,
}

#[derive(Debug)]
pub struct AuditReservation {
    path: PathBuf,
    file: fs::File,
    offset: u64,
    reserved_line: Vec<u8>,
    draft: AuditDraft,
    /// Declared last: fields drop in order, so the `flock` closes before the path is
    /// handed to the next reservation.
    _claim: ReservedPath,
}

/// `flatten` keeps declaration order, which is the human reading order.
#[derive(Debug, Serialize)]
struct AuditLine<'a> {
    #[serde(flatten)]
    draft: &'a AuditDraft,
    #[serde(flatten)]
    outcome: &'a AuditOutcome,
}

pub fn audit_log_path(vault_dir: &Path) -> PathBuf {
    vault_dir.join(SIDECAR_DIR).join(AUDIT_FILE)
}

/// A connection check hashes the empty string: proof that 0 bytes were sent.
pub fn sha256_hex(payload: &str) -> String {
    crate::lower_hex::lower_hex(&Sha256::digest(payload.as_bytes()))
}

/// Same ISO-8601 shape as `activity.jsonl`.
pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Refuses a second in-process reservation before any syscall, because `flock`
/// cannot tell it from a child holding an inherited lock; `flock` then answers
/// only for another Atlas process.
static RESERVED_AUDIT_PATHS: LazyLock<Mutex<HashSet<PathBuf>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

fn reserved_audit_paths() -> MutexGuard<'static, HashSet<PathBuf>> {
    // Nothing guarded can panic, so a poisoned set is still correct.
    RESERVED_AUDIT_PATHS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Released by `Drop`, so every exit path hands the path back.
#[derive(Debug)]
struct ReservedPath {
    path: PathBuf,
}

impl ReservedPath {
    /// Two spellings of one vault are one audit log.
    fn claim(path: &Path) -> Result<Self, String> {
        if !reserved_audit_paths().insert(path.to_path_buf()) {
            return Err(coded("audit-log-busy", ""));
        }
        Ok(Self {
            path: path.to_path_buf(),
        })
    }
}

impl Drop for ReservedPath {
    fn drop(&mut self) {
        reserved_audit_paths().remove(&self.path);
    }
}

/// On failure the caller must send nothing.
/// Call only from `(async)` commands: the fsync and 13 ms lock budget must stay off the macOS main thread.
pub fn reserve(vault_dir: &Path, draft: AuditDraft) -> Result<AuditReservation, String> {
    // Claim first, so a second reservation is refused here rather than by `flock`.
    let canonical_vault = canonical_vault_dir(vault_dir)?;
    let claim = ReservedPath::claim(&audit_log_path(&canonical_vault))?;
    let (path, mut file) = open_audit_file(&canonical_vault)?;
    ensure_reservation_path(&path, &file)?;
    let mut reserved_line =
        serde_json::to_string(&draft).map_err(|err| coded("audit-log-write-failed", err))?;
    reserved_line.push('\n');
    let reserved_line = reserved_line.into_bytes();
    let offset = file
        .metadata()
        .map_err(|err| coded("audit-log-write-failed", err))?
        .len();
    file.write_all(&reserved_line)
        .map_err(|err| coded("audit-log-write-failed", err))?;
    // The sync keeps "recorded before sending" true across a crash.
    file.sync_all()
        .map_err(|err| coded("audit-log-write-failed", err))?;
    ensure_reservation_path(&path, &file)?;

    Ok(AuditReservation {
        path,
        file,
        offset,
        reserved_line,
        draft,
        _claim: claim,
    })
}

/// Rewrites only the reserved tail line; the lock and a tail-byte recheck keep
/// another writer's line from being truncated.
pub fn finalize(mut reservation: AuditReservation, outcome: &AuditOutcome) -> Result<(), String> {
    let line = serde_json::to_string(&AuditLine {
        draft: &reservation.draft,
        outcome,
    })
    .map_err(|err| coded("audit-log-write-failed", err))?;

    ensure_reservation_path(&reservation.path, &reservation.file)?;
    let expected_len = reservation.offset + reservation.reserved_line.len() as u64;
    let actual_len = reservation
        .file
        .metadata()
        .map_err(|err| coded("audit-log-tampered", err))?
        .len();
    if actual_len != expected_len {
        return Err(coded(
            "audit-log-tampered",
            "the file changed length after the line was reserved; \
             the existing records were kept",
        ));
    }
    reservation
        .file
        .seek(SeekFrom::Start(reservation.offset))
        .map_err(|err| coded("audit-log-tampered", err))?;
    let mut actual_reserved_line = vec![0; reservation.reserved_line.len()];
    reservation
        .file
        .read_exact(&mut actual_reserved_line)
        .map_err(|err| coded("audit-log-tampered", err))?;
    if actual_reserved_line != reservation.reserved_line {
        return Err(coded(
            "audit-log-tampered",
            "the reserved line changed; the existing records were kept",
        ));
    }
    reservation
        .file
        .set_len(reservation.offset)
        .map_err(|err| coded("audit-log-write-failed", err))?;
    reservation
        .file
        .seek(SeekFrom::End(0))
        .map_err(|err| coded("audit-log-write-failed", err))?;
    reservation
        .file
        .write_all(line.as_bytes())
        .and_then(|()| reservation.file.write_all(b"\n"))
        .map_err(|err| coded("audit-log-write-failed", err))?;
    reservation
        .file
        .sync_all()
        .map_err(|err| coded("audit-log-write-failed", err))?;
    Ok(())
}
