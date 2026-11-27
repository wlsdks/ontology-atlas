//! The one table and runner for spawning the person's own `git` against a repository that may be
//! attacker-authored. An opened vault or a connected project source can carry a config that makes
//! `git` run code on `status`, `add` or `log`, so every invocation goes through this crate: it
//! neutralises what the repository's own config could execute before `git` honours it.
//!
//! The crate depends on neither `tauri` nor an async runtime, and it is the only crate besides
//! `confined-files` that may name `std::process`. A family crate reads a repository through
//! [`Repository`], whose methods take typed names ([`RepoPath`], [`CommitId`], [`BlobAt`]) and
//! always run through the hardening of [`run_git`], which stays public for a verb the typed reads
//! do not cover, such as the snapshot commit.

mod argv;
mod environment;
mod filter_overrides;
mod repository;
mod runner;

pub use argv::{hardened_git_argv, subcommand_of, with_diff_family_guard};
pub use environment::{git_env, git_env_from_process};
pub use filter_overrides::clear_filter_cache;
/// The config read with a time limit a test can shorten; only a test build has it.
#[cfg(feature = "test-hooks")]
pub use filter_overrides::discover_filter_overrides_with_limit;
pub use repository::{
    BlobAt, ChangeKind, CommitId, CommitSummary, GitReadError, OperationInProgress, RepoPath,
    Repository, StatusRow, UntrackedFiles,
};
pub use runner::{run_git, GitInvocation, GitOutput, GitRunError};

/// Why a hardened command could not be built or run.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum HardeningError {
    /// The repository's config did not finish reading in time, so no `git` runs without its filter
    /// guard. An included named pipe never answers.
    #[error("git config read did not finish")]
    ConfigReadUnfinished,
}
