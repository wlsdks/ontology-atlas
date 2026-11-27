//! Each cited file at a commit and in the working tree, as text, so the screen can ask
//! whether only comments, imports or layout changed since a concept's document was written.
//! The comparison itself runs in the shared JS normalizer the MCP server also uses
//! (`mcp/src/drift/comparable-code.mjs`); this side only reads, bounded and inside the repo.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::super::repo::require_repo_root;
use super::super::runner::{run_git_read_with_input, validate_vault_dir};
use super::safe_relative_path;
use crate::code_reader::refusal::path_refusal;

#[cfg(test)]
mod tests;

/// Pairs one call answers; the screen asks again for the rest
/// (`EVIDENCE_TEXT_CHUNK`, `mcp/src/drift/evidence-verdict.mjs`).
const MAX_TEXT_PAIRS: usize = 256;
/// A larger file is never read: its pair stays moved.
const MAX_TEXT_BYTES: u64 = 1024 * 1024;
/// Bytes one call reads at most, committed and working sides together; the pairs after
/// it stay moved, as in the MCP server's reader.
const MAX_READ_BYTES: u64 = 32 * 1024 * 1024;
/// Git's own binary test: a NUL byte in the first 8000 bytes.
const BINARY_PROBE_BYTES: usize = 8000;
/// Names the MCP server's reader also refuses (`mcp/src/evidence-search/credential-names.mjs`).
const CREDENTIAL_STEMS: [&str; 9] = [
    "credential",
    "credentials",
    "secret",
    "secrets",
    "privatekey",
    "private-key",
    "private_key",
    "id_rsa",
    "id_ed25519",
];
const CREDENTIAL_EXTENSIONS: [&str; 6] = ["pem", "key", "p12", "pfx", "jks", "keystore"];

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
/// climb out of the repository, read as an option, reach outside it through a link, or
/// name a hidden or key-holding file, as asked or as its link resolves, is refused and
/// answers `None` on both sides.
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
    let requests: Vec<(&EvidenceTextRequest, Option<(String, String)>)> = pairs
        .iter()
        .take(MAX_TEXT_PAIRS)
        .map(|pair| (pair, object_spec(pair)))
        .collect();
    let mut specs: Vec<String> = Vec::new();
    for (_, request) in &requests {
        if let Some((spec, _)) = request {
            if !specs.contains(spec) {
                specs.push(spec.clone());
            }
        }
    }
    let mut budget = MAX_READ_BYTES;
    let committed = read_committed(repo_root, &specs, &mut budget);
    let root = fs::canonicalize(repo_root).ok();
    let mut working: HashMap<String, Option<String>> = HashMap::new();
    for (_, request) in &requests {
        if let (Some((_, clean)), Some(root)) = (request, root.as_ref()) {
            if !working.contains_key(clean) {
                let text = read_working(root, clean, &mut budget);
                working.insert(clean.clone(), text);
            }
        }
    }
    requests
        .into_iter()
        .map(|(pair, request)| {
            let before = request
                .as_ref()
                .and_then(|(spec, _)| committed.get(spec).cloned());
            let after = request
                .as_ref()
                .and_then(|(_, clean)| working.get(clean).cloned().flatten());
            EvidenceTextPair {
                path: pair.path.clone(),
                commit: pair.commit.clone(),
                before,
                after,
            }
        })
        .collect()
}

/// `(<commit>:<path>, <path>)` for `cat-file` and the working tree, or `None` for a path
/// or hash that is not plainly one, or a path either reader refuses by name.
fn object_spec(pair: &EvidenceTextRequest) -> Option<(String, String)> {
    let clean = safe_relative_path(&pair.path)?;
    if clean.contains('\n') || clean.contains('\r') || refused_name(&clean) {
        return None;
    }
    let commit = pair.commit.trim().to_ascii_lowercase();
    let hex = commit.chars().all(|c| c.is_ascii_hexdigit());
    if !hex || !(commit.len() == 40 || commit.len() == 64) {
        return None;
    }
    Some((format!("{commit}:{clean}"), clean))
}

/// The code reader's refusal, and the MCP server's hidden or credential name, for a `/` path.
fn refused_name(path: &str) -> bool {
    path_refusal(path).is_some() || path.split('/').any(hidden_or_credential_segment)
}

fn hidden_or_credential_segment(part: &str) -> bool {
    if part.starts_with('.') {
        return true;
    }
    let lower = part.to_ascii_lowercase();
    let (stem, extension) = match lower.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => (stem, Some(extension)),
        _ => (lower.as_str(), None),
    };
    CREDENTIAL_STEMS.contains(&stem)
        || extension.is_some_and(|extension| CREDENTIAL_EXTENSIONS.contains(&extension))
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
fn read_committed(repo_root: &Path, specs: &[String], budget: &mut u64) -> HashMap<String, String> {
    let mut texts = HashMap::new();
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
    let mut readable: Vec<&String> = Vec::new();
    for (spec, header) in specs.iter().zip(checked.lines()) {
        let Some(size) = blob_size(header) else {
            continue;
        };
        if size > MAX_TEXT_BYTES || size > *budget {
            continue;
        }
        *budget -= size;
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

/// The working-tree file, only when it resolves inside the repository to a name neither
/// reader refuses and fits what is left of the budget. At most one byte past the size
/// limit is read, however large the file has grown.
fn read_working(root: &Path, clean: &str, budget: &mut u64) -> Option<String> {
    let real = fs::canonicalize(root.join(clean)).ok()?;
    let inside = real.strip_prefix(root).ok()?;
    let mut parts = Vec::new();
    for component in inside.components() {
        parts.push(component.as_os_str().to_str()?);
    }
    if parts.is_empty() || refused_name(&parts.join("/")) {
        return None;
    }
    let file = fs::File::open(&real).ok()?;
    let metadata = file.metadata().ok()?;
    if !metadata.is_file() || metadata.len() > MAX_TEXT_BYTES || metadata.len() > *budget {
        return None;
    }
    let mut bytes = Vec::new();
    file.take(MAX_TEXT_BYTES + 1).read_to_end(&mut bytes).ok()?;
    let length = bytes.len() as u64;
    if length > *budget {
        return None;
    }
    *budget -= length;
    text_of(&bytes)
}
