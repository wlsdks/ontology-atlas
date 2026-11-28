//! Why a source that is a DOCX or an XLSX could not be cut into units: the file is not what its
//! extension says, or it asks for more than one read gives.

use crate::zip_archive::{ArchiveFault, UNPACK_BUDGET_BYTES};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum UnitsError {
    #[error("{0}")]
    Archive(#[from] ArchiveFault),
    #[error("the row `{anchor}` holds more than {UNPACK_BUDGET_BYTES} characters, the most one read unpacks")]
    RowPastBudget { anchor: String },
    #[error("the part `{part}` is missing from it")]
    MissingPart { part: &'static str },
}
