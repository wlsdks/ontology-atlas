//! How much of the archive one `analysis_history` call may read. The folder, the byte limit of a
//! record and the name of a record file are `analysis-archive-format`'s.

/// The most record files one `analysis_history` call reads, and the most it may be asked for.
pub const HISTORY_LIMIT_MAX: usize = 100;

/// The page an `analysis_history` call reads when it names no limit.
pub const HISTORY_LIMIT_DEFAULT: usize = 30;
