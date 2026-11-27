use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use super::base_line;
use crate::lower_hex::lower_hex;
use serde::Serialize;
use sha2::{Digest, Sha256};

use super::runner::{hardened_base_command, validate_vault_dir, with_diff_family_guard};
use crate::gray_area::scope::{resolve_binding_metadata, verify_identity};

pub(crate) mod prs;

#[cfg(test)]
mod tests;

const COMMIT_LIMIT: usize = 2_000;
const HISTORY_BYTES: usize = 8 * 1024 * 1024;
const PATH_LIMIT: usize = 20_000;
const PATCH_BYTES: usize = 32 * 1024;
const RECEIPT_LIMIT: usize = 32;
const RECEIPT_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BriefingCommit {
    hash: String,
    subject: String,
    message: String,
    message_complete: bool,
    committed_at: String,
    paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeBriefing {
    pub(super) status: String,
    source_root: String,
    snapshot: String,
    head: String,
    line: Option<String>,
    pub(super) base: Option<String>,
    tip: Option<String>,
    pub(super) commits: Vec<BriefingCommit>,
    net_paths: Option<Vec<String>>,
    limit: usize,
    partial_reasons: Vec<String>,
}
impl ChangeBriefing {
    fn unavailable(status: &str) -> Self {
        Self {
            status: status.into(),
            source_root: String::new(),
            snapshot: String::new(),
            head: String::new(),
            line: None,
            base: None,
            tip: None,
            commits: vec![],
            net_paths: None,
            limit: COMMIT_LIMIT,
            partial_reasons: vec![],
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeBriefingPatch {
    status: String,
    patch: String,
    truncated: bool,
}
impl ChangeBriefingPatch {
    fn unavailable(status: &str) -> Self {
        Self {
            status: status.into(),
            patch: String::new(),
            truncated: false,
        }
    }
}

#[derive(Clone)]
pub(super) struct Identity {
    scope: SourceScope,
    pub(super) root: PathBuf,
    pub(super) head: String,
    pub(super) line: Option<String>,
    pub(super) object: (u64, u64),
}

/// `line` names the branch for display; one commit read under two names is the same read.
impl PartialEq for Identity {
    fn eq(&self, other: &Self) -> bool {
        self.scope == other.scope
            && self.root == other.root
            && self.head == other.head
            && self.object == other.object
    }
}
impl Eq for Identity {}

#[derive(Clone, PartialEq, Eq)]
pub(super) enum SourceScope {
    Bound {
        vault: PathBuf,
        binding: String,
        source_id: String,
        vault_object: (u64, u64),
    },
    Picked,
}
pub(super) struct BoundedOutput {
    pub(super) bytes: Vec<u8>,
    pub(super) truncated: bool,
}

pub(super) fn read_bounded_git(
    root: &Path,
    args: &[&str],
    limit: usize,
) -> Result<BoundedOutput, String> {
    let mut command = hardened_base_command();
    command
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_ALLOW_PROTOCOL", "")
        .env("GIT_NO_REPLACE_OBJECTS", "1")
        .env("LC_ALL", "C")
        .args(with_diff_family_guard(args))
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command.spawn().map_err(|_| "unreadable")?;
    let stdout = child.stdout.take().ok_or("unreadable")?;
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout.take((limit + 1) as u64).read_to_end(&mut bytes);
        let _ = send.send(result.map(|_| bytes));
    });
    let received = receive.recv_timeout(Duration::from_secs(30));
    let mut bytes = match received {
        Ok(Ok(bytes)) => bytes,
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("unreadable".into());
        }
    };
    let truncated = bytes.len() > limit;
    if truncated {
        let _ = child.kill();
    }
    let status = child.wait().map_err(|_| "unreadable")?;
    if !truncated && !status.success() {
        return Err("unreadable".into());
    }
    bytes.truncate(limit);
    Ok(BoundedOutput { bytes, truncated })
}
pub(super) fn text_git(root: &Path, args: &[&str]) -> Result<String, String> {
    let out = read_bounded_git(root, args, 4096)?;
    if out.truncated {
        return Err("unreadable".into());
    }
    String::from_utf8(out.bytes)
        .map(|v| v.trim().into())
        .map_err(|_| "unreadable".into())
}
fn merged_line_tip(root: &Path) -> Result<(String, Option<String>), String> {
    base_line::merged_line_tip(&|args: &[&str]| text_git(root, args).ok())
        .ok_or_else(|| "no-history".into())
}
pub(super) fn identity(vault_path: &str, project: &str) -> Result<Identity, String> {
    let vault = validate_vault_dir(vault_path).map_err(|_| "unreadable")?;
    let binding = resolve_binding_metadata(&vault, project).map_err(|_| "no-source")?;
    crate::canonical_source_root(&binding.root.to_string_lossy()).map_err(|reason| {
        if reason == "source-root-not-granted" {
            "ungranted"
        } else {
            "unreadable"
        }
    })?;
    verify_identity(&binding).map_err(|_| "stale")?;
    if binding.kind != "git" {
        return Err("no-history".into());
    }
    let (head, line) = merged_line_tip(&binding.root)?;
    let metadata = fs::metadata(&binding.root).map_err(|_| "unreadable")?;
    let vault_metadata = fs::metadata(&vault).map_err(|_| "unreadable")?;
    #[cfg(unix)]
    let object = {
        use std::os::unix::fs::MetadataExt;
        (metadata.dev(), metadata.ino())
    };
    #[cfg(not(unix))]
    let object = {
        let _ = metadata;
        (0, 0)
    };
    #[cfg(unix)]
    let vault_object = {
        use std::os::unix::fs::MetadataExt;
        (vault_metadata.dev(), vault_metadata.ino())
    };
    #[cfg(not(unix))]
    let vault_object = {
        let _ = vault_metadata;
        (0, 0)
    };
    Ok(Identity {
        scope: SourceScope::Bound {
            vault,
            binding: binding.binding_digest,
            source_id: binding.source_id,
            vault_object,
        },
        root: binding.root,
        head,
        line,
        object,
    })
}
pub(super) fn picked_identity(source_path: &str) -> Result<Identity, String> {
    let root = crate::canonical_source_root(source_path).map_err(|reason| {
        if reason == "source-root-not-granted" {
            "ungranted"
        } else {
            "unreadable"
        }
    })?;
    let repository =
        text_git(&root, &["rev-parse", "--show-toplevel"]).map_err(|_| "no-history")?;
    if fs::canonicalize(repository).ok().as_ref() != Some(&root) {
        return Err("no-history".into());
    }
    let (head, line) = merged_line_tip(&root)?;
    let metadata = fs::metadata(&root).map_err(|_| "unreadable")?;
    #[cfg(unix)]
    let object = {
        use std::os::unix::fs::MetadataExt;
        (metadata.dev(), metadata.ino())
    };
    #[cfg(not(unix))]
    let object = {
        let _ = metadata;
        (0, 0)
    };
    Ok(Identity {
        scope: SourceScope::Picked,
        root,
        head,
        line,
        object,
    })
}

pub(crate) fn verify_source_snapshot(
    source_path: &str,
    head: &str,
    snapshot: &str,
) -> Result<(), String> {
    let (_, receipt) = source_snapshot(source_path, head, snapshot)?;
    if receipt.tip.is_none() {
        return Err("stale".into());
    }
    Ok(())
}

fn source_snapshot(
    source_path: &str,
    head: &str,
    snapshot: &str,
) -> Result<(Identity, Receipt), String> {
    let current = picked_identity(source_path)?;
    let receipt = snapshot_for_identity(&current, head, snapshot)?;
    Ok((current, receipt))
}

fn snapshot_for_identity(
    current: &Identity,
    head: &str,
    snapshot: &str,
) -> Result<Receipt, String> {
    let receipts = RECEIPTS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let receipt = receipts
        .iter()
        .rev()
        .find(|r| {
            r.snapshot == snapshot
                && r.identity.root == current.root
                && r.identity.object == current.object
                && r.identity.head == current.head
                && current.head == head
        })
        .cloned()
        .ok_or("stale")?;
    Ok(receipt)
}

pub(super) fn valid_hash(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn valid_path(value: &str) -> bool {
    !value.is_empty()
        && !value.contains('\0')
        && !value.contains('\\')
        && Path::new(value)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
}

#[derive(Clone)]
struct Receipt {
    identity: Identity,
    base: Option<String>,
    tip: Option<String>,
    start: i64,
    end: i64,
    paths: HashSet<[u8; 32]>,
    commits: Vec<BriefingCommit>,
    snapshot: String,
    bytes: usize,
}
static RECEIPTS: OnceLock<Mutex<Vec<Receipt>>> = OnceLock::new();
fn remember(identity: Identity, result: &ChangeBriefing, start: i64, end: i64) {
    let receipt = Receipt {
        identity,
        base: result.base.clone(),
        tip: result.tip.clone(),
        start,
        end,
        commits: result.commits.clone(),
        snapshot: result.snapshot.clone(),
        bytes: result
            .commits
            .iter()
            .map(|c| {
                c.message.len() + c.subject.len() + c.paths.iter().map(String::len).sum::<usize>()
            })
            .sum(),
        paths: result
            .commits
            .iter()
            .flat_map(|c| c.paths.iter())
            .chain(result.net_paths.iter().flatten())
            .map(|path| Sha256::digest(path.as_bytes()).into())
            .collect(),
    };
    let mut receipts = RECEIPTS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    while !receipts.is_empty()
        && (receipts.len() >= RECEIPT_LIMIT
            || receipts.iter().map(|r| r.bytes).sum::<usize>() + receipt.bytes > RECEIPT_BYTES)
    {
        receipts.remove(0);
    }
    if receipt.bytes <= RECEIPT_BYTES {
        receipts.push(receipt);
    }
}

struct ParsedCommit {
    commit: BriefingCommit,
    parent: Option<String>,
}
fn parse_nul_git_history(
    bytes: &[u8],
    truncated: bool,
    start: i64,
    end: i64,
) -> Result<(Vec<ParsedCommit>, Vec<String>), String> {
    let tokens: Vec<_> = bytes.split(|b| *b == 0).collect();
    let token = |at: usize| tokens.get(at).copied().ok_or("unreadable");
    let mut index = 0;
    let mut commits = Vec::new();
    let mut reasons = Vec::new();
    let mut path_count = 0;
    let mut candidates = 0;
    while index + 4 <= tokens.len() {
        let raw_hash = std::str::from_utf8(token(index)?)
            .map_err(|_| "unreadable")?
            .trim_start_matches('\n');
        if raw_hash.is_empty() {
            index += 1;
            continue;
        }
        if !valid_hash(raw_hash) {
            return Err("unreadable".into());
        }
        let parents = std::str::from_utf8(token(index + 1)?).map_err(|_| "unreadable")?;
        let epoch: i64 = std::str::from_utf8(token(index + 2)?)
            .map_err(|_| "unreadable")?
            .parse()
            .map_err(|_| "unreadable")?;
        let message_complete = std::str::from_utf8(token(index + 3)?).is_ok();
        if !message_complete && !reasons.iter().any(|r| r == "non-utf8-message") {
            reasons.push("non-utf8-message".into());
        }
        let message = String::from_utf8_lossy(token(index + 3)?).into_owned();
        let subject = message
            .lines()
            .next()
            .unwrap_or("")
            .chars()
            .take(256)
            .collect();
        index += 4;
        candidates += 1;
        let mut paths = Vec::new();
        let mut incomplete = false;
        while tokens
            .get(index)
            .is_some_and(|raw| raw.starts_with(b"\n:") || raw.starts_with(b":"))
        {
            if index + 1 >= tokens.len() || (index + 2 == tokens.len() && truncated) {
                incomplete = true;
                break;
            }
            let path = match std::str::from_utf8(token(index + 1)?) {
                Ok(value) => value,
                Err(_) => {
                    reasons.push("non-utf8-path".into());
                    index += 2;
                    continue;
                }
            };
            if path_count < PATH_LIMIT {
                paths.push(path.to_string());
                path_count += 1;
            } else if !reasons.iter().any(|r| r == "path-limit") {
                reasons.push("path-limit".into());
            }
            index += 2;
        }
        if incomplete || (truncated && index >= tokens.len() - 1) {
            break;
        }
        if epoch >= start && epoch < end {
            if commits.len() == COMMIT_LIMIT {
                reasons.push("commit-limit".into());
                break;
            }
            let committed_at = chrono::DateTime::from_timestamp(epoch, 0)
                .ok_or("unreadable")?
                .to_rfc3339();
            commits.push(ParsedCommit {
                commit: BriefingCommit {
                    hash: raw_hash.into(),
                    subject,
                    message,
                    message_complete,
                    committed_at,
                    paths,
                },
                parent: parents.split_whitespace().next().map(str::to_owned),
            });
        }
    }
    if candidates > COMMIT_LIMIT && !reasons.iter().any(|r| r == "commit-limit") {
        reasons.push("commit-limit".into());
    }
    if truncated {
        reasons.push("byte-limit".into());
    }
    Ok((commits, reasons))
}
fn net_paths(root: &Path, base: Option<&str>, tip: &str) -> Option<Vec<String>> {
    let empty = if base.is_none() {
        text_git(root, &["hash-object", "-t", "tree", "--stdin"]).ok()?
    } else {
        String::new()
    };
    let from = base.unwrap_or(&empty);
    let out = read_bounded_git(
        root,
        &["diff", "--name-only", "-z", "--no-renames", from, tip, "--"],
        HISTORY_BYTES,
    )
    .ok()?;
    if out.truncated {
        return None;
    }
    let mut paths = Vec::new();
    for bytes in out.bytes.split(|b| *b == 0).filter(|p| !p.is_empty()) {
        if paths.len() == PATH_LIMIT {
            return None;
        }
        paths.push(std::str::from_utf8(bytes).ok()?.to_string());
    }
    Some(paths)
}

#[tauri::command(async)]
pub fn git_change_briefing(
    vault_path: String,
    project_slug: String,
    start_epoch: i64,
    end_epoch: i64,
) -> Result<ChangeBriefing, String> {
    Ok(measure(
        &vault_path,
        &project_slug,
        start_epoch,
        end_epoch,
        || {},
    ))
}
fn measure(
    vault: &str,
    project: &str,
    start: i64,
    end: i64,
    after_read: impl FnOnce(),
) -> ChangeBriefing {
    measure_identity(|| identity(vault, project), start, end, after_read)
}

#[tauri::command(async)]
pub fn git_source_briefing(
    source_path: String,
    start_epoch: i64,
    end_epoch: i64,
) -> Result<ChangeBriefing, String> {
    Ok(measure_identity(
        || picked_identity(&source_path),
        start_epoch,
        end_epoch,
        || {},
    ))
}

fn measure_identity(
    resolve: impl Fn() -> Result<Identity, String>,
    start: i64,
    end: i64,
    after_read: impl FnOnce(),
) -> ChangeBriefing {
    if start >= end || start < -62_135_596_800 || end > 253_402_300_800 {
        return ChangeBriefing::unavailable("unreadable");
    }
    let before = match resolve() {
        Ok(value) => value,
        Err(status) => return ChangeBriefing::unavailable(&status),
    };
    let since = format!("--since-as-filter=@{}", start.saturating_sub(1));
    let until = format!("--until=@{}", end - 1);
    let max = format!("--max-count={}", COMMIT_LIMIT + 1);
    let out = match read_bounded_git(
        &before.root,
        &[
            "log",
            "--first-parent",
            "--diff-merges=first-parent",
            "--raw",
            "--no-abbrev",
            "--no-renames",
            "-z",
            "--format=%H%x00%P%x00%ct%x00%B",
            &since,
            &until,
            &max,
            &before.head,
            "--",
        ],
        HISTORY_BYTES,
    ) {
        Ok(value) => value,
        Err(_) => return ChangeBriefing::unavailable("unreadable"),
    };
    let (parsed, reasons) = match parse_nul_git_history(&out.bytes, out.truncated, start, end) {
        Ok(value) => value,
        Err(_) => return ChangeBriefing::unavailable("unreadable"),
    };
    let base = parsed.last().and_then(|c| c.parent.clone());
    let tip = parsed.first().map(|c| c.commit.hash.clone());
    let net = tip
        .as_ref()
        .and_then(|tip| net_paths(&before.root, base.as_deref(), tip));
    after_read();
    if resolve().ok().as_ref() != Some(&before) {
        return ChangeBriefing::unavailable("stale");
    }
    let snapshot = lower_hex(&Sha256::digest(format!(
        "{}\0{}\0{:?}\0{start}\0{end}",
        before.root.to_string_lossy(),
        before.head,
        before.object
    )));
    let result = ChangeBriefing {
        snapshot,
        status: if reasons.is_empty() {
            "measured"
        } else {
            "partial"
        }
        .into(),
        source_root: before.root.to_string_lossy().into_owned(),
        head: before.head.clone(),
        line: before.line.clone(),
        base,
        tip,
        commits: parsed.into_iter().map(|c| c.commit).collect(),
        net_paths: net,
        limit: COMMIT_LIMIT,
        partial_reasons: reasons,
    };
    remember(before, &result, start, end);
    result
}

#[tauri::command(async)]
pub fn git_change_release_span(
    vault_path: String,
    project_slug: String,
    snapshot: String,
    base: Option<String>,
    tip: String,
) -> Result<ChangeBriefing, String> {
    Ok(measure_span(
        || identity(&vault_path, &project_slug),
        &snapshot,
        base.as_deref(),
        &tip,
        || {},
    ))
}

#[tauri::command(async)]
pub fn git_source_release_span(
    source_path: String,
    snapshot: String,
    base: Option<String>,
    tip: String,
) -> Result<ChangeBriefing, String> {
    Ok(measure_span(
        || picked_identity(&source_path),
        &snapshot,
        base.as_deref(),
        &tip,
        || {},
    ))
}

/// The first-parent changes after `base` up to `tip`, both commits a release list issued; no
/// `base` reads from the first commit. Returns the date read's shape so the digest, Originals and
/// patches read it unchanged.
pub(super) fn measure_span(
    resolve: impl Fn() -> Result<Identity, String>,
    list_snapshot: &str,
    base: Option<&str>,
    tip: &str,
    after_read: impl FnOnce(),
) -> ChangeBriefing {
    if !valid_hash(tip) || base.is_some_and(|b| !valid_hash(b)) {
        return ChangeBriefing::unavailable("unreadable");
    }
    let before = match resolve() {
        Ok(value) => value,
        Err(status) => return ChangeBriefing::unavailable(&status),
    };
    if let Err(status) = super::releases::span_issued(&before, list_snapshot, base, tip) {
        return ChangeBriefing::unavailable(status);
    }
    let range = base.map(|base| format!("{base}..{tip}"));
    let max = format!("--max-count={}", COMMIT_LIMIT + 1);
    let out = match read_bounded_git(
        &before.root,
        &[
            "log",
            "--first-parent",
            "--diff-merges=first-parent",
            "--raw",
            "--no-abbrev",
            "--no-renames",
            "-z",
            "--format=%H%x00%P%x00%ct%x00%B",
            &max,
            range.as_deref().unwrap_or(tip),
            "--",
        ],
        HISTORY_BYTES,
    ) {
        Ok(value) => value,
        Err(_) => return ChangeBriefing::unavailable("unreadable"),
    };
    let (parsed, reasons) =
        match parse_nul_git_history(&out.bytes, out.truncated, i64::MIN, i64::MAX) {
            Ok(value) => value,
            Err(_) => return ChangeBriefing::unavailable("unreadable"),
        };
    let span_base = match parsed.last() {
        Some(oldest) => oldest.parent.clone(),
        None => base.map(str::to_owned),
    };
    let span_tip = parsed.first().map(|c| c.commit.hash.clone());
    let net = span_tip
        .as_ref()
        .and_then(|tip| net_paths(&before.root, span_base.as_deref(), tip));
    after_read();
    let after = resolve().ok();
    if after.as_ref() != Some(&before)
        || super::releases::span_issued(&before, list_snapshot, base, tip).is_err()
    {
        return ChangeBriefing::unavailable("stale");
    }
    let epochs: Vec<i64> = parsed
        .iter()
        .filter_map(|c| chrono::DateTime::parse_from_rfc3339(&c.commit.committed_at).ok())
        .map(|at| at.timestamp())
        .collect();
    let start = epochs.iter().copied().min().unwrap_or(0);
    let end = epochs.iter().copied().max().map_or(1, |newest| newest + 1);
    let snapshot = lower_hex(&Sha256::digest(format!(
        "{}\0{}\0{:?}\0{}\0{tip}",
        before.root.to_string_lossy(),
        before.head,
        before.object,
        base.unwrap_or("")
    )));
    let result = ChangeBriefing {
        snapshot,
        status: if reasons.is_empty() {
            "measured"
        } else {
            "partial"
        }
        .into(),
        source_root: before.root.to_string_lossy().into_owned(),
        head: before.head.clone(),
        line: before.line.clone(),
        base: span_base,
        tip: span_tip,
        commits: parsed.into_iter().map(|c| c.commit).collect(),
        net_paths: net,
        limit: COMMIT_LIMIT,
        partial_reasons: reasons,
    };
    remember(before, &result, start, end);
    result
}

#[tauri::command(async)]
pub fn git_change_briefing_patch(
    vault_path: String,
    project_slug: String,
    head: String,
    base: Option<String>,
    tip: String,
    path: String,
) -> Result<ChangeBriefingPatch, String> {
    Ok(read_patch(
        &vault_path,
        &project_slug,
        &head,
        base.as_deref(),
        &tip,
        &path,
        || {},
    ))
}
fn read_patch(
    vault: &str,
    project: &str,
    head: &str,
    base: Option<&str>,
    tip: &str,
    path: &str,
    after_read: impl FnOnce(),
) -> ChangeBriefingPatch {
    read_patch_identity(
        || identity(vault, project),
        head,
        base,
        tip,
        path,
        after_read,
    )
}

#[tauri::command(async)]
pub fn git_source_briefing_patch(
    source_path: String,
    head: String,
    base: Option<String>,
    tip: String,
    path: String,
) -> Result<ChangeBriefingPatch, String> {
    Ok(read_patch_identity(
        || picked_identity(&source_path),
        &head,
        base.as_deref(),
        &tip,
        &path,
        || {},
    ))
}

fn read_patch_identity(
    resolve: impl Fn() -> Result<Identity, String>,
    head: &str,
    base: Option<&str>,
    tip: &str,
    path: &str,
    after_read: impl FnOnce(),
) -> ChangeBriefingPatch {
    if !valid_hash(head)
        || !valid_hash(tip)
        || base.is_some_and(|b| !valid_hash(b))
        || !valid_path(path)
    {
        return ChangeBriefingPatch::unavailable("unavailable");
    }
    let before = match resolve() {
        Ok(value) => value,
        Err(_) => return ChangeBriefingPatch::unavailable("unavailable"),
    };
    if before.head != head {
        return ChangeBriefingPatch::unavailable("stale");
    }
    let path_digest: [u8; 32] = Sha256::digest(path.as_bytes()).into();
    let issued = RECEIPTS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .any(|r| {
            r.identity == before
                && r.base.as_deref() == base
                && r.tip.as_deref() == Some(tip)
                && r.paths.contains(&path_digest)
        });
    if !issued {
        return ChangeBriefingPatch::unavailable("unavailable");
    }
    let empty = if base.is_none() {
        match text_git(&before.root, &["hash-object", "-t", "tree", "--stdin"]) {
            Ok(value) => value,
            Err(_) => return ChangeBriefingPatch::unavailable("unavailable"),
        }
    } else {
        String::new()
    };
    let from = base.unwrap_or(&empty);
    let out = match read_bounded_git(
        &before.root,
        &[
            "diff",
            "--no-color",
            "--no-renames",
            "--no-relative",
            "--unified=3",
            from,
            tip,
            "--",
            path,
        ],
        PATCH_BYTES,
    ) {
        Ok(value) => value,
        Err(_) => return ChangeBriefingPatch::unavailable("unavailable"),
    };
    after_read();
    if resolve().ok().as_ref() != Some(&before) {
        return ChangeBriefingPatch::unavailable("stale");
    }
    let mut patch = String::from_utf8_lossy(&out.bytes).into_owned();
    let truncated = out.truncated || patch.len() > PATCH_BYTES;
    let mut end = patch.len().min(PATCH_BYTES);
    while !patch.is_char_boundary(end) {
        end -= 1;
    }
    patch.truncate(end);
    let binary = patch
        .lines()
        .any(|line| line.starts_with("Binary files ") && line.ends_with(" differ"));
    ChangeBriefingPatch {
        status: if binary { "binary" } else { "measured" }.into(),
        patch,
        truncated,
    }
}
