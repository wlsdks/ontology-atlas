//! Finds which ACP agents exist on this machine and how to launch them. GUI apps
//! skip shell init files, so PATH is rebuilt from known locations, never by running
//! a login shell (it would execute the user's whole config). npx adapters are pinned.

pub(crate) mod bounded_command;
pub(crate) mod detection;
pub(crate) mod doctor;
pub(crate) mod install;
pub(crate) mod isolation;
pub(crate) mod launch;
pub(crate) mod registry;
pub(crate) mod runtime;
pub(crate) mod session;
#[cfg(test)]
mod test_support;
