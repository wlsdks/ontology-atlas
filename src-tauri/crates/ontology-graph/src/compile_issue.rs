//! What compiling noticed about a vault without refusing it: an alias that names two nodes, a
//! frontmatter line that could not be read, a reference no node has. An identity fault does refuse
//! the compile; see [`crate::identity_error`].

use std::cmp::Ordering;

use answer_format::utf16;
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

/// How a reader should weigh an issue.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IssueSeverity {
    Error,
    Warning,
}

impl IssueSeverity {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Error => "error",
            Self::Warning => "warning",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompileIssue {
    /// An alias that is the slug, last segment or `slug:` of more than one node.
    AmbiguousAlias { alias: String, slugs: Vec<String> },
    /// A frontmatter line the reader could not honour; `line` is absent for a relation key that is
    /// not a list and that the reader did not name by line.
    MalformedFrontmatterLine {
        slug: String,
        line: Option<usize>,
        message: String,
    },
    /// A reference in a node's relation keys that no node has and that is not code.
    DanglingGraphReference {
        slug: String,
        via: &'static str,
        reference: String,
    },
}

impl CompileIssue {
    pub fn code(&self) -> &'static str {
        match self {
            Self::AmbiguousAlias { .. } => "ambiguous-alias",
            Self::MalformedFrontmatterLine { .. } => "malformed-frontmatter-line",
            Self::DanglingGraphReference { .. } => "dangling-graph-reference",
        }
    }

    pub fn severity(&self) -> IssueSeverity {
        match self {
            Self::AmbiguousAlias { .. } | Self::DanglingGraphReference { .. } => {
                IssueSeverity::Warning
            }
            Self::MalformedFrontmatterLine { .. } => IssueSeverity::Error,
        }
    }

    /// The node the issue is about, when it is about one.
    pub fn slug(&self) -> Option<&str> {
        match self {
            Self::AmbiguousAlias { .. } => None,
            Self::MalformedFrontmatterLine { slug, .. }
            | Self::DanglingGraphReference { slug, .. } => Some(slug),
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::AmbiguousAlias { alias, slugs } => format!(
                "Alias \"{alias}\" resolves to multiple nodes: {}",
                slugs.join(", ")
            ),
            Self::MalformedFrontmatterLine { message, .. } => message.clone(),
            Self::DanglingGraphReference {
                slug,
                via,
                reference,
            } => format!(
                "Graph reference \"{reference}\" from \"{slug}\" via \"{via}\" does not resolve to a vault node."
            ),
        }
    }

    /// Ambiguous aliases first, then errors, then warnings.
    fn priority(&self) -> u8 {
        match self {
            Self::AmbiguousAlias { .. } => 0,
            _ if self.severity() == IssueSeverity::Error => 1,
            _ => 2,
        }
    }

    fn location(&self) -> &str {
        match self {
            Self::AmbiguousAlias { alias, .. } => alias,
            Self::MalformedFrontmatterLine { slug, .. }
            | Self::DanglingGraphReference { slug, .. } => slug,
        }
    }

    fn line(&self) -> Option<usize> {
        match self {
            Self::MalformedFrontmatterLine { line, .. } => *line,
            _ => None,
        }
    }
}

impl Serialize for CompileIssue {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("code", self.code())?;
        map.serialize_entry("severity", self.severity().as_str())?;
        match self {
            Self::AmbiguousAlias { alias, slugs } => {
                map.serialize_entry("alias", alias)?;
                map.serialize_entry("slugs", slugs)?;
            }
            Self::MalformedFrontmatterLine { slug, line, .. } => {
                map.serialize_entry("slug", slug)?;
                if let Some(line) = line {
                    map.serialize_entry("line", line)?;
                }
            }
            Self::DanglingGraphReference {
                slug,
                via,
                reference,
            } => {
                map.serialize_entry("slug", slug)?;
                map.serialize_entry("via", via)?;
                map.serialize_entry("ref", reference)?;
            }
        }
        map.serialize_entry("message", &self.message())?;
        map.end()
    }
}

/// Puts issues in the order a reader meets them: by weight, then where, then which line, then the
/// text of the issue as it is written, all in UTF-16 code unit order so the order never depends on
/// the machine's locale.
pub fn sort_issues(issues: &mut [CompileIssue]) {
    issues.sort_by_cached_key(|issue| {
        let written = answer_format::json::to_string(issue).unwrap_or_default();
        SortKey {
            priority: issue.priority(),
            location: issue.location().to_string(),
            line: issue.line(),
            written,
        }
    });
}

#[derive(PartialEq, Eq)]
struct SortKey {
    priority: u8,
    location: String,
    line: Option<usize>,
    written: String,
}

impl Ord for SortKey {
    fn cmp(&self, other: &Self) -> Ordering {
        self.priority
            .cmp(&other.priority)
            .then_with(|| utf16::compare(&self.location, &other.location))
            // An issue with no line comes after every one that has a line.
            .then_with(|| match (self.line, other.line) {
                (Some(left), Some(right)) => left.cmp(&right),
                (Some(_), None) => Ordering::Less,
                (None, Some(_)) => Ordering::Greater,
                (None, None) => Ordering::Equal,
            })
            .then_with(|| utf16::compare(&self.written, &other.written))
    }
}

impl PartialOrd for SortKey {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
