pub(crate) mod access;
pub(crate) mod continuity;
pub(crate) mod local_construction;

use crate::git;
use crate::vault::scope::canonical_source_root;
use serde::Serialize;
use std::path::Path;

pub(crate) use project_source::source_digest;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectSourceInspection {
    root_path: String,
    source_id: String,
    kind: String,
    revision: String,
    fingerprint: String,
    dirty: Option<bool>,
    truncated: bool,
    files: Vec<String>,
}

pub(crate) fn run_source_git(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    // A connected project source is untrusted repo content; the base hardening
    // refuses an embedded bare repo and disables fsmonitor/hooks before git reads
    // the source's own config. These reads (ls-files/diff --name-only/status/
    // rev-parse) run no content filter, so name discovery is not needed here.
    let output = git::hardened_base_command()
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|err| format!("git source inspection failed: {err}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr)
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("unknown git error")
            .trim()
            .to_string();
        return Err(format!("git source inspection failed: {detail}"));
    }
    Ok(output.stdout)
}

/// `vault_root`, when given and inside the source, is left out of the probe. The probe is the
/// `project-source` crate's, the one the Rust MCP server measures a folder with, so a receipt either
/// side minted reads as current on the other.
#[tauri::command(async)]
pub(crate) fn inspect_project_source(
    root_path: String,
    vault_root: Option<String>,
) -> Result<ProjectSourceInspection, String> {
    let selected_root = canonical_source_root(&root_path)?;
    let probe = project_source::inspect_project_source(
        &selected_root,
        vault_root.as_deref().map(Path::new),
    )
    .map_err(|error| error.to_string())?;
    Ok(ProjectSourceInspection {
        root_path: probe.root_path,
        source_id: probe.source_id,
        kind: probe.kind.word().to_string(),
        revision: probe.revision,
        fingerprint: probe.fingerprint,
        dirty: probe.dirty,
        truncated: probe.truncated,
        files: probe.files,
    })
}

#[cfg(test)]
mod tests;
