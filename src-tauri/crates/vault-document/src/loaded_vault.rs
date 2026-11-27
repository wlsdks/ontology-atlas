//! Every Markdown file of a vault, read for one call: its slug, its document and the time it was
//! last changed. What an earlier call read of a file is kept in a [`DocumentCache`] only while the
//! file is as it was, so a file changed behind the server is seen by the next call, and nothing
//! kept can stand in for the file a write is about to replace.

use confined_files::{SlugError, VaultRoot};

use crate::document_cache::DocumentCache;
use crate::loaded_document::{FileReadError, LoadedDocument};

/// Every document of the vault, in slug path order (UTF-16).
#[derive(Debug, Default)]
pub struct LoadedVault {
    documents: Vec<LoadedDocument>,
}

impl LoadedVault {
    /// Reads every Markdown file the vault walk lists, through `cache`. A file that is gone by the
    /// time it is read is left out; one that is there and cannot be read fails the call.
    pub fn load(root: &VaultRoot, cache: &DocumentCache) -> Result<Self, FileReadError> {
        let files = root.markdown_files();
        Ok(Self {
            documents: cache.documents_of(root, &files)?,
        })
    }

    /// One document read from the file the slug names, listed or not: a note under a hidden
    /// folder is read when named, as a person naming it expects. `Ok(None)` when no regular file
    /// is there. It is read from the disk, never from a cache, and keeps its body.
    pub fn read_named(
        root: &VaultRoot,
        slug: &str,
    ) -> Result<Option<LoadedDocument>, NamedReadError> {
        let file = root.read_path(slug)?;
        // The slug of the file the name reaches, spelled as a walk spells it: a name typed in
        // another Unicode form, or with a `..` in it, still gives the one slug of that file.
        let spelled = root.slug_of(&file).unwrap_or_else(|| slug.to_string());
        match file.read_snapshot() {
            Ok(Some(snapshot)) => Ok(Some(LoadedDocument::of(&file, spelled, snapshot, true))),
            Ok(None) => Ok(None),
            Err(error) => Err(FileReadError::of(&spelled, error).into()),
        }
    }

    pub fn documents(&self) -> &[LoadedDocument] {
        &self.documents
    }

    pub fn len(&self) -> usize {
        self.documents.len()
    }

    pub fn is_empty(&self) -> bool {
        self.documents.is_empty()
    }
}

/// Why a named document could not be read.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum NamedReadError {
    #[error("{0}")]
    Slug(#[from] SlugError),
    #[error("{0}")]
    File(#[from] FileReadError),
}
