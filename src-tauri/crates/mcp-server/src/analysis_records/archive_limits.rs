//! Where the archive lives and how much of it one call may read.

/// The folder of the archive, directly below `.ontology-atlas`.
pub const ARCHIVE_FOLDER: &str = "analyses";

/// The most bytes one record file may hold; a larger file is refused unread.
pub const MAX_RECORD_BYTES: usize = 2_000_000;

/// The most record files one `analysis_history` call reads, and the most it may be asked for.
pub const HISTORY_LIMIT_MAX: usize = 100;

/// The page an `analysis_history` call reads when it names no limit.
pub const HISTORY_LIMIT_DEFAULT: usize = 30;
