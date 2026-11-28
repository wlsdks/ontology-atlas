//! A vault file read for editing: its exact text, the time it had when read, and the document
//! parsed from that text. A plan is made from this and applied only while the file still holds it.

use confined_files::{ConfinedPath, ModifiedTime};
use vault_document::Document;

/// A file as it was when a write read it.
#[derive(Debug, Clone)]
pub struct SourceDocument {
    pub slug: String,
    pub raw: String,
    pub modified: Option<ModifiedTime>,
    pub document: Document,
}

/// Why a file could not be read for editing.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SourceRefusal {
    #[error("Doc not found: \"{0}\".")]
    Missing(String),
    #[error("\"{slug}\" could not be read: {cause}")]
    Unreadable { slug: String, cause: String },
    #[error("\"{0}\" is not valid UTF-8, so a write would replace bytes it cannot read. Fix the file's encoding first.")]
    NotText(String),
}

impl SourceDocument {
    pub fn read(file: &ConfinedPath, slug: &str) -> Result<Self, SourceRefusal> {
        let snapshot = match file.read_snapshot() {
            Ok(Some(snapshot)) => snapshot,
            Ok(None) => return Err(SourceRefusal::Missing(slug.to_string())),
            Err(error) => {
                return Err(SourceRefusal::Unreadable {
                    slug: slug.to_string(),
                    cause: error.to_string(),
                })
            }
        };
        let modified = Some(snapshot.stamp.modified_time());
        let document = Document::from_bytes(snapshot.bytes);
        if !document.is_exact() {
            return Err(SourceRefusal::NotText(slug.to_string()));
        }
        Ok(Self {
            slug: slug.to_string(),
            raw: document.raw().to_string(),
            modified,
            document,
        })
    }

    pub fn modified_ms(&self) -> Option<f64> {
        self.modified.map(ModifiedTime::milliseconds)
    }

    /// The body as readers see it (LF only).
    pub fn body(&self) -> String {
        self.document.body().into_owned()
    }
}
