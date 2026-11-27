//! The faults in node identity that stop every graph command: a graph whose nodes cannot be told
//! apart by `uid` is worse than no graph, so compiling refuses, and the message names each fault
//! and the way out.

use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdentityFault {
    MissingUid { slug: String },
    InvalidUid { slug: String },
    DuplicateUid { slugs: Vec<String> },
    InvalidMergedUids { slug: String },
    InvalidMergedUid { slug: String },
    DuplicateMergedUid { slugs: Vec<String> },
    PrimaryMergedUidCollision { merged_slugs: Vec<String> },
}

impl IdentityFault {
    pub fn code(&self) -> &'static str {
        match self {
            Self::MissingUid { .. } => "missing-uid",
            Self::InvalidUid { .. } => "invalid-uid",
            Self::DuplicateUid { .. } => "duplicate-uid",
            Self::InvalidMergedUids { .. } => "invalid-merged-uids",
            Self::InvalidMergedUid { .. } => "invalid-merged-uid",
            Self::DuplicateMergedUid { .. } => "duplicate-merged-uid",
            Self::PrimaryMergedUidCollision { .. } => "primary-merged-uid-collision",
        }
    }

    /// The file or files the fault is in, as the message names them.
    fn where_text(&self) -> String {
        match self {
            Self::MissingUid { slug }
            | Self::InvalidUid { slug }
            | Self::InvalidMergedUids { slug }
            | Self::InvalidMergedUid { slug } => slug.clone(),
            Self::DuplicateUid { slugs }
            | Self::DuplicateMergedUid { slugs }
            | Self::PrimaryMergedUidCollision {
                merged_slugs: slugs,
            } => slugs.join(" + "),
        }
    }

    fn hint(&self) -> Option<&'static str> {
        match self {
            Self::MissingUid { .. } => Some(
                "Hand-written nodes have no `uid:` yet. Any write repairs it: patch_concept(slug, {...}) mints one, or add the line yourself: `uid:` must be a lowercase UUIDv4.",
            ),
            Self::InvalidUid { .. } => Some(
                "`uid:` must be a lowercase UUIDv4. Fix the value in the file, or let patch_concept rewrite it.",
            ),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error("{}", self.message())]
pub struct IdentityError {
    faults: Vec<IdentityFault>,
}

impl IdentityError {
    pub(crate) fn new(faults: Vec<IdentityFault>) -> Self {
        Self { faults }
    }

    pub fn faults(&self) -> &[IdentityFault] {
        &self.faults
    }

    fn message(&self) -> String {
        let mut hints: Vec<&str> = Vec::new();
        for hint in self.faults.iter().filter_map(IdentityFault::hint) {
            if !hints.contains(&hint) {
                hints.push(hint);
            }
        }
        let count = self.faults.len();
        let listed: Vec<String> = self
            .faults
            .iter()
            .map(|fault| format!("{} ({})", fault.code(), fault.where_text()))
            .collect();
        let mut message = format!(
            "Ontology compilation failed with {count} node identity error{}: {}",
            if count == 1 { "" } else { "s" },
            listed.join(", ")
        );
        if !hints.is_empty() {
            message.push_str("\n  \u{2192} ");
            message.push_str(&hints.join("\n  \u{2192} "));
        }
        message
    }
}
