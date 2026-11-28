//! Why a selector was refused or its row not returned: one word each, as an agent reads it.

use confined_files::RepositoryFileRefusal;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefusalReason {
    AbsolutePath,
    ControlCharacter,
    AmbiguousSeparator,
    AmbiguousCitationDelimiter,
    PathTraversal,
    SensitivePath,
    IgnoredPath,
    UnsupportedSourceType,
    NotFound,
    SymlinkPath,
    NonRegularFile,
    FileTooLarge,
    FileChanged,
    UnsafeRead,
    BinarySource,
    InvalidUtf8,
    HashMismatch,
    SymbolNotFound,
    RangeBeyondEof,
    LineTooLarge,
    AggregateTextBudget,
    ResponseBudget,
}

impl RefusalReason {
    pub fn word(self) -> &'static str {
        match self {
            Self::AbsolutePath => "absolute_path",
            Self::ControlCharacter => "control_character",
            Self::AmbiguousSeparator => "ambiguous_separator",
            Self::AmbiguousCitationDelimiter => "ambiguous_citation_delimiter",
            Self::PathTraversal => "path_traversal",
            Self::SensitivePath => "sensitive_path",
            Self::IgnoredPath => "ignored_path",
            Self::UnsupportedSourceType => "unsupported_source_type",
            Self::NotFound => "not_found",
            Self::SymlinkPath => "symlink_path",
            Self::NonRegularFile => "non_regular_file",
            Self::FileTooLarge => "file_too_large",
            Self::FileChanged => "file_changed",
            Self::UnsafeRead => "unsafe_read",
            Self::BinarySource => "binary_source",
            Self::InvalidUtf8 => "invalid_utf8",
            Self::HashMismatch => "hash_mismatch",
            Self::SymbolNotFound => "symbol_not_found",
            Self::RangeBeyondEof => "range_beyond_eof",
            Self::LineTooLarge => "line_too_large",
            Self::AggregateTextBudget => "aggregate_text_budget",
            Self::ResponseBudget => "response_budget",
        }
    }
}

impl From<RepositoryFileRefusal> for RefusalReason {
    fn from(refusal: RepositoryFileRefusal) -> Self {
        match refusal {
            RepositoryFileRefusal::NotFound => Self::NotFound,
            RepositoryFileRefusal::ThroughLink => Self::SymlinkPath,
            RepositoryFileRefusal::NotRegular => Self::NonRegularFile,
            RepositoryFileRefusal::TooLarge => Self::FileTooLarge,
            RepositoryFileRefusal::Changed => Self::FileChanged,
            RepositoryFileRefusal::Unreadable => Self::UnsafeRead,
        }
    }
}
