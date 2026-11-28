//! Which concept a `describes:` entry names. Built once per folder so each entry is one lookup. An
//! entry resolves as `find_backlinks` resolves a name (full slug, then a frontmatter `slug:` alias,
//! then a unique tail or path suffix), over every document so a tail shared with a wiki page is
//! ambiguous there too; only a `kind:` node outside `wiki/` and `sources/` that is not the vault
//! README is a concept. Slugs, aliases and entries are compared composed (NFC): macOS hands Hangul
//! file names over decomposed while frontmatter is typed composed.

use std::collections::HashMap;

use answer_format::whitespace::trim;
use icu_normalizer::ComposingNormalizerBorrowed;

use crate::wiki_template::{WIKI_DIR, WIKI_SOURCES_DIR};

/// One document of the folder, wiki pages included.
pub struct ConceptEntry<'a> {
    /// Vault-relative, without `.md`.
    pub slug: &'a str,
    pub kind: Option<&'a str>,
    /// The document's own frontmatter `slug:`.
    pub alias: Option<&'a str>,
}

/// What an entry names.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Named {
    /// A `kind:` node: the entry is fine.
    Concept,
    /// A document that is not a concept: a wiki page or the vault README.
    NotAConcept,
    Missing,
    /// The last part names more than one document.
    Ambiguous,
}

pub struct ConceptIndex {
    /// Every slug, and whether it is a concept.
    slugs: HashMap<String, bool>,
    aliases: HashMap<String, String>,
    /// The slug each path ending names, or `None` when it names several.
    suffixes: HashMap<String, Option<String>>,
}

fn nfc(text: &str) -> String {
    ComposingNormalizerBorrowed::new_nfc().normalize(trim(text)).into_owned()
}

fn is_concept(slug: &str, kind: Option<&str>) -> bool {
    let kind = trim(kind.unwrap_or_default());
    if kind.is_empty() || kind == "vault-readme" {
        return false;
    }
    !slug.starts_with(&format!("{WIKI_DIR}/")) && !slug.starts_with(&format!("{WIKI_SOURCES_DIR}/"))
}

impl ConceptIndex {
    pub fn new<'a>(entries: impl IntoIterator<Item = ConceptEntry<'a>>) -> Self {
        let mut slugs = HashMap::new();
        let mut aliases = HashMap::new();
        let mut suffixes: HashMap<String, Option<String>> = HashMap::new();
        for entry in entries {
            let slug = nfc(entry.slug);
            if slug.is_empty() || slugs.contains_key(&slug) {
                continue;
            }
            slugs.insert(slug.clone(), is_concept(&slug, entry.kind));
            let alias = nfc(entry.alias.unwrap_or_default());
            if !alias.is_empty() {
                aliases.entry(alias).or_insert_with(|| slug.clone());
            }
            for (at, _) in slug.match_indices('/') {
                let suffix = slug.get(at + 1..).unwrap_or_default();
                if suffix.is_empty() {
                    continue;
                }
                suffixes
                    .entry(suffix.to_string())
                    .and_modify(|held| *held = None)
                    .or_insert_with(|| Some(slug.clone()));
            }
        }
        Self {
            slugs,
            aliases,
            suffixes,
        }
    }

    pub fn resolve(&self, reference: &str) -> Named {
        let typed = trim(reference);
        let name = nfc(typed);
        if name.is_empty() {
            return Named::Missing;
        }
        let found = |slug: &str| match self.slugs.get(slug) {
            Some(true) => Named::Concept,
            _ => Named::NotAConcept,
        };
        if self.slugs.contains_key(&name) {
            return found(&name);
        }
        if let Some(slug) = self.aliases.get(&name) {
            return found(slug);
        }
        match self.suffixes.get(&name) {
            None => Named::Missing,
            Some(None) => Named::Ambiguous,
            Some(Some(slug)) => found(slug),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index() -> ConceptIndex {
        ConceptIndex::new([
            ConceptEntry { slug: "capabilities/a", kind: Some("capability"), alias: Some("alpha") },
            ConceptEntry { slug: "domains/a", kind: Some("domain"), alias: None },
            ConceptEntry { slug: "wiki/plan", kind: None, alias: None },
            ConceptEntry { slug: "capabilities/only", kind: Some("capability"), alias: None },
        ])
    }

    #[test]
    fn a_full_slug_an_alias_and_a_unique_tail_name_a_concept() {
        let index = index();
        assert_eq!(index.resolve("capabilities/a"), Named::Concept);
        assert_eq!(index.resolve("alpha"), Named::Concept);
        assert_eq!(index.resolve("only"), Named::Concept);
    }

    #[test]
    fn a_tail_two_documents_share_is_ambiguous_and_a_wiki_page_is_no_concept() {
        let index = index();
        assert_eq!(index.resolve("a"), Named::Ambiguous);
        assert_eq!(index.resolve("wiki/plan"), Named::NotAConcept);
        assert_eq!(index.resolve("nothing"), Named::Missing);
        assert_eq!(index.resolve("  "), Named::Missing);
    }
}
