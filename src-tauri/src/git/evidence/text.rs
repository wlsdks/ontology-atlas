//! Each cited file at a commit and in the working tree, as text, so the screen can ask
//! whether only comments, imports or layout changed since a concept's document was written.
//! Reading, bounds and name refusals are `source-scan`'s, which the MCP server also uses; the
//! comparison itself runs in the shared JS normalizer (`mcp/src/drift/comparable-code.mjs`).
//! This side adds the app's own refusal of names the code reader will not open.

use std::fs;
use std::path::{Path, PathBuf};

use confined_files::{DiskSource, ReadBudget, ScanRoots, MAX_EVIDENCE_TEXT_BYTES};
use hardened_git::RepoPath;
use serde::{Deserialize, Serialize};
use source_scan::{read_evidence_pairs, EvidenceFiles, EvidenceRequest};

use super::super::repo::require_repo_root;
use super::super::runner::{hardened_repository, validate_vault_dir};
use crate::code_reader::refusal::path_refusal;

#[cfg(test)]
mod tests;

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

/// The working tree as the app reads it: the shared reader inside the repository, and the code
/// reader's refusal of a name, as asked and as its link resolves.
struct AppEvidenceFiles {
    root: PathBuf,
    disk: Option<DiskSource>,
}

impl AppEvidenceFiles {
    fn new(repo_root: &Path) -> Self {
        let root = fs::canonicalize(repo_root).unwrap_or_else(|_| repo_root.to_path_buf());
        let disk = ScanRoots::new(root.clone(), root.clone())
            .ok()
            .and_then(|roots| roots.allow(&root, "repository").ok())
            .map(|source| DiskSource::new(&source, MAX_EVIDENCE_TEXT_BYTES));
        Self { root, disk }
    }
}

impl EvidenceFiles for AppEvidenceFiles {
    fn refuses(&self, path: &RepoPath) -> bool {
        path_refusal(path.as_str()).is_some()
    }

    fn working_text(&self, path: &RepoPath, budget: &mut ReadBudget) -> Option<String> {
        let real = fs::canonicalize(self.root.join(path.as_str())).ok()?;
        let resolved: Vec<&str> = real
            .strip_prefix(&self.root)
            .ok()?
            .components()
            .map(|part| part.as_os_str().to_str())
            .collect::<Option<_>>()?;
        if resolved.is_empty() || path_refusal(&resolved.join("/")).is_some() {
            return None;
        }
        self.disk
            .as_ref()?
            .read_evidence_text(Path::new(path.as_str()), budget)
    }
}

fn read_text_pairs(repo_root: &Path, pairs: &[EvidenceTextRequest]) -> Vec<EvidenceTextPair> {
    let requests: Vec<EvidenceRequest<'_>> = pairs
        .iter()
        .map(|pair| EvidenceRequest {
            path: &pair.path,
            commit: &pair.commit,
        })
        .collect();
    let readings = read_evidence_pairs(
        &hardened_repository(repo_root),
        &RepoPath::root(),
        &AppEvidenceFiles::new(repo_root),
        &requests,
    );
    pairs
        .iter()
        .zip(readings)
        .map(|(pair, reading)| EvidenceTextPair {
            path: pair.path.clone(),
            commit: pair.commit.clone(),
            before: reading.before,
            after: reading.after,
        })
        .collect()
}
