//! Compiling a vault's documents into a [`CompiledGraph`]: which documents are nodes, what each
//! name reaches, which edges they draw, and what is wrong with the vault that a reader should know.

use std::collections::{HashMap, HashSet};
use std::ops::Range;

use answer_format::collation::compare_text;
use answer_format::utf16;
use answer_format::whitespace::trim;
use vault_document::frontmatter::{DiagnosticCode, Value};
use vault_document::schema::{is_node_uid, GRAPH_ARRAY_KEYS};
use vault_document::{neighbor_refs, normalized_refs, relation_note_for, LoadedDocument, SlugList};

use crate::adjacency::Adjacency;
use crate::compile_issue::{sort_issues, CompileIssue};
use crate::compiled_graph::{
    AliasEntry, AmbiguousAlias, CanonicalizationAction, CompiledGraph, Edge, EdgeCounts, EdgeId,
    Node, NodeId, Target,
};
use crate::graph_hash::hash_graph;
use crate::identity_error::{IdentityError, IdentityFault};

/// Code that a vault points at rather than a node: the references `elements:` holds that name a
/// file.
const CODE_FOLDERS: [&str; 6] = ["src/", "mcp/", "cli/", "app/", "tests/", "scripts/"];

fn is_path_like(reference: &str) -> bool {
    CODE_FOLDERS
        .iter()
        .any(|folder| reference.starts_with(folder))
        || reference.contains('.')
}

/// The documents that are nodes, which are those with a `kind:` that says something.
fn node_documents(documents: &[LoadedDocument]) -> Vec<&LoadedDocument> {
    documents
        .iter()
        .filter(|document| document.node_kind().is_some())
        .collect()
}

/// A node's `uid:`, when it has the one shape a uid may have.
fn valid_uid(document: &LoadedDocument) -> Option<&str> {
    match document.frontmatter().get("uid") {
        Some(Value::Text(text)) if is_node_uid(text) => Some(text),
        _ => None,
    }
}

/// The faults in identity, judged over every node at once so a message names all of them.
fn identity_faults(nodes: &[&LoadedDocument]) -> Vec<IdentityFault> {
    let mut faults = Vec::new();
    let mut primary: Vec<(&str, SlugList<'_>)> = Vec::with_capacity(nodes.len());
    let mut primary_index: HashMap<&str, usize> = HashMap::with_capacity(nodes.len());
    for document in nodes {
        let slug = document.slug();
        match document.frontmatter().get("uid") {
            None => faults.push(IdentityFault::MissingUid {
                slug: slug.to_string(),
            }),
            Some(Value::Text(text)) if text.is_empty() => faults.push(IdentityFault::MissingUid {
                slug: slug.to_string(),
            }),
            Some(_) => match valid_uid(document) {
                None => faults.push(IdentityFault::InvalidUid {
                    slug: slug.to_string(),
                }),
                Some(uid) => match primary_index.get(uid) {
                    Some(&at) => {
                        if let Some((_, slugs)) = primary.get_mut(at) {
                            slugs.push(slug);
                        }
                    }
                    None => {
                        primary_index.insert(uid, primary.len());
                        primary.push((uid, SlugList::One(slug)));
                    }
                },
            },
        }
    }
    primary.sort_by(|left, right| compare_text(left.0, right.0));
    let mut unique_primary: HashSet<&str> = HashSet::new();
    for (uid, mut slugs) in primary {
        slugs
            .as_mut_slice()
            .sort_by(|left, right| utf16::compare(left, right));
        if slugs.as_slice().len() > 1 {
            faults.push(IdentityFault::DuplicateUid {
                slugs: slugs
                    .as_slice()
                    .iter()
                    .map(|slug| (*slug).to_string())
                    .collect(),
            });
        } else {
            unique_primary.insert(uid);
        }
    }

    let mut merged: Vec<(&str, Vec<&str>)> = Vec::new();
    let mut merged_index: HashMap<&str, usize> = HashMap::new();
    for document in nodes {
        let slug = document.slug();
        let Some(value) = document.frontmatter().get("merged_uids") else {
            continue;
        };
        let Some(items) = value.as_list() else {
            faults.push(IdentityFault::InvalidMergedUids {
                slug: slug.to_string(),
            });
            continue;
        };
        for item in items {
            if !is_node_uid(item) {
                faults.push(IdentityFault::InvalidMergedUid {
                    slug: slug.to_string(),
                });
                continue;
            }
            let at = *merged_index.entry(item.as_str()).or_insert_with(|| {
                merged.push((item.as_str(), Vec::new()));
                merged.len() - 1
            });
            if let Some((_, slugs)) = merged.get_mut(at) {
                slugs.push(slug);
            }
        }
    }
    merged.sort_by(|left, right| compare_text(left.0, right.0));
    for (uid, mut slugs) in merged {
        slugs.sort_by(|left, right| utf16::compare(left, right));
        let owned: Vec<String> = slugs.iter().map(|slug| (*slug).to_string()).collect();
        if owned.len() > 1 {
            faults.push(IdentityFault::DuplicateMergedUid {
                slugs: owned.clone(),
            });
        }
        if unique_primary.contains(uid) {
            faults.push(IdentityFault::PrimaryMergedUidCollision {
                merged_slugs: owned,
            });
        }
    }
    faults
}

/// The names that reach each node: its slug, its last segment and the `slug:` it declares.
struct AliasTable<'a> {
    entries: Vec<(&'a str, SlugList<'a>)>,
    index: HashMap<&'a str, usize>,
}

impl<'a> AliasTable<'a> {
    /// A table for the names of `node_count` nodes, each reached by its slug and its last segment.
    fn new(node_count: usize) -> Self {
        Self {
            entries: Vec::with_capacity(node_count * 2),
            index: HashMap::with_capacity(node_count * 2),
        }
    }

    fn add(&mut self, alias: &'a str, slug: &'a str) {
        let key = trim(alias);
        if key.is_empty() {
            return;
        }
        match self.index.get(key) {
            Some(&at) => {
                if let Some((_, slugs)) = self.entries.get_mut(at) {
                    if !slugs.as_slice().contains(&slug) {
                        slugs.push(slug);
                    }
                }
            }
            None => {
                self.index.insert(key, self.entries.len());
                self.entries.push((key, SlugList::One(slug)));
            }
        }
    }
}

/// Compiles `documents`, which are every document of the vault in the vault's own order.
pub fn compile(documents: &[LoadedDocument]) -> Result<CompiledGraph, IdentityError> {
    let node_documents = node_documents(documents);
    let skipped_non_node_count = documents.len() - node_documents.len();
    let faults = identity_faults(&node_documents);
    if !faults.is_empty() {
        return Err(IdentityError::new(faults));
    }

    let mut ordered: Vec<&LoadedDocument> = node_documents.clone();
    ordered.sort_by(|left, right| compare_text(left.slug(), right.slug()));
    let mut by_slug: HashMap<&str, NodeId> = HashMap::with_capacity(ordered.len());
    for (index, document) in ordered.iter().enumerate() {
        by_slug.insert(document.slug(), NodeId::from_index(index));
    }

    let mut alias_table = AliasTable::new(node_documents.len());
    for document in &node_documents {
        let slug = document.slug();
        alias_table.add(slug, slug);
        let tail = slug.rsplit('/').next().unwrap_or(slug);
        if !tail.is_empty() && tail != slug {
            alias_table.add(tail, slug);
        }
        if let Some(declared) = document.frontmatter().text("slug") {
            alias_table.add(declared, slug);
        }
    }
    let mut alias_entries = alias_table.entries;
    alias_entries.sort_by(|left, right| compare_text(left.0, right.0));
    let mut aliases: Vec<AliasEntry> = Vec::with_capacity(alias_entries.len());
    let mut ambiguous_aliases = Vec::new();
    let mut by_alias: HashMap<&str, NodeId> = HashMap::with_capacity(alias_entries.len());
    for (alias, mut slugs) in alias_entries {
        slugs
            .as_mut_slice()
            .sort_by(|left, right| utf16::compare(left, right));
        match slugs.as_slice() {
            [only] => {
                if let Some(node) = by_slug.get(only) {
                    by_alias.insert(alias, *node);
                    aliases.push(AliasEntry::new(alias, *node));
                }
            }
            _ => ambiguous_aliases.push(AmbiguousAlias {
                alias: alias.to_string(),
                slugs: slugs
                    .as_slice()
                    .iter()
                    .map(|slug| (*slug).to_string())
                    .collect(),
            }),
        }
    }

    let mut issues: Vec<CompileIssue> = ambiguous_aliases
        .iter()
        .map(|entry| CompileIssue::AmbiguousAlias {
            alias: entry.alias.clone(),
            slugs: entry.slugs.clone(),
        })
        .collect();
    for document in documents {
        let mut reported: Vec<&str> = Vec::new();
        for diagnostic in document.diagnostics() {
            if diagnostic.code != DiagnosticCode::MalformedFrontmatterLine {
                continue;
            }
            reported.push(&diagnostic.message);
            issues.push(CompileIssue::MalformedFrontmatterLine {
                slug: document.slug().to_string(),
                line: Some(diagnostic.line),
                message: diagnostic.message.clone(),
            });
        }
        for key in GRAPH_ARRAY_KEYS {
            let is_not_a_list = document
                .frontmatter()
                .get(key)
                .is_some_and(|value| value.as_list().is_none());
            if !is_not_a_list {
                continue;
            }
            let named = format!("graph relation `{key}:`");
            if reported.iter().any(|message| message.contains(&named)) {
                continue;
            }
            issues.push(CompileIssue::MalformedFrontmatterLine {
                slug: document.slug().to_string(),
                line: None,
                message: format!("Frontmatter graph relation `{key}:` must be an array."),
            });
        }
    }

    let mut canonicalization_actions = Vec::new();
    // Each edge with where its order key lies in `order_keys`: the keys of every edge are written
    // into one text, not one allocation each.
    let mut edges: Vec<(Range<usize>, Edge)> = Vec::new();
    let mut order_keys = String::new();
    for document in &node_documents {
        let frontmatter = document.frontmatter();
        let mut keys = Vec::new();
        let mut patch = Vec::new();
        for key in GRAPH_ARRAY_KEYS {
            let Some(items) = frontmatter.list(key) else {
                continue;
            };
            let listed: Vec<&str> = items.iter().map(String::as_str).collect();
            let canonical = normalized_refs(&listed);
            if canonical.len() == items.len()
                && canonical
                    .iter()
                    .zip(items)
                    .all(|(left, right)| left == right)
            {
                continue;
            }
            keys.push(key);
            patch.push((key, canonical));
        }
        if !keys.is_empty() {
            canonicalization_actions.push(CanonicalizationAction {
                slug: document.slug().to_string(),
                keys,
                frontmatter: patch,
                expected_mtime: document.modified_ms().unwrap_or(0.0),
            });
        }
        let Some(&from) = by_slug.get(document.slug()) else {
            continue;
        };
        for neighbor in neighbor_refs(frontmatter) {
            let resolved = by_alias.get(neighbor.reference.as_str()).copied();
            let target = match resolved {
                Some(node) => Target::Node(node),
                None if neighbor.key == "elements" && is_path_like(&neighbor.reference) => {
                    Target::External
                }
                None => Target::Unresolved,
            };
            if target == Target::Unresolved {
                issues.push(CompileIssue::DanglingGraphReference {
                    slug: document.slug().to_string(),
                    via: neighbor.key,
                    reference: neighbor.reference.clone(),
                });
            }
            let resolved_slug =
                resolved.and_then(|node| ordered.get(node.index()).map(|d| d.slug()));
            let to_name = resolved_slug.unwrap_or(neighbor.reference.as_str());
            let key_start = order_keys.len();
            for (part, text) in [
                document.slug(),
                neighbor.key,
                to_name,
                neighbor.reference.as_str(),
            ]
            .into_iter()
            .enumerate()
            {
                if part > 0 {
                    order_keys.push(':');
                }
                order_keys.push_str(text);
            }
            let order_key = key_start..order_keys.len();
            let rationale = relation_note_for(frontmatter, &neighbor.reference, resolved_slug);
            edges.push((
                order_key,
                Edge {
                    from,
                    target,
                    via: neighbor.key,
                    reference: neighbor.reference,
                    rationale,
                },
            ));
        }
    }
    let order_key = |range: &Range<usize>| order_keys.get(range.clone()).unwrap_or_default();
    edges.sort_by(|(left, _), (right, _)| compare_text(order_key(left), order_key(right)));
    let edges: Vec<Edge> = edges.into_iter().map(|(_, edge)| edge).collect();
    drop(order_keys);

    sort_issues(&mut issues);

    let mut nodes: Vec<Node> = ordered.iter().map(|document| node_of(document)).collect();
    let numbered = || {
        edges
            .iter()
            .enumerate()
            .map(|(index, edge)| (edge, EdgeId::from_index(index)))
    };
    let outgoing = Adjacency::of(nodes.len(), numbered().map(|(edge, id)| (edge.from, id)));
    let incoming = Adjacency::of(
        nodes.len(),
        numbered().filter_map(|(edge, id)| edge.to().map(|to| (to, id))),
    );
    let mut counts = EdgeCounts::default();
    let mut referenced_only: HashSet<&str> = HashSet::new();
    for edge in &edges {
        if let Some(from) = nodes.get_mut(edge.from.index()) {
            from.out_degree += 1;
        }
        match edge.target {
            Target::Node(to) => {
                counts.resolved += 1;
                if let Some(node) = nodes.get_mut(to.index()) {
                    node.in_degree += 1;
                }
            }
            Target::External => {
                counts.external += 1;
                referenced_only.insert(&edge.reference);
            }
            Target::Unresolved => {
                counts.unresolved += 1;
                referenced_only.insert(&edge.reference);
            }
        }
    }
    counts.referenced_only = referenced_only.len();
    let max_mtime = nodes
        .iter()
        .fold(0.0_f64, |most, node| most.max(node.mtime));

    let mut graph = CompiledGraph {
        nodes,
        edges,
        aliases,
        ambiguous_aliases,
        issues,
        canonicalization_actions,
        graph_hash: String::new(),
        max_mtime,
        skipped_non_node_count,
        edge_counts: counts,
        outgoing,
        incoming,
    };
    graph.graph_hash = hash_graph(&graph);
    Ok(graph)
}

fn node_of(document: &LoadedDocument) -> Node {
    let frontmatter = document.frontmatter();
    let mut merged_uids: Vec<String> = frontmatter
        .list("merged_uids")
        .unwrap_or_default()
        .iter()
        .map(|uid| trim(uid).to_string())
        .filter(|uid| !uid.is_empty())
        .collect();
    merged_uids.sort_by(|left, right| utf16::compare(left, right));
    merged_uids.dedup();
    Node::new(document, merged_uids, document.modified_ms().unwrap_or(0.0))
}
