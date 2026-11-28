//! One Markdown file as the reads see it: its slug, its frontmatter, what the vault finds wrong
//! with it alone, what its body links to, and the time of the version all of that was read from.
//!
//! The text of the file is not kept. What a read needs of a body besides its links it asks for with
//! [`LoadedDocument::body`], which reads the file again and refuses a file that is no longer the
//! version the rest was read from. A document that was named, not listed, keeps its body.

use std::borrow::Cow;
use std::sync::{Arc, Mutex, OnceLock};

use confined_files::{ConfinedPath, FileSnapshot, OsErrorCode, StableReadError};
use sha2::{Digest, Sha256};

use crate::body_links::BodyLinks;
use crate::body_signature::BodySignature;
use crate::document::{Document, RawShape};
use crate::frontmatter::{Diagnostic, Frontmatter, Value};
use crate::search_text::folded;
use crate::validation::{validate_document, Issue};

/// Why a file could not be read.
/// A needle longer than this is not remembered, so a query of thousands of words is not copied
/// into every document of a vault of fifty thousand.
const REMEMBERED_NEEDLE_MAX_BYTES: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum FileReadError {
    /// The file is there and cannot be read: a link that loops, a permission, a lock held by
    /// another program.
    #[error("Could not read the file of \"{slug}\": {reason}")]
    Unreadable { slug: String, reason: String },
    /// The file is not the version the rest of the call was read from.
    #[error(
        "\"{slug}\" changed on disk while this call was reading it. Call again to read it as it is now."
    )]
    Changed { slug: String },
}

impl FileReadError {
    pub(crate) fn of(slug: &str, error: StableReadError) -> Self {
        let reason = match error {
            StableReadError::Unstable => "the file kept changing while it was read".to_string(),
            StableReadError::Io(error) => {
                let code = OsErrorCode::of(&error);
                match (code.description(), code.name()) {
                    (Some(description), Some(name)) => format!("{description} ({name})"),
                    _ => error.kind().to_string(),
                }
            }
        };
        Self::Unreadable {
            slug: slug.to_string(),
            reason,
        }
    }
}

type Digest256 = [u8; 32];

fn digest_of(bytes: &[u8]) -> Digest256 {
    Sha256::digest(bytes).into()
}

/// One file of the vault as it was when read. Cheap to clone: the parts are shared.
#[derive(Debug, Clone)]
pub struct LoadedDocument {
    record: Arc<Record>,
}

#[derive(Debug)]
struct Record {
    slug: String,
    file: ConfinedPath,
    /// Milliseconds since the epoch, as Node's `stats.mtimeMs`.
    modified_ms: f64,
    shape: RawShape,
    frontmatter: Frontmatter,
    /// The lines of the frontmatter the reader could not honour, with their line numbers.
    diagnostics: Vec<Diagnostic>,
    /// What the file says wrong of itself, with the sentences.
    issues: Vec<Issue>,
    links: BodyLinks,
    /// Of the bytes everything above was read from; a body read again must match it.
    digest: Digest256,
    /// The body as readers see it, kept for a document that was named.
    body: Option<String>,
    /// What a text search may skip this body by, made by the first search that reads it.
    signature: OnceLock<BodySignature>,
    /// The last needle `body_includes` was asked, and its answer: a search repeated for a word most
    /// bodies hold reads no file. It is dropped with the record when the file changes.
    last_needle: Mutex<Option<(String, bool)>>,
}

impl LoadedDocument {
    /// Reads `snapshot`, the bytes of `file` that were read as `slug`. `keep_body` keeps the body.
    pub(crate) fn of(
        file: &ConfinedPath,
        slug: String,
        snapshot: FileSnapshot,
        keep_body: bool,
    ) -> Self {
        let digest = digest_of(&snapshot.bytes);
        let modified_ms = snapshot.stamp.modified_time().milliseconds();
        let document = Document::from_bytes(snapshot.bytes);
        let shape = document.shape();
        let issues = if shape == RawShape::Empty {
            Vec::new()
        } else {
            validate_document(&document, None)
        };
        let diagnostics = document.diagnostics().to_vec();
        let body = document.body();
        let links = BodyLinks::of(&body);
        let kept = keep_body.then(|| body.into_owned());
        Self {
            record: Arc::new(Record {
                slug,
                file: file.clone(),
                modified_ms,
                shape,
                frontmatter: document.into_frontmatter(),
                diagnostics,
                issues,
                links,
                digest,
                body: kept,
                signature: OnceLock::new(),
                last_needle: Mutex::new(None),
            }),
        }
    }

    /// Whether `bytes` are the ones this document was read from.
    pub(crate) fn was_read_from(&self, bytes: &[u8]) -> bool {
        digest_of(bytes) == self.record.digest
    }

    pub fn slug(&self) -> &str {
        &self.record.slug
    }

    /// The file this was read from.
    pub fn file(&self) -> &ConfinedPath {
        &self.record.file
    }

    pub fn frontmatter(&self) -> &Frontmatter {
        &self.record.frontmatter
    }

    /// Milliseconds since the epoch of the version read.
    pub fn modified_ms(&self) -> Option<f64> {
        Some(self.record.modified_ms)
    }

    pub fn shape(&self) -> RawShape {
        self.record.shape
    }

    /// What the file says wrong of itself: its fences, its keys, its body.
    pub fn issues(&self) -> &[Issue] {
        &self.record.issues
    }

    /// The frontmatter lines the reader could not honour, each with its line number.
    pub fn diagnostics(&self) -> &[Diagnostic] {
        &self.record.diagnostics
    }

    /// Whether both are the one read of one file: a cache that kept a file hands out the same read
    /// again, so a derived value built from these reads is current while every read is the same.
    pub fn is_same_read(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.record, &other.record)
    }

    /// Whether the body links to `needle` as a wiki link or a Markdown link to its file.
    pub fn links_to(&self, needle: &str) -> Result<bool, FileReadError> {
        if let Some(answer) = self.record.links.answer(needle) {
            return Ok(answer);
        }
        let body = self.body()?;
        Ok(crate::body_links::body_links_to(&body, needle))
    }

    /// The body as readers see it: LF line endings only. A body that was not kept is read from the
    /// file again, which must still be the version the rest was read from.
    pub fn body(&self) -> Result<Cow<'_, str>, FileReadError> {
        if let Some(body) = &self.record.body {
            return Ok(Cow::Borrowed(body));
        }
        let slug = self.slug();
        let snapshot = match self.record.file.read_snapshot() {
            Ok(Some(snapshot)) => snapshot,
            Ok(None) => {
                return Err(FileReadError::Changed {
                    slug: slug.to_string(),
                })
            }
            Err(error) => return Err(FileReadError::of(slug, error)),
        };
        if !self.was_read_from(&snapshot.bytes) {
            return Err(FileReadError::Changed {
                slug: slug.to_string(),
            });
        }
        Ok(Cow::Owned(
            Document::from_bytes(snapshot.bytes).body().into_owned(),
        ))
    }

    /// Whether the body, folded to lower case and one Unicode form, holds `folded_needle`. The first
    /// call reads the body and keeps a fingerprint of it, so a later search for text the body lacks
    /// opens no file.
    pub fn body_includes(&self, folded_needle: &str) -> Result<bool, FileReadError> {
        if let Some(answer) = self.remembered_answer(folded_needle) {
            return Ok(answer);
        }
        if let Some(signature) = self.record.signature.get() {
            if !signature.may_contain(folded_needle) {
                return Ok(false);
            }
        }
        let body = self.body()?;
        let folded_body = folded(&body);
        let signature = self
            .record
            .signature
            .get_or_init(|| BodySignature::of(&folded_body));
        let answer = signature.may_contain(folded_needle) && folded_body.contains(folded_needle);
        self.remember_answer(folded_needle, answer);
        Ok(answer)
    }

    fn remembered_answer(&self, folded_needle: &str) -> Option<bool> {
        let last = self.record.last_needle.lock().ok()?;
        last.as_ref()
            .filter(|(needle, _)| needle == folded_needle)
            .map(|(_, answer)| *answer)
    }

    fn remember_answer(&self, folded_needle: &str, answer: bool) {
        if folded_needle.len() > REMEMBERED_NEEDLE_MAX_BYTES {
            return;
        }
        if let Ok(mut last) = self.record.last_needle.lock() {
            *last = Some((folded_needle.to_string(), answer));
        }
    }

    /// `frontmatter.kind` when it is a non-blank text: what makes a document a node.
    pub fn node_kind(&self) -> Option<&str> {
        self.frontmatter()
            .text("kind")
            .filter(|kind| !answer_format::whitespace::trim(kind).is_empty())
    }

    /// What a row shows as the name: `title || name || slug`, each as JavaScript's `||` reads it.
    pub fn display_title(&self) -> DisplayTitle<'_> {
        let frontmatter = self.frontmatter();
        match frontmatter
            .truthy("title")
            .or_else(|| frontmatter.truthy("name"))
        {
            Some(value) => DisplayTitle::Value(value),
            None => DisplayTitle::Slug(self.slug()),
        }
    }
}

/// The name a row shows. A `title:` that holds a list or a number is shown as that, as the vault
/// holds it.
#[derive(Debug, Clone, Copy)]
pub enum DisplayTitle<'a> {
    Value(&'a Value),
    Slug(&'a str),
}

impl serde::Serialize for DisplayTitle<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Value(value) => value.serialize(serializer),
            Self::Slug(slug) => serializer.serialize_str(slug),
        }
    }
}
