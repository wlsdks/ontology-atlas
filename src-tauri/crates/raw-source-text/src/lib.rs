//! The text of a raw vault source cut into the units a wiki citation names. See `README.md`.

mod citable_unit;
mod docx_units;
mod heading_slug;
mod markup_scan;
mod plain_units;
mod read_units;
mod source_format;
mod unit_window;
mod units_error;
mod xlsx_units;
mod zip_archive;

pub use citable_unit::{Unit, UnitKind, UnitPlace};
pub use read_units::{read_units, CitableUnits};
pub use source_format::SourceFormat;
pub use unit_window::{UnitWindow, DEFAULT_UNIT_LIMIT, MAX_UNIT_LIMIT, MAX_WINDOW_CHARS};
pub use units_error::UnitsError;
pub use zip_archive::{ArchiveFault, UNPACK_BUDGET_BYTES};
