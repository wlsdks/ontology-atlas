//! Why a record is not one the archive accepts, in the words an agent reads under `problems`.

use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error("{0}")]
pub struct RecordFault(pub String);

impl RecordFault {
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}
