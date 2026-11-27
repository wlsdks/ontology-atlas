//! Every Markdown file of a vault read once for one call: its slug, its document and the time it
//! was last changed. Nothing is kept between calls, so a file changed behind the server is seen by
//! the next one and no copy can stand in for the file a write is about to replace.

use confined_files::{ConfinedPath, OsErrorCode, SlugError, VaultRoot};

use crate::document::Document;
use crate::frontmatter::{Frontmatter, Value};
use crate::parallel_map::parallel_map;

/// One file of the vault as it was when read.
#[derive(Debug)]
pub struct LoadedDocument {
    slug: String,
    document: Document,
    /// Milliseconds since the epoch, as Node's `stats.mtimeMs`; `None` when the platform keeps none.
    modified_ms: Option<f64>,
}

impl LoadedDocument {
    pub fn slug(&self) -> &str {
        &self.slug
    }

    pub fn document(&self) -> &Document {
        &self.document
    }

    pub fn frontmatter(&self) -> &Frontmatter {
        self.document.frontmatter()
    }

    pub fn modified_ms(&self) -> Option<f64> {
        self.modified_ms
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
            None => DisplayTitle::Slug(&self.slug),
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

/// Every document of the vault, in slug path order (UTF-16).
#[derive(Debug, Default)]
pub struct LoadedVault {
    documents: Vec<LoadedDocument>,
}

impl LoadedVault {
    /// Reads every Markdown file the vault walk lists. A file that cannot be read is left out, as
    /// one deleted between the walk and the read is.
    pub fn load(root: &VaultRoot) -> Self {
        let files = root.markdown_files();
        let documents = parallel_map(&files, |file| load_file(root, file))
            .into_iter()
            .flatten()
            .collect();
        Self { documents }
    }

    /// One document read from the file the slug names, listed or not: a note under a hidden
    /// folder is read when named, as a person naming it expects. `Ok(None)` when no file is there.
    pub fn read_named(
        root: &VaultRoot,
        slug: &str,
    ) -> Result<Option<LoadedDocument>, NamedReadError> {
        let file = root.read_path(slug)?;
        // The slug of the file the name reaches, spelled as a walk spells it: a name typed in
        // another Unicode form, or with a `..` in it, still gives the one slug of that file.
        let spelled = root.slug_of(&file).unwrap_or_else(|| slug.to_string());
        match file.read_bytes() {
            Ok(bytes) => Ok(Some(document_of(&file, spelled, &bytes))),
            Err(error) => match OsErrorCode::of(&error) {
                OsErrorCode::NotFound => Ok(None),
                code => Err(NamedReadError::Unreadable {
                    slug: spelled,
                    reason: match (code.description(), code.name()) {
                        (Some(description), Some(name)) => format!("{description} ({name})"),
                        _ => error.kind().to_string(),
                    },
                }),
            },
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

    pub fn find(&self, slug: &str) -> Option<&LoadedDocument> {
        self.documents.iter().find(|document| document.slug == slug)
    }
}

fn load_file(root: &VaultRoot, file: &ConfinedPath) -> Option<LoadedDocument> {
    let slug = root.slug_of(file)?;
    let bytes = file.read_bytes().ok()?;
    Some(document_of(file, slug, &bytes))
}

fn document_of(file: &ConfinedPath, slug: String, bytes: &[u8]) -> LoadedDocument {
    LoadedDocument {
        slug,
        document: Document::from_bytes(bytes),
        modified_ms: file
            .modified_time()
            .map(confined_files::ModifiedTime::milliseconds),
    }
}

/// Why a named document could not be read.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum NamedReadError {
    #[error("{0}")]
    Slug(#[from] SlugError),
    /// The file is there and cannot be read: a link that loops, a permission, a folder in its
    /// place.
    #[error("Could not read the file of \"{slug}\": {reason}")]
    Unreadable { slug: String, reason: String },
}
