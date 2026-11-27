//! Each cited file at a commit and in the working tree, as text, so the screen can ask
//! whether only comments, imports or whitespace changed since a concept's document was written.
//! The comparison itself runs in the shared JS normalizer the MCP server also uses
//! (`mcp/src/drift/comparable-code.mjs`); this side only reads, bounded and inside the repo.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::super::repo::require_repo_root;
use super::super::runner::{run_git_read_with_input, validate_vault_dir};
use super::safe_relative_path;

#[cfg(test)]
mod tests;

/// Pairs past this are not read and keep the date rule's answer
/// (`EVIDENCE_TEXT_PAIR_LIMIT`, `mcp/src/drift/evidence-verdict.mjs`).
const MAX_TEXT_PAIRS: usize = 256;
/// A larger file is never read: its pair stays moved.
const MAX_TEXT_BYTES: u64 = 1024 * 1024;
/// Committed bytes one call reads at most; the pairs after it stay moved.
const MAX_COMMITTED_BYTES: u64 = 32 * 1024 * 1024;
/// Git's own binary test: a NUL byte in the first 8000 bytes.
const BINARY_PROBE_BYTES: usize = 8000;

#[derive(Debug, Deserialize)]
pub struct EvidenceTextRequest {
    path: String,
    commit: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceTextPair {
    path: String,
    commit: String,
    /// The file at `commit`; `None` when absent, binary, not UTF-8, over 1 MiB or refused.
    before: Option<String>,
    /// The working-tree file, under the same conditions.
    after: Option<String>,
}

/// Reads each (commit, repository path) pair under the vault grant. A path that could
/// climb out of the repository, read as an option, or reach outside it through a link
/// is refused and answers `None` on both sides.
#[tauri::command(async)]
pub fn git_evidence_text_pairs(
    vault_path: String,
    pairs: Vec<EvidenceTextRequest>,
) -> Result<Vec<EvidenceTextPair>, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    Ok(read_text_pairs(&repo_root, &pairs))
}

fn read_text_pairs(repo_root: &Path, pairs: &[EvidenceTextRequest]) -> Vec<EvidenceTextPair> {
    let requests: Vec<(&EvidenceTextRequest, Option<String>)> = pairs
        .iter()
        .take(MAX_TEXT_PAIRS)
        .map(|pair| (pair, object_spec(pair)))
        .collect();
    let mut specs: Vec<String> = Vec::new();
    for (_, spec) in &requests {
        if let Some(spec) = spec {
            if !specs.contains(spec) {
                specs.push(spec.clone());
            }
        }
    }
    let committed = read_committed(repo_root, &specs);
    requests
        .into_iter()
        .map(|(pair, spec)| {
            let before = spec.as_ref().and_then(|spec| committed.get(spec).cloned());
            let after = spec
                .as_ref()
                .and_then(|_| safe_relative_path(&pair.path))
                .and_then(|clean| read_working(repo_root, &clean));
            EvidenceTextPair {
                path: pair.path.clone(),
                commit: pair.commit.clone(),
                before,
                after,
            }
        })
        .collect()
}

/// `<commit>:<path>` for `cat-file`, or `None` for a path or hash that is not plainly one.
fn object_spec(pair: &EvidenceTextRequest) -> Option<String> {
    let clean = safe_relative_path(&pair.path)?;
    if clean.contains('\n') || clean.contains('\r') {
        return None;
    }
    let commit = pair.commit.trim().to_ascii_lowercase();
    let hex = commit.chars().all(|c| c.is_ascii_hexdigit());
    if !hex || !(commit.len() == 40 || commit.len() == 64) {
        return None;
    }
    Some(format!("{commit}:{clean}"))
}

fn text_of(bytes: &[u8]) -> Option<String> {
    if bytes.len() as u64 > MAX_TEXT_BYTES {
        return None;
    }
    let probe = bytes.get(..BINARY_PROBE_BYTES).unwrap_or(bytes);
    if probe.contains(&0) {
        return None;
    }
    String::from_utf8(bytes.to_vec()).ok()
}

/// One `--batch-check` for sizes, then one `--batch` for the blobs small enough to read.
fn read_committed(repo_root: &Path, specs: &[String]) -> std::collections::HashMap<String, String> {
    let mut texts = std::collections::HashMap::new();
    if specs.is_empty() {
        return texts;
    }
    let request = format!("{}\n", specs.join("\n")).into_bytes();
    let Ok((true, checked)) =
        run_git_read_with_input(repo_root, &["cat-file", "--batch-check"], request)
    else {
        return texts;
    };
    let checked = String::from_utf8_lossy(&checked);
    let mut budget = MAX_COMMITTED_BYTES;
    let mut readable: Vec<&String> = Vec::new();
    for (spec, header) in specs.iter().zip(checked.lines()) {
        let Some(size) = blob_size(header) else {
            continue;
        };
        if size > MAX_TEXT_BYTES || size > budget {
            continue;
        }
        budget -= size;
        readable.push(spec);
    }
    if readable.is_empty() {
        return texts;
    }
    let request = format!(
        "{}\n",
        readable
            .iter()
            .map(|spec| spec.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    )
    .into_bytes();
    let Ok((true, out)) = run_git_read_with_input(repo_root, &["cat-file", "--batch"], request)
    else {
        return texts;
    };
    let mut offset = 0usize;
    for spec in readable {
        let Some(rest) = out.get(offset..) else {
            break;
        };
        let Some(header_len) = rest.iter().position(|byte| *byte == b'\n') else {
            break;
        };
        let header = String::from_utf8_lossy(rest.get(..header_len).unwrap_or_default());
        offset += header_len + 1;
        let Some(size) = blob_size(&header) else {
            if header.ends_with(" missing") {
                continue;
            }
            break;
        };
        let Ok(size) = usize::try_from(size) else {
            break;
        };
        let Some(content) = out.get(offset..offset.saturating_add(size)) else {
            break;
        };
        if let Some(text) = text_of(content) {
            texts.insert(spec.clone(), text);
        }
        offset += size;
        if out.get(offset) == Some(&b'\n') {
            offset += 1;
        }
    }
    texts
}

/// The size from a `<oid> blob <size>` header; `None` for any other answer.
fn blob_size(header: &str) -> Option<u64> {
    let mut parts = header.split(' ');
    let oid = parts.next()?;
    let kind = parts.next()?;
    let size = parts.next()?;
    if parts.next().is_some() || kind != "blob" || !oid.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    size.parse().ok()
}

/// The working-tree file, only when it resolves inside the repository.
fn read_working(repo_root: &Path, clean: &str) -> Option<String> {
    let root = fs::canonicalize(repo_root).ok()?;
    let real = fs::canonicalize(root.join(clean)).ok()?;
    if !real.starts_with(&root) || real == root {
        return None;
    }
    let metadata = fs::metadata(&real).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_TEXT_BYTES {
        return None;
    }
    text_of(&fs::read(&real).ok()?)
}
