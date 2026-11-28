//! The vault as a write reads it: every document as the session's cache holds it, and the names
//! that mean a document. A write reads this once before it plans, and again for each row of a
//! batch, since the row before it may have added a file.

use confined_files::VaultRoot;
use vault_document::{suggest_similar_slugs, LoadedDocument, LoadedVault, SlugLookup};
use vault_edit::NameResolver;

use crate::error::{MissingNodeDetails, ToolError};
use crate::tools::get_concepts::raw_source_issue;
use crate::write_checkpoint::Permit;

const SIMILAR_SLUGS_SHOWN: usize = 3;

pub struct VaultView<'p> {
    root: &'p VaultRoot,
    loaded: LoadedVault,
}

impl<'p> VaultView<'p> {
    pub fn read(permit: &'p Permit<'_>) -> Result<Self, ToolError> {
        let loaded = LoadedVault::load(permit.vault(), permit.context().documents())
            .map_err(|error| ToolError::failed(error.to_string()))?;
        Ok(Self {
            root: permit.vault(),
            loaded,
        })
    }

    pub fn root(&self) -> &VaultRoot {
        self.root
    }

    pub fn documents(&self) -> &[LoadedDocument] {
        self.loaded.documents()
    }

    pub fn document(&self, slug: &str) -> Option<&LoadedDocument> {
        self.documents()
            .iter()
            .find(|document| document.slug() == slug)
    }

    /// The slug `name` means: exact, the disk's spelling, a declared `slug:` or a last segment. A
    /// name that means two documents is refused rather than guessed.
    pub fn resolve(&self, name: &str) -> Result<Option<String>, ToolError> {
        SlugLookup::new(self.documents())
            .resolve(self.root, name)
            .map_err(|ambiguous| ToolError::failed(ambiguous.to_string()))
    }

    /// A resolver for the references a node already holds: it never refuses, so a reference that
    /// is ambiguous matches nothing.
    pub fn references(&self) -> ReferenceNames<'_> {
        ReferenceNames {
            lookup: SlugLookup::new(self.documents()),
            root: self.root,
        }
    }

    /// The disk's spelling of an existing slug.
    pub fn disk_slug(&self, slug: &str) -> Option<String> {
        self.root.canonical_disk_slug(slug)
    }

    /// `prefix: "slug". Use list_concepts()...`, with the fields that point to the next call.
    pub fn not_found(&self, subject: &'static str, slug: &str, offers_creating: bool) -> ToolError {
        if let Some(raw_source) = self.root.raw_source_slug_at(slug) {
            return ToolError::invalid(raw_source_issue(&raw_source));
        }
        let similar = suggest_similar_slugs(self.documents(), slug, SIMILAR_SLUGS_SHOWN);
        let mut message = format!(
            "{subject}: \"{slug}\". Use list_concepts() to see all slugs, or list_concepts({{mentions:\"{slug}\"}}) to search by title."
        );
        if offers_creating {
            message.push_str(" If the endpoint is real but absent, create it first with add_concepts({concepts:[{slug, kind, title}]}).");
        }
        if !similar.is_empty() {
            let quoted: Vec<String> = similar.iter().map(|name| format!("\"{name}\"")).collect();
            message.push_str(&format!(" Similar slugs in this vault: {}.", quoted.join(", ")));
        }
        ToolError::missing_node(
            message,
            MissingNodeDetails {
                subject,
                slug: Some(slug.to_string()),
                recovery_tools: vec!["list_concepts"],
                create_tool: offers_creating.then_some("add_concepts"),
                similar_slugs: Some(similar),
                ..MissingNodeDetails::default()
            },
        )
    }
}

pub struct ReferenceNames<'a> {
    lookup: SlugLookup<'a>,
    root: &'a VaultRoot,
}

impl NameResolver for ReferenceNames<'_> {
    fn resolve(&self, name: &str) -> Option<String> {
        self.lookup.resolve(self.root, name).ok().flatten()
    }
}
