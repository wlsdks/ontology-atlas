//! What only the whole vault can see: a reference that names nothing, two documents that claim one
//! `slug:`, one identity claimed twice. Each document alone looks fine, so these are found in one
//! pass over every document and handed out by the slug they are about.

use std::collections::{HashMap, HashSet};

use answer_format::whitespace::trim;

use crate::loaded_vault::LoadedDocument;
use crate::parallel_map::parallel_map;
use crate::reference_index::ReferenceIndex;
use crate::relations::neighbor_refs;
use crate::schema::node_uid_issue;
use crate::validation::{validate_document, Issue, Severity};

/// The vault-wide findings, by the slug each is about.
#[derive(Debug, Default)]
pub struct VaultIssues {
    by_slug: HashMap<String, Vec<Issue>>,
}

/// Whether an entry under `elements:` is a path to code rather than a name of a node.
fn is_path_like(reference: &str) -> bool {
    ["src/", "mcp/", "cli/", "scripts/", ".claude/"]
        .iter()
        .any(|prefix| reference.starts_with(prefix))
        || reference.rsplit_once('.').is_some_and(|(_, extension)| {
            !extension.is_empty() && extension.bytes().all(|byte| byte.is_ascii_alphanumeric())
        })
}

impl VaultIssues {
    /// Every finding about `documents`. `with_messages` is false when only their number matters.
    pub fn find(
        documents: &[LoadedDocument],
        index: &ReferenceIndex<'_>,
        with_messages: bool,
    ) -> Self {
        let mut found = Self::default();
        found.add_dangling_references(documents, index, with_messages);
        found.add_duplicate_slugs(documents, with_messages);
        found.add_duplicate_identities(documents, with_messages);
        found
    }

    pub fn for_slug(&self, slug: &str) -> &[Issue] {
        self.by_slug.get(slug).map_or(&[], Vec::as_slice)
    }

    pub fn into_by_slug(self) -> HashMap<String, Vec<Issue>> {
        self.by_slug
    }

    fn add(&mut self, slug: &str, issue: Issue) {
        self.by_slug
            .entry(slug.to_string())
            .or_default()
            .push(issue);
    }

    fn add_dangling_references(
        &mut self,
        documents: &[LoadedDocument],
        index: &ReferenceIndex<'_>,
        with_messages: bool,
    ) {
        for document in documents {
            for neighbor in neighbor_refs(document.frontmatter()) {
                if neighbor.key == "elements" && is_path_like(&neighbor.reference) {
                    continue;
                }
                if index.resolves(&neighbor.reference) {
                    continue;
                }
                let key = neighbor.key;
                let reference = &neighbor.reference;
                self.add(
                    document.slug(),
                    Issue {
                        code: "dangling-graph-reference",
                        severity: Severity::Warning,
                        message: with_messages
                            .then(|| format!("`{key}:` graph reference \"{reference}\" does not resolve to any node in the vault.")),
                    },
                );
            }
        }
    }

    fn add_duplicate_slugs(&mut self, documents: &[LoadedDocument], with_messages: bool) {
        let mut by_declared: Vec<(&str, Vec<&LoadedDocument>)> = Vec::new();
        let mut position: HashMap<&str, usize> = HashMap::new();
        for document in documents {
            let Some(declared) = document
                .frontmatter()
                .text("slug")
                .map(trim)
                .filter(|slug| !slug.is_empty())
            else {
                continue;
            };
            let at = *position.entry(declared).or_insert_with(|| {
                by_declared.push((declared, Vec::new()));
                by_declared.len() - 1
            });
            if let Some((_, group)) = by_declared.get_mut(at) {
                group.push(document);
            }
        }
        for (declared, group) in by_declared {
            if group.len() < 2 {
                continue;
            }
            for document in &group {
                let rest = group
                    .iter()
                    .filter(|other| other.slug() != document.slug())
                    .map(|other| other.slug())
                    .collect::<Vec<_>>()
                    .join(", ");
                self.add(
                    document.slug(),
                    Issue {
                        code: "duplicate-slug",
                        severity: Severity::Error,
                        message: with_messages.then(|| format!(
                            "`slug: {declared}` is also claimed by {rest}. Relations naming it cannot resolve to one node — change one slug or merge with rename_concept."
                        )),
                    },
                );
            }
        }
    }

    fn add_duplicate_identities(&mut self, documents: &[LoadedDocument], with_messages: bool) {
        let mut claims: Vec<(&str, Vec<&LoadedDocument>)> = Vec::new();
        let mut position: HashMap<&str, usize> = HashMap::new();
        for document in documents {
            let frontmatter = document.frontmatter();
            let mut identities: Vec<&str> = Vec::new();
            if let Some(uid) = frontmatter.get("uid") {
                if node_uid_issue(Some(uid)).is_none() {
                    identities.extend(uid.as_text());
                }
            }
            for merged in frontmatter.list("merged_uids").unwrap_or_default() {
                if node_uid_issue(Some(&crate::frontmatter::Value::Text(merged.clone()))).is_none()
                {
                    identities.push(merged);
                }
            }
            let mut seen: HashSet<&str> = HashSet::new();
            for identity in identities {
                if !seen.insert(identity) {
                    continue;
                }
                let at = *position.entry(identity).or_insert_with(|| {
                    claims.push((identity, Vec::new()));
                    claims.len() - 1
                });
                if let Some((_, group)) = claims.get_mut(at) {
                    group.push(document);
                }
            }
        }
        for (identity, group) in claims {
            if group.len() < 2 {
                continue;
            }
            for document in &group {
                let rest = group
                    .iter()
                    .filter(|other| other.slug() != document.slug())
                    .map(|other| other.slug())
                    .collect::<Vec<_>>()
                    .join(", ");
                self.add(
                    document.slug(),
                    Issue {
                        code: "duplicate-uid",
                        severity: Severity::Error,
                        message: with_messages.then(|| format!(
                            "UID {identity} is also claimed by {rest} as a primary or merged identity. Permanent identity must resolve to exactly one surviving node."
                        )),
                    },
                );
            }
        }
    }
}

/// How many errors and warnings the vault holds, each document counted once for what it says
/// alone and once for what the vault says of it. A node its project already contains is not counted
/// as parentless, and a wiki page, which carries no `kind:` by contract, is not counted for the
/// absence.
pub fn count_vault_issues(
    documents: &[LoadedDocument],
    index: &ReferenceIndex<'_>,
) -> (usize, usize) {
    let mut by_slug: HashMap<String, Vec<Issue>> = HashMap::new();
    let own_issues = parallel_map(documents, |document| {
        if document.document().shape() == crate::document::RawShape::Empty {
            return Vec::new();
        }
        validate_document(document.document(), None)
    });
    for (document, issues) in documents.iter().zip(own_issues) {
        if !issues.is_empty() {
            by_slug.insert(document.slug().to_string(), issues);
        }
    }
    for (slug, issues) in VaultIssues::find(documents, index, false).into_by_slug() {
        by_slug.entry(slug).or_default().extend(issues);
    }
    let parented = parented_slugs(documents);
    let (mut errors, mut warnings) = (0, 0);
    for (slug, issues) in &by_slug {
        let is_parented = parented.contains(slug.as_str());
        let is_wiki_page = slug.starts_with("wiki/");
        for issue in issues {
            if is_parented
                && issue.code == "missing-expected-field"
                && issue
                    .message
                    .as_deref()
                    .is_some_and(|text| text.starts_with("`domain:`"))
            {
                continue;
            }
            if is_wiki_page && issue.code == "missing-kind" {
                continue;
            }
            match issue.severity {
                Severity::Error => errors += 1,
                Severity::Warning => warnings += 1,
            }
        }
    }
    (errors, warnings)
}

/// The slugs another node contains, which therefore have a tree parent.
fn parented_slugs(documents: &[LoadedDocument]) -> HashSet<&str> {
    let mut parented = HashSet::new();
    for document in documents {
        for key in ["contains", "capabilities", "elements", "domains"] {
            for reference in document.frontmatter().list(key).unwrap_or_default() {
                let reference = trim(reference);
                if !reference.is_empty() {
                    parented.insert(reference);
                }
            }
        }
    }
    parented
}
