//! The agent runtimes the app installs under its own prefix: a pinned Node and the allowlisted CLIs,
//! plus the pinned npx adapter it fetches into npx's own cache.

pub(crate) mod adapter;
pub(crate) mod cli;
pub(crate) mod node;
