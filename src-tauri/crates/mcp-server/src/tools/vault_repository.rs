//! The repository a vault is kept in, found the way every git tool needs it: the repository the
//! server was started for, the vault as a real path below its top, and why there is none when
//! there is none.

use std::path::PathBuf;

use hardened_git::{GitReadError, GitRunError, RepoPath, Repository};
use serde::Serialize;

use crate::dispatch::CallContext;
use crate::error::ToolError;

/// A vault inside a repository, as the git tools read it.
pub struct VaultRepository {
    /// Opened at the top of the working tree.
    pub repository: Repository,
    pub top_level: PathBuf,
    /// The vault's real path.
    pub vault: PathBuf,
    /// Where the vault lies below the top; `.` when the vault is the top.
    pub scope: RepoPath,
    pub shallow: bool,
}

/// Why a git tool has nothing to read, written as the answer it gives (`ok` is false).
#[derive(Debug, Serialize)]
pub struct NoRepository {
    operation: &'static str,
    ok: bool,
    reason: &'static str,
    #[serde(rename = "repoRoot")]
    repo_root: String,
    #[serde(rename = "vaultRoot")]
    vault_root: String,
}

pub enum Located {
    Found(Box<VaultRepository>),
    Missing(NoRepository),
}

/// Looks for the repository of `context`'s repository root and places the vault below it. A
/// `git` that cannot start is its own reason, not "not a repository", so an agent is not told to
/// run `git init` on a machine that has no git.
pub fn locate(context: &CallContext<'_>, operation: &'static str) -> Result<Located, ToolError> {
    let config = context.config();
    let missing =
        |reason: &'static str, repo_root: &std::path::Path, vault_root: &std::path::Path| {
            Ok(Located::Missing(NoRepository {
                operation,
                ok: false,
                reason,
                repo_root: repo_root.to_string_lossy().into_owned(),
                vault_root: vault_root.to_string_lossy().into_owned(),
            }))
        };
    let facts = match Repository::at(&config.repo_root).facts() {
        Ok(Some(facts)) => facts,
        Ok(None) => {
            return missing(
                "not-a-git-repository",
                &config.repo_root,
                &config.vault_root,
            )
        }
        Err(GitReadError::Run(GitRunError::Spawn(_))) => {
            return missing("git-not-available", &config.repo_root, &config.vault_root)
        }
        Err(other) => return Err(ToolError::failed(other.to_string())),
    };
    match RepoPath::of_folder(&facts.top_level, &config.vault_root) {
        Ok(placed) => Ok(Located::Found(Box::new(VaultRepository {
            repository: Repository::at(&facts.top_level),
            vault: placed.real,
            scope: placed.path,
            top_level: facts.top_level,
            shallow: facts.shallow,
        }))),
        Err(outside) => missing("vault-outside-repository", &facts.top_level, &outside.real),
    }
}
