use serde::Serialize;

use super::changes::get_porcelain_status;
use super::classify::{classified_error_string, classify_git_error, git_error_text};
use super::repo::{find_repo_root, get_current_branch, vault_pathspec};
use super::runner::{hardened_base_command, run_git, validate_vault_dir};
use crate::errors::coded;

#[cfg(test)]
mod tests;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInitResult {
    /// False with a reason if it was already a repository.
    initialized: bool,
    /// "already" or null (just started).
    reason: Option<String>,
    repo_root: String,
    /// Read via `git symbolic-ref`, which works before the first commit.
    branch: Option<String>,
    changed_count: usize,
}

/// Only on a direct user press. It only inits: no add, commit, push, remote or
/// user setup, and an existing repository is left alone (`reason: "already"`).
#[tauri::command(async)]
pub fn git_init(vault_path: String) -> Result<GitInitResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;

    // Inside a repo already: never create a nested one.
    if let Some(root) = find_repo_root(&vault_dir)? {
        let pathspec = vault_pathspec(&root, &vault_dir);
        let changed = get_porcelain_status(&root, &pathspec)?.len();
        return Ok(GitInitResult {
            initialized: false,
            reason: Some("already".into()),
            repo_root: root.to_string_lossy().into_owned(),
            branch: get_current_branch(&root),
            changed_count: changed,
        });
    }

    let out = run_git(&vault_dir, &["init"])?;
    if !out.success {
        let info = classify_git_error(&git_error_text(&out), "init");
        return Err(classified_error_string(&info));
    }

    // Re-read for the canonical path (symlinks, /var).
    let root = find_repo_root(&vault_dir)?.ok_or_else(|| coded("git-init-repo-missing", ""))?;
    let pathspec = vault_pathspec(&root, &vault_dir);
    let changed = get_porcelain_status(&root, &pathspec)?.len();

    Ok(GitInitResult {
        initialized: true,
        reason: None,
        repo_root: root.to_string_lossy().into_owned(),
        branch: get_current_branch(&root),
        changed_count: changed,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProbe {
    installed: bool,
    /// Shown to the user as is.
    version: Option<String>,
    /// Selects platform install guidance.
    platform: String,
}

fn host_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

/// Read-only detection so the UI can pick platform install guidance; it installs
/// nothing.
#[tauri::command(async)]
pub fn git_probe() -> GitProbe {
    let platform = host_platform().to_string();
    match hardened_base_command().arg("--version").output() {
        Ok(out) if out.status.success() => {
            let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
            GitProbe {
                installed: true,
                version: if version.is_empty() {
                    None
                } else {
                    Some(version)
                },
                platform,
            }
        }
        // A non-zero exit still ran, so git is installed.
        Ok(_) => GitProbe {
            installed: true,
            version: None,
            platform,
        },
        Err(_) => GitProbe {
            installed: false,
            version: None,
            platform,
        },
    }
}
