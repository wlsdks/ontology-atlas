//! What only the whole vault can see: a reference that names nothing, two documents that claim one
//! `slug:`, one identity claimed twice. Each document alone looks fine, so these are found in one
//! pass over every document and handed out by the slug they are about.

use std::collections::{HashMap, HashSet};

use answer_format::whitespace::trim;

use crate::loaded_document::LoadedDocument;
use crate::reference_index::ReferenceIndex;
use crate::relations::neighbor_refs;
use crate::schema::node_uid_issue;
use crate::validation::{Issue, Severity};

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

/// The documents a call asks findings about.
enum Asked<'s> {
    Every,
    Slugs(HashSet<&'s str>),
}

impl Asked<'_> {
    fn includes(&self, slug: &str) -> bool {
        match self {
            Self::Every => true,
            Self::Slugs(slugs) => slugs.contains(slug),
        }
    }

    /// The claims the documents asked about make, or `None` when every document is asked about: a
    /// pass over the vault then gathers only the claims those documents share with others.
    fn claims_of<'d, C: IntoIterator<Item = &'d str>>(
        &self,
        documents: &'d [LoadedDocument],
        claims: impl Fn(&'d LoadedDocument) -> C,
    ) -> Option<HashSet<&'d str>> {
        match self {
            Self::Every => None,
            Self::Slugs(_) => Some(
                documents
                    .iter()
                    .filter(|document| self.includes(document.slug()))
                    .flat_map(claims)
                    .collect(),
            ),
        }
    }
}

/// The `slug:` a document declares, trimmed, when it declares one.
fn declared_slug(document: &LoadedDocument) -> Option<&str> {
    document
        .frontmatter()
        .text("slug")
        .map(trim)
        .filter(|slug| !slug.is_empty())
}

/// The well-formed identities a document claims, its `uid` first, each once.
fn identities(document: &LoadedDocument) -> Vec<&str> {
    let frontmatter = document.frontmatter();
    let mut identities: Vec<&str> = Vec::new();
    if let Some(uid) = frontmatter.get("uid") {
        if node_uid_issue(Some(uid)).is_none() {
            identities.extend(uid.as_text());
        }
    }
    for merged in frontmatter.list("merged_uids").unwrap_or_default() {
        if node_uid_issue(Some(&crate::frontmatter::Value::Text(merged.clone()))).is_none() {
            identities.push(merged);
        }
    }
    if identities.len() > 1 {
        let mut seen: HashSet<&str> = HashSet::new();
        identities.retain(|identity| seen.insert(identity));
    }
    identities
}

impl VaultIssues {
    /// Every finding about `documents`. `with_messages` is false when only their number matters.
    pub fn find(
        documents: &[LoadedDocument],
        index: &ReferenceIndex<'_>,
        with_messages: bool,
    ) -> Self {
        Self::of(documents, index, with_messages, &Asked::Every)
    }

    /// The findings about the documents of `slugs` only, each as [`Self::find`] gives it: a call
    /// that reads a few nodes does not gather what every other node shares.
    pub fn about(documents: &[LoadedDocument], index: &ReferenceIndex<'_>, slugs: &[&str]) -> Self {
        let asked = Asked::Slugs(slugs.iter().copied().collect());
        Self::of(documents, index, true, &asked)
    }

    fn of(
        documents: &[LoadedDocument],
        index: &ReferenceIndex<'_>,
        with_messages: bool,
        asked: &Asked<'_>,
    ) -> Self {
        let mut found = Self::default();
        found.add_dangling_references(documents, index, with_messages, asked);
        found.add_duplicate_slugs(documents, with_messages, asked);
        found.add_duplicate_identities(documents, with_messages, asked);
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
        asked: &Asked<'_>,
    ) {
        for document in documents
            .iter()
            .filter(|document| asked.includes(document.slug()))
        {
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

    fn add_duplicate_slugs(
        &mut self,
        documents: &[LoadedDocument],
        with_messages: bool,
        asked: &Asked<'_>,
    ) {
        let wanted = asked.claims_of(documents, declared_slug);
        let mut by_declared: Vec<(&str, Vec<&LoadedDocument>)> = Vec::new();
        let mut position: HashMap<&str, usize> = HashMap::new();
        for document in documents {
            let Some(declared) = declared_slug(document) else {
                continue;
            };
            if wanted
                .as_ref()
                .is_some_and(|wanted| !wanted.contains(declared))
            {
                continue;
            }
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
            for document in group
                .iter()
                .filter(|document| asked.includes(document.slug()))
            {
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

    fn add_duplicate_identities(
        &mut self,
        documents: &[LoadedDocument],
        with_messages: bool,
        asked: &Asked<'_>,
    ) {
        let wanted = asked.claims_of(documents, identities);
        let mut claims: Vec<(&str, Vec<&LoadedDocument>)> = Vec::new();
        let mut position: HashMap<&str, usize> = HashMap::new();
        for document in documents {
            for identity in identities(document) {
                if wanted
                    .as_ref()
                    .is_some_and(|wanted| !wanted.contains(identity))
                {
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
            for document in group
                .iter()
                .filter(|document| asked.includes(document.slug()))
            {
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
    for document in documents {
        if !document.issues().is_empty() {
            by_slug.insert(document.slug().to_string(), document.issues().to_vec());
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
