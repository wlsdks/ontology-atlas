//! The one table and runner for spawning the person's own `git` against a repository that may be
//! attacker-authored. An opened vault or a connected project source can carry a config that makes
//! `git` run code on `status`, `add` or `log`, so every invocation goes through this crate: it
//! neutralises what the repository's own config could execute before `git` honours it.
//!
//! The crate depends on neither `tauri` nor an async runtime, and it is the only crate besides
//! `confined-files` that may name `std::process`.

pub mod argv;
pub mod environment;
pub mod filter_overrides;
pub mod runner;

pub use argv::{hardened_git_argv, subcommand_of, with_diff_family_guard};
pub use environment::{git_env, git_env_from_process};
pub use filter_overrides::clear_filter_cache;
pub use runner::{run_git, GitInvocation, GitOutput, GitRunError};

/// Why a hardened command could not be built or run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HardeningError {
    /// The repository's config did not finish reading in time, so no `git` runs without its filter
    /// guard. An included named pipe never answers.
    ConfigReadUnfinished,
}

impl std::fmt::Display for HardeningError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ConfigReadUnfinished => formatter.write_str("git config read did not finish"),
        }
    }
}

impl std::error::Error for HardeningError {}
