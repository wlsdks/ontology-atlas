//! The rows a call of `sourceReads` answers with, one per selector, in the order asked.

use confined_files::{sha256_hex, FileStamp};

use crate::file_outline::OutlineDeclaration;
use crate::kept_files::is_settled;
use crate::opened_file::OpenedFile;
use crate::refusal_reason::RefusalReason;
use crate::selector::{ReadTarget, SourceReadSelector};

/// The lines to read next, in the call that reads them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NextRead {
    pub path: String,
    pub start_line: usize,
    pub max_lines: usize,
    pub expected_sha256: Option<String>,
}

/// A function the body calls that the repository declares, with where to read it next.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Callee {
    pub name: String,
    pub path: String,
    pub line: usize,
    /// One of several types' method a call through a field may reach.
    pub implementation: bool,
    /// Found by the name alone, because an import named no file here.
    pub by_name: bool,
}

/// Where a part of the context comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContextRole {
    Caller,
    Constructor,
    Owner,
    Callee,
    Implementation,
    Constant,
}

impl ContextRole {
    pub fn word(self) -> &'static str {
        match self {
            Self::Caller => "caller",
            Self::Constructor => "constructor",
            Self::Owner => "owner",
            Self::Callee => "callee",
            Self::Implementation => "implementation",
            Self::Constant => "constant",
        }
    }

    /// The order parts are listed in, and tied scores broken by.
    pub fn rank(self) -> usize {
        match self {
            Self::Caller => 0,
            Self::Constructor => 1,
            Self::Owner => 2,
            Self::Callee => 3,
            Self::Implementation => 4,
            Self::Constant => 5,
        }
    }
}

/// What a range of lines was when it was served: the hash of the text that was sent and the stamp
/// of the file it was read from. The session keeps it to tell later whether the lines still read
/// the same, asking the disk only when the stamp has moved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServedVersion {
    pub text_sha256: String,
    pub file_stamp: FileStamp,
    /// Whether the file was already older than the racy window when it was read: only then does a
    /// stamp that still matches prove the file was not written again.
    pub file_settled: bool,
}

impl ServedVersion {
    /// The version of `file` that `text`, some of its lines, was served from.
    pub fn of(text: &str, file: &OpenedFile) -> Self {
        Self {
            text_sha256: sha256_hex(text.as_bytes()),
            file_stamp: file.stamp,
            file_settled: is_settled(file.stamp),
        }
    }
}

/// One piece of code that decides what a symbol's body does, with its own cite.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextPart {
    pub role: ContextRole,
    pub path: String,
    pub symbol: String,
    pub start_line: usize,
    pub end_line: usize,
    pub cite: String,
    pub text: String,
    /// The callee this part was reached through.
    pub via: Option<String>,
    pub by_name: bool,
    pub next: Option<NextRead>,
    pub served: ServedVersion,
}

/// A part the budget left out, named so a later read can ask for it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OmittedPart {
    pub role: ContextRole,
    pub path: String,
    pub symbol: String,
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CallerSite {
    pub name: String,
    pub path: String,
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadRow {
    pub path: String,
    pub symbol: Option<String>,
    pub full_file_sha256: String,
    pub file_bytes: usize,
    pub file_lines: usize,
    pub requested_start_line: usize,
    pub requested_max_lines: usize,
    pub start_line: usize,
    pub end_line: usize,
    pub text: String,
    pub served: ServedVersion,
    pub cite: Option<String>,
    pub returned_bytes: usize,
    pub truncated: bool,
    pub request_complete: bool,
    pub file_complete: bool,
    pub citation: String,
    /// A symbol read's callees; `None` for a line range.
    pub callees: Option<Vec<Callee>>,
    pub context: Vec<ContextPart>,
    pub context_omitted: Vec<OmittedPart>,
    pub callers: Vec<CallerSite>,
    pub deciding: Option<String>,
    pub family: Option<String>,
    pub next: Option<NextRead>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutlineRow {
    pub path: String,
    pub sha256: String,
    pub file_bytes: usize,
    pub file_lines: usize,
    pub language: &'static str,
    pub declarations: Vec<OutlineDeclaration>,
    pub returned_bytes: usize,
    pub truncated: bool,
}

/// What the selector asked, kept on a row that did not answer it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AskedFor {
    pub path: String,
    pub outline: bool,
    pub symbol: Option<String>,
    /// `startLine` and `maxLines` of a line range.
    pub range: Option<(usize, usize)>,
}

impl AskedFor {
    pub fn of(selector: &SourceReadSelector) -> Self {
        Self {
            path: selector.path.clone(),
            outline: selector.target == ReadTarget::Outline,
            symbol: match &selector.target {
                ReadTarget::Symbol { symbol, .. } => Some(symbol.clone()),
                _ => None,
            },
            range: match selector.target {
                ReadTarget::Lines {
                    start_line,
                    max_lines,
                } => Some((start_line, max_lines)),
                _ => None,
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceRow {
    Read(Box<ReadRow>),
    Outlined(OutlineRow),
    /// The selector could not be answered: the path, the file or the request is refused.
    Refused {
        asked: AskedFor,
        reason: RefusalReason,
    },
    /// The row was answered but not sent, to keep the answer within its size.
    Omitted {
        asked: AskedFor,
        reason: RefusalReason,
    },
}

impl SourceRow {
    pub fn asked(&self) -> AskedFor {
        match self {
            Self::Read(row) => AskedFor {
                path: row.path.clone(),
                outline: false,
                symbol: row.symbol.clone(),
                range: row
                    .symbol
                    .is_none()
                    .then_some((row.requested_start_line, row.requested_max_lines)),
            },
            Self::Outlined(row) => AskedFor {
                path: row.path.clone(),
                outline: true,
                symbol: None,
                range: None,
            },
            Self::Refused { asked, .. } | Self::Omitted { asked, .. } => asked.clone(),
        }
    }
}

/// The rows of one call.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SourceEvidence {
    pub rows: Vec<SourceRow>,
    pub total_returned_bytes: usize,
}
