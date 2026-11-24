//! The agent runtimes the app installs under its own prefix (a pinned Node and the allowlisted
//! CLIs), and the session launch's own npx adapter download, moved ahead of the session.

pub(crate) mod adapter;
pub(crate) mod cli;
pub(crate) mod node;
