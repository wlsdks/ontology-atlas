//! The repository a vault is kept in, found the way every git tool needs it: the repository the
//! server was started for, the vault as a real path below its top, and why there is none when
//! there is none.

use std::path::PathBuf;

use confined_files::real_path;
use hardened_git::{GitReadError, GitRunError, RepoPath, Repository};
use serde::Serialize;
use source_scan::{place_folder, FolderPlacementError};

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

impl NoRepository {
    /// Why there is no repository, as the answers name it.
    pub fn reason(&self) -> &'static str {
        self.reason
    }
}

pub enum Located {
    Found(Box<VaultRepository>),
    Missing(NoRepository),
}

/// Looks for the repository of `context`'s repository root and places the vault below it. A
/// `git` that is not installed is its own reason, not "not a repository", so an agent is not told
/// to run `git init` on a machine that has no git. A `git` that is there and cannot start is an
/// error with the operating system's words.
pub fn locate(context: &CallContext<'_>, operation: &'static str) -> Result<Located, ToolError> {
    locate_from(context, operation, &context.config().repo_root)
}

/// [`locate`] for a repository root the call named, not the one the server was started for.
pub fn locate_from(
    context: &CallContext<'_>,
    operation: &'static str,
    repo_root: &std::path::Path,
) -> Result<Located, ToolError> {
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
    let facts = match Repository::at(repo_root).facts() {
        Ok(Some(facts)) => facts,
        Ok(None) => return missing("not-a-git-repository", repo_root, &config.vault_root),
        Err(GitReadError::Run(GitRunError::Spawn(cause)))
            if cause.kind() == std::io::ErrorKind::NotFound =>
        {
            return missing("git-not-available", repo_root, &config.vault_root)
        }
        Err(other) => return Err(ToolError::failed(other.to_string())),
    };
    let top_level = real_path(&facts.top_level).unwrap_or(facts.top_level);
    match place_folder(&top_level, &config.vault_root) {
        Ok(placed) => Ok(Located::Found(Box::new(VaultRepository {
            repository: Repository::at(&top_level),
            vault: placed.real,
            scope: placed.path,
            top_level,
            shallow: facts.shallow,
        }))),
        Err(FolderPlacementError::Outside { real }) => {
            missing("vault-outside-repository", &top_level, &real)
        }
        Err(not_askable @ FolderPlacementError::NotAskable { .. }) => {
            Err(ToolError::failed(not_askable.to_string()))
        }
    }
}
