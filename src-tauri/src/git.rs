// Native git commands for the vault, with the safety rules of `git-snapshot.mjs`
// (cli/ and mcp/ mirror): local commits only, push or pull only on request, no
// auto-init, no credentials, nothing outside the vault pathspec.

mod changes;
mod classify;
pub(crate) mod commits;
pub(crate) mod document;
pub(crate) mod evidence;
pub(crate) mod history;
pub(crate) mod remote;
mod repo;
mod runner;
pub(crate) mod setup;
pub(crate) mod snapshot;
pub(crate) mod status;
#[cfg(test)]
mod test_support;

pub(crate) use repo::find_repo_root;
pub(crate) use runner::{hardened_base_command, validate_vault_dir};
