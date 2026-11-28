//! The caller's `expected_mtime` against the time a file has now: a stale write is a conflict.

use confined_files::{ConfinedPath, ModifiedTime, VaultConflict, WriteError};

use crate::error::ToolError;
use crate::write_checkpoint::failure_answer;

/// `expected` is the time the caller last saw; the file now has `current`.
pub fn require_current(
    slug: &str,
    expected: Option<f64>,
    current: Option<ModifiedTime>,
) -> Result<(), ToolError> {
    let Some(expected) = expected else {
        return Ok(());
    };
    let expected_time = ModifiedTime::from_milliseconds(expected);
    let differs = current.is_none_or(|current| expected_time.differs_from(current));
    if !differs {
        return Ok(());
    }
    Err(failure_answer(WriteError::Conflict(VaultConflict {
        slug: slug.to_string(),
        expected_modified: Some(expected_time),
        current_modified: current,
    })))
}

pub fn modified_ms(file: &ConfinedPath) -> Option<f64> {
    file.modified_time().map(ModifiedTime::milliseconds)
}
