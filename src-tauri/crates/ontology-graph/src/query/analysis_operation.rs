//! The two operations that read the vault's analysis records instead of its graph. The records are
//! files, so the tool layer answers them from the archive; the graph never sees them.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnalysisOperation {
    /// A page of the records, newest first.
    History,
    /// One record, whole.
    Record,
}

impl AnalysisOperation {
    pub const fn name(self) -> &'static str {
        match self {
            Self::History => "analysis_history",
            Self::Record => "analysis_record",
        }
    }
}
