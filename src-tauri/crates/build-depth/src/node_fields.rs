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

/// The text under the `## heading` of `body`, up to the next `## ` heading or the end; empty
/// when there is none. The heading matches in any letter case.
pub(crate) fn section_of<'a>(body: &'a str, heading: &str) -> &'a str {
    let mut start: Option<usize> = None;
    let mut offset = 0;
    for line in body.split_inclusive('\n') {
        let text = line.trim_end_matches(['\n', '\r']);
        let opens_section = text
            .strip_prefix("##")
            .is_some_and(|rest| rest.chars().next().is_some_and(char::is_whitespace));
        if let Some(from) = start {
            if opens_section {
                return body.get(from..offset).unwrap_or("");
            }
        } else if opens_section
            && text
                .strip_prefix("##")
                .is_some_and(|rest| rest.trim().eq_ignore_ascii_case(heading))
        {
            start = Some(offset + text.len());
        }
        offset += line.len();
    }
    start.map_or("", |from| body.get(from..).unwrap_or(""))
}

/// Wording a node uses for a subject it only outlined; read under `## Uncertainty` alone.
pub(crate) fn says_outlined_only(body: &str) -> bool {
    static OUTLINED_ONLY: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        crate::line_cites::pattern(
            r"(?i-u)\b(?:outlined only|only outlined|outline only|outlined,? (?:but )?(?:the )?(?:body |bodies )?(?:not read|unread)|bod(?:y|ies) (?:was |were |is |are )?(?:not read|unread)|unread|not opened)\b",
        )
    });
    OUTLINED_ONLY.is_match(section_of(body, "Uncertainty"))
}

/// The first node of kind `project`.
pub(crate) fn project_of(documents: &[LoadedDocument]) -> Option<&LoadedDocument> {
    documents
        .iter()
        .find(|document| kind_of(document) == "project")
}
