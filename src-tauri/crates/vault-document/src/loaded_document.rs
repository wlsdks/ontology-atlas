//! One Markdown file as the reads see it: its slug, its frontmatter, what the vault finds wrong
//! with it alone, what its body links to, and the time of the version all of that was read from.
//!
//! The text of the file is not kept. What a read needs of a body besides its links it asks for with
//! [`LoadedDocument::body`], which reads the file again and refuses a file that is no longer the
//! version the rest was read from. A document that was named, not listed, keeps its body.

use std::borrow::Cow;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};

use confined_files::{ConfinedPath, FileSnapshot, OsErrorCode, StableReadError};
use sha2::{Digest, Sha256};

use crate::body_links::BodyLinks;
use crate::body_signature::BodySignature;
use crate::document::{Document, RawShape};
use crate::frontmatter::{Diagnostic, Frontmatter, Value};
use crate::search_needle::SearchNeedle;
use crate::search_text::folded;
use crate::validation::{validate_document, Issue};

/// Why a file could not be read.
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
    /// The body read by a document made with [`Self::remembering_its_body`], shared by its clones.
    /// It lives with that document, never with the record a cache keeps between calls.
    remembered_body: Option<Arc<OnceLock<String>>>,
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
    /// The same, judged with the slug the file sits at.
    issues_at_slug: Vec<Issue>,
    links: BodyLinks,
    /// Of the bytes everything above was read from; a body read again must match it.
    digest: Digest256,
    /// The body as readers see it, kept for a document that was named.
    body: Option<String>,
    /// What a text search may skip this body by, made by the first search that reads it.
    signature: OnceLock<BodySignature>,
    /// The memo number of the last needle `body_includes` was asked (`SearchNeedle`), shifted
    /// left by one, with the answer in the low bit; zero before any. A search repeated for a word
    /// most bodies hold reads no file. It is dropped with the record when the file changes.
    last_answer: AtomicU64,
}

/// What a body search took from the disk for one document: `None` when the body was kept.
pub(crate) type BodyRead = Option<Result<Option<FileSnapshot>, StableReadError>>;

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
        // Both judgements are made from these bytes, so a file changed after the read cannot make
        // the two disagree, and `validate_vault` reads no file again for them.
        let (issues, issues_at_slug) = if shape == RawShape::Empty {
            (Vec::new(), Vec::new())
        } else {
            (
                validate_document(&document, None),
                validate_document(&document, Some(&slug)),
            )
        };
        let diagnostics = document.diagnostics().to_vec();
        let body = document.body();
        let links = BodyLinks::of(&body);
        let kept = keep_body.then(|| body.into_owned());
        Self {
            remembered_body: None,
            record: Arc::new(Record {
                slug,
                file: file.clone(),
                modified_ms,
                shape,
                frontmatter: document.into_frontmatter(),
                diagnostics,
                issues,
                issues_at_slug,
                links,
                digest,
                body: kept,
                signature: OnceLock::new(),
                last_answer: AtomicU64::new(0),
            }),
        }
    }

    /// This document with `body` as its body, everything else as read. For a judgement made before
    /// the body is written; the file is not touched, and the result keeps no claim to be its bytes.
    #[must_use]
    pub fn with_body(&self, body: &str) -> Self {
        let record = &self.record;
        Self {
            remembered_body: None,
            record: Arc::new(Record {
                slug: record.slug.clone(),
                file: record.file.clone(),
                modified_ms: record.modified_ms,
                shape: record.shape,
                frontmatter: record.frontmatter.clone(),
                diagnostics: record.diagnostics.clone(),
                issues: record.issues.clone(),
                issues_at_slug: record.issues_at_slug.clone(),
                links: BodyLinks::of(body),
                digest: record.digest,
                body: Some(body.to_string()),
                signature: OnceLock::new(),
                last_answer: AtomicU64::new(0),
            }),
        }
    }

    /// This document for the length of one call: its first [`Self::body`] reads the file and the
    /// rest of the call is answered from that read, so a call that asks for every body in turn
    /// (the checks of `validate_vault` each do) reads each file once, not once per check. The text
    /// is held until the returned documents are dropped; the cache a document came from never
    /// holds it.
    #[must_use]
    pub fn remembering_its_body(&self) -> Self {
        Self {
            record: Arc::clone(&self.record),
            remembered_body: Some(Arc::new(OnceLock::new())),
        }
    }

    /// What the file says wrong of itself, judged with the slug it sits at: a finding's sentence
    /// names the node by that slug, and a node outside its kind folder is only known by it. It is
    /// judged when the file is read.
    pub fn issues_at_slug(&self) -> Vec<Issue> {
        self.record.issues_at_slug.clone()
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
        let Some(remembered) = self.remembered_body.as_deref() else {
            return self.body_from(self.read_body());
        };
        if let Some(text) = remembered.get() {
            return Ok(Cow::Borrowed(text));
        }
        let body = self.body_from(self.read_body())?;
        match body {
            Cow::Owned(text) => Ok(Cow::Borrowed(remembered.get_or_init(|| text))),
            kept @ Cow::Borrowed(_) => Ok(kept),
        }
    }

    /// The file read again for its body, or `None` when the body was kept: the part of
    /// [`Self::body`] that reaches the disk.
    pub(crate) fn read_body(&self) -> BodyRead {
        self.record
            .body
            .is_none()
            .then(|| self.record.file.read_snapshot())
    }

    /// The body from what [`Self::read_body`] took, refused when the file is no longer the version
    /// the rest was read from.
    pub(crate) fn body_from(&self, read: BodyRead) -> Result<Cow<'_, str>, FileReadError> {
        let Some(read) = read else {
            return Ok(Cow::Borrowed(
                self.record.body.as_deref().unwrap_or_default(),
            ));
        };
        let slug = self.slug();
        let changed = || FileReadError::Changed {
            slug: slug.to_string(),
        };
        let snapshot = match read {
            Ok(Some(snapshot)) => snapshot,
            Ok(None) => return Err(changed()),
            Err(error) => return Err(FileReadError::of(slug, error)),
        };
        if !self.was_read_from(&snapshot.bytes) {
            return Err(changed());
        }
        Ok(Cow::Owned(
            Document::from_bytes(snapshot.bytes).body().into_owned(),
        ))
    }

    /// Whether the body, folded to lower case and one Unicode form, holds `needle`, when that is
    /// known without reading it: from the memo of the last search, or from the fingerprint the
    /// first read left.
    pub(crate) fn known_body_answer(&self, needle: &SearchNeedle) -> Option<bool> {
        let last = self.record.last_answer.load(Ordering::Relaxed);
        if last >> 1 == needle.memo_number() {
            return Some(last & 1 == 1);
        }
        let signature = self.record.signature.get()?;
        (!signature.may_contain(needle)).then_some(false)
    }

    /// Whether the body holds `needle`, from what [`Self::read_body`] took: folds the body, leaves
    /// its fingerprint on the first read, and remembers the answer.
    pub(crate) fn body_includes_from(
        &self,
        read: BodyRead,
        needle: &SearchNeedle,
    ) -> Result<bool, FileReadError> {
        let body = self.body_from(read)?;
        let folded_body = folded(&body);
        let signature = self
            .record
            .signature
            .get_or_init(|| BodySignature::of(&folded_body));
        let answer = signature.may_contain(needle) && folded_body.contains(needle.text());
        self.record.last_answer.store(
            needle.memo_number() << 1 | u64::from(answer),
            Ordering::Relaxed,
        );
        Ok(answer)
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
