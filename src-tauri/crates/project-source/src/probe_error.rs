//! Why a source could not be probed.

use std::io;

use hardened_git::GitRunError;

#[derive(Debug, thiserror::Error)]
pub enum ProbeError {
    /// `git` could not be run, or refused: the first line it printed says why.
    #[error("{0}")]
    Git(String),
    #[error("{0}")]
    Io(#[from] io::Error),
}

impl From<GitRunError> for ProbeError {
    fn from(error: GitRunError) -> Self {
        Self::Git(error.to_string())
    }
}
