//! The fields of a node the depth checks read: its kind, its `path:`, the references it lists, and
//! how a reference names a node.

use std::collections::{HashMap, HashSet};

use vault_document::LoadedDocument;

/// The node's `kind:`, trimmed; empty when it has none.
pub(crate) fn kind_of(document: &LoadedDocument) -> &str {
    document
        .frontmatter()
        .text("kind")
        .map_or("", answer_format::whitespace::trim)
}

/// The file or folder the node's `path:` names, without a leading `./`.
pub(crate) fn node_path(document: &LoadedDocument) -> Option<String> {
    let path = answer_format::whitespace::trim(document.frontmatter().text("path")?);
    (!path.is_empty()).then(|| path.strip_prefix("./").unwrap_or(path).to_string())
}

/// Every non-empty reference listed under `keys`, in the order of `keys`.
pub(crate) fn refs_of<'a>(document: &'a LoadedDocument, keys: &[&str]) -> Vec<&'a str> {
    keys.iter()
        .flat_map(|key| document.frontmatter().list(key).unwrap_or_default())
        .map(|reference| answer_format::whitespace::trim(reference.as_str()))
        .filter(|reference| !reference.is_empty())
        .collect()
}

/// A reference as an exact slug, or the one node whose slug ends with it.
pub(crate) struct SlugResolver<'a> {
    slugs: HashSet<&'a str>,
    by_tail: HashMap<&'a str, Option<&'a str>>,
}

impl<'a> SlugResolver<'a> {
    pub(crate) fn of(documents: &'a [LoadedDocument]) -> Self {
        let mut by_tail: HashMap<&str, Option<&str>> = HashMap::new();
        for document in documents {
            let slug = document.slug();
            let tail = slug.rsplit('/').next().unwrap_or(slug);
            by_tail
                .entry(tail)
                .and_modify(|held| *held = None)
                .or_insert(Some(slug));
        }
        Self {
            slugs: documents.iter().map(LoadedDocument::slug).collect(),
            by_tail,
        }
    }

    pub(crate) fn resolve(&self, reference: &str) -> Option<&'a str> {
        if let Some(slug) = self.slugs.get(reference) {
            return Some(slug);
        }
        self.by_tail.get(reference).copied().flatten()
    }
}
