//! What the reader noticed in frontmatter it could not honour.

use serde::Serialize;

/// Which kind of fault a diagnostic reports. A person fixes both in the file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum DiagnosticCode {
    #[serde(rename = "malformed-frontmatter-line")]
    MalformedFrontmatterLine,
    #[serde(rename = "malformed-quoted-scalar")]
    MalformedQuotedScalar,
}

impl DiagnosticCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::MalformedFrontmatterLine => "malformed-frontmatter-line",
            Self::MalformedQuotedScalar => "malformed-quoted-scalar",
        }
    }
}

/// A fault on one line of the file, counted from its first line: the opening `---` is line 1.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Diagnostic {
    pub code: DiagnosticCode,
    pub line: usize,
    pub message: String,
}

impl Diagnostic {
    pub(super) fn malformed_line(line: usize, message: String) -> Self {
        Self {
            code: DiagnosticCode::MalformedFrontmatterLine,
            line,
            message,
        }
    }

    pub(super) fn must_use_key_value(line: usize) -> Self {
        Self::malformed_line(
            line,
            format!("Frontmatter line {line} must use key: value syntax."),
        )
    }

    pub(super) fn list_item_without_key(line: usize) -> Self {
        Self::malformed_line(
            line,
            format!("Frontmatter list item on line {line} has no parent key."),
        )
    }

    pub(super) fn unsafe_key(line: usize, key: &str) -> Self {
        Self::malformed_line(
            line,
            format!("Frontmatter line {line} uses unsafe object key `{key}`."),
        )
    }

    pub(super) fn relation_not_a_list(line: usize, key: &str) -> Self {
        Self::malformed_line(
            line,
            format!("Frontmatter line {line} graph relation `{key}:` must be an array."),
        )
    }
}
