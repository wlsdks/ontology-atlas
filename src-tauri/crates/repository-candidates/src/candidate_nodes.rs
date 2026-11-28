//! The nodes a repository's layout proposes, in the shape the analysis answer carries them.

use serde::Serialize;

/// Where a candidate was seen.
#[derive(Debug, Clone, Serialize)]
pub struct SourceEvidence {
    pub source: String,
}

impl SourceEvidence {
    pub fn of(source: impl Into<String>) -> Self {
        Self {
            source: source.into(),
        }
    }
}

/// A folder or file that may be an ability the repository offers.
#[derive(Debug, Clone, Serialize)]
pub struct CapabilityCandidate {
    pub slug: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    pub evidence: SourceEvidence,
}

/// A code role the repository's layout shows. The domain a name matched is only used while the
/// candidates are built; an element stays under the project until a reviewed relation says more.
#[derive(Debug, Clone, Serialize)]
pub struct ElementCandidate {
    pub slug: String,
    pub title: String,
    #[serde(skip)]
    pub domain: Option<String>,
    pub path: String,
    pub evidence: SourceEvidence,
}

impl ElementCandidate {
    pub fn new(
        slug: impl Into<String>,
        title: impl Into<String>,
        domain: Option<String>,
        path: impl Into<String>,
        evidence_source: impl Into<String>,
    ) -> Self {
        Self {
            slug: slug.into(),
            title: title.into(),
            domain,
            path: path.into(),
            evidence: SourceEvidence::of(evidence_source),
        }
    }

    /// An element whose path is also the place it was seen.
    pub fn at(
        slug: impl Into<String>,
        title: impl Into<String>,
        domain: Option<String>,
        path: &str,
    ) -> Self {
        Self::new(slug, title, domain, path, path)
    }
}

/// A relation between candidates the analysis proposes.
#[derive(Debug, Clone, Serialize)]
pub struct SuggestedRelation {
    pub from: String,
    pub to: String,
    #[serde(rename = "type")]
    pub relation_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub why: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uncertainty: Option<&'static str>,
}

impl SuggestedRelation {
    pub fn contains(from: impl Into<String>, to: impl Into<String>) -> Self {
        Self {
            from: from.into(),
            to: to.into(),
            relation_type: "contains",
            why: None,
            evidence: None,
            confidence: None,
            uncertainty: None,
        }
    }
}
