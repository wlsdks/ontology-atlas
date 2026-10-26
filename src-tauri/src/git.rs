// Git writes stay vault-scoped; bound evidence reads require the recorded source
// binding and its source grant. Network operations run only on request.

pub(crate) mod briefing;
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
