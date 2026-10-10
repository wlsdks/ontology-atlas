//! Finds which ACP agents exist on this machine and how to launch them. GUI apps
//! skip shell init files, so PATH is rebuilt from known locations, never by running
//! a login shell (it would execute the user's whole config). npx adapters are pinned.

pub(crate) mod agent_process;
pub(crate) mod bounded_command;
pub(crate) mod command_lookup;
mod credential_mirror;
pub(crate) mod detection;
pub(crate) mod isolation;
pub(crate) mod launch;
pub(crate) mod login_probe;
pub(crate) mod managed_cli;
pub(crate) mod npx_cache;
pub(crate) mod permission_verdict;
pub(crate) mod registry;
pub(crate) mod runtime_environment;
pub(crate) mod search_path;
#[cfg(test)]
mod test_support;
