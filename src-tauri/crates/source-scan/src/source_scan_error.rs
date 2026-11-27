//! Why a request to this crate was refused, as one type: the words an agent repairs its call from,
//! and the kind of failure it is. A caller picks the `errorCode` an agent branches on from
//! [`SourceScanError::code`], never from the words.

use hardened_git::GitReadError;
use thiserror::Error;

/// The kind of failure a refusal is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanErrorCode {
    /// A value the request holds is not what it must be.
    Invalid,
    /// Something the request names does not exist.
    NotFound,
    /// Any other failure.
    Failed,
}

#[derive(Debug, Error)]
pub enum SourceScanError {
    /// An argument or a profile key that is not what it must be.
    #[error("{0}")]
    Invalid(String),
    /// A cursor or a role that names nothing in the evidence the request reads.
    #[error("{0}")]
    NotFound(String),
    /// A combination of arguments no mode supports, a profile file that cannot be read, and the
    /// like: the script server reports each as a plain failure.
    #[error("{0}")]
    Failed(String),
    /// `git` ran and failed, or could not be read.
    #[error(transparent)]
    Git(#[from] GitReadError),
    /// The branch has no commit yet.
    #[error("The repository has no commit yet, so the state of its source cannot be stamped.")]
    NoCommit,
}

impl SourceScanError {
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::Invalid(message.into())
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(message.into())
    }

    pub fn failed(message: impl Into<String>) -> Self {
        Self::Failed(message.into())
    }

    pub fn code(&self) -> ScanErrorCode {
        match self {
            Self::Invalid(_) => ScanErrorCode::Invalid,
            Self::NotFound(_) => ScanErrorCode::NotFound,
            Self::Failed(_) | Self::Git(_) | Self::NoCommit => ScanErrorCode::Failed,
        }
    }
}
