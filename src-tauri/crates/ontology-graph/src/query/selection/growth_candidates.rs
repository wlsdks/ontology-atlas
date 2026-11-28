//! What a vault should add, repair or settle next, one group of candidates each: references that
//! should become nodes, references that point at nothing, nodes that belong to no domain, domains
//! with nothing in them, capabilities that never reach code, and bridge nodes that group nothing.
//!
//! Every group counts all its candidates and writes only the first `limit`, so a vault of fifty
//! thousand dangling references costs a count, not fifty thousand rows.

use std::collections::HashSet;

use answer_format::whitespace::{collapse_whitespace, trim};
use serde::Serialize;
use vault_document::frontmatter::Value;
use vault_document::starter_body::starter_body;

use super::ignored_references::is_ignored;
use super::proposed_action::{ConceptRow, ProposedAction};
use super::reference_repair::{near_match_slug, suggested_slug, title_from_reference};
use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::containment_steps::{children, has_children, has_parent, parents};
use crate::query::domain_lookup::named_domain;
use crate::query::node_mask::NodeMask;
use crate::query::node_summary::NodeSummary;
use crate::query::walks::row_page::RowPage;

/// A candidate that names one node and says why.
#[derive(Serialize)]
pub struct NodeCandidate<'a> {
    pub(crate) kind: &'static str,
    pub(crate) score: f64,
    slug: &'a str,
    pub(crate) reason: String,
    pub(crate) node: NodeSummary<'a>,
}

impl<'a> NodeCandidate<'a> {
    pub(crate) fn about(
        graph: &'a CompiledGraph,
        id: NodeId,
        kind: &'static str,
        score: f64,
        reason: String,
    ) -> Self {
        Self {
            kind,
            score,
            slug: graph.node(id).slug(),
            reason,
            node: NodeSummary::of(graph, id),
        }
    }
}

#[derive(Serialize)]
pub struct ExternalElementRow<'a> {
    pub(crate) kind: &'static str,
    pub(crate) score: f64,
    from: &'a str,
    #[serde(rename = "ref")]
    reference: &'a str,
    #[serde(rename = "suggestedSlug")]
    suggested_slug: String,
    pub(crate) reason: String,
    #[serde(rename = "proposedAction")]
    pub(crate) proposed_action: ProposedAction,
    pub(crate) node: NodeSummary<'a>,
}

#[derive(Serialize)]
pub struct ExternalElements<'a> {
    #[serde(flatten)]
    group: RowPage<ExternalElementRow<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ignored: Option<usize>,
}

impl<'a> ExternalElements<'a> {
    pub fn total(&self) -> usize {
        self.group.total()
    }

    pub fn ignored(&self) -> usize {
        self.ignored.unwrap_or(0)
    }

    pub(crate) fn into_rows(self) -> Vec<ExternalElementRow<'a>> {
        self.group.into_rows()
    }
}

/// `elements:` references to code that has no node, unless the vault's ignore file covers them.
pub fn external_elements<'a>(
    graph: &'a CompiledGraph,
    ignore_patterns: &[String],
    limit: usize,
) -> ExternalElements<'a> {
    let mut ignored = 0;
    let mut kept: Vec<EdgeId> = Vec::new();
    for id in graph.edge_ids() {
        let edge = graph.edge(id);
        if !edge.is_external() || edge.via != "elements" {
            continue;
        }
        if is_ignored(ignore_patterns, &edge.reference) {
            ignored += 1;
        } else {
            kept.push(id);
        }
    }
    let rows = kept
        .iter()
        .take(limit)
        .map(|id| {
            let edge = graph.edge(*id);
            let source = graph.node(edge.from);
            let slug = suggested_slug(&edge.reference, "element");
            let domain = if source.kind() == "domain" {
                Some(Value::Text(source.slug().to_string()))
            } else {
                source.domain().filter(|value| value.is_truthy()).cloned()
            };
            ExternalElementRow {
                kind: "materialize_external_element",
                score: 0.8,
                from: source.slug(),
                reference: &edge.reference,
                suggested_slug: slug.clone(),
                reason: format!(
                    "{} references external element \"{}\". Materialize it if this file should become a first-class ontology node.",
                    source.slug(),
                    edge.reference
                ),
                proposed_action: ProposedAction::add_concept(ConceptRow {
                    slug,
                    kind: "element",
                    title: title_from_reference(&edge.reference),
                    domain,
                    path: Some(edge.reference.clone()),
                }),
                node: NodeSummary::of(graph, edge.from),
            }
        })
        .collect();
    ExternalElements {
        group: RowPage::new(kept.len(), limit, rows),
        ignored: Some(ignored).filter(|count| *count > 0),
    }
}

/// The kind of node a dangling reference under `relation` most plausibly names.
fn inferred_kind(relation: &str) -> Option<&'static str> {
    match relation {
        "domains" | "domain" => Some("domain"),
        "capabilities" | "dependencies" => Some("capability"),
        "elements" => Some("element"),
        _ => None,
    }
}

/// The relation name the write tools take for a frontmatter key.
fn writable_relation(via: &str) -> &str {
    if via == "dependencies" {
        "depends_on"
    } else {
        via
    }
}

#[derive(Serialize)]
pub struct DanglingReferenceRow<'a> {
    pub(crate) kind: &'static str,
    pub(crate) score: f64,
    from: &'a str,
    #[serde(rename = "ref")]
    reference: &'a str,
    relation: &'static str,
    #[serde(rename = "inferredKind")]
    inferred_kind: Option<&'static str>,
    #[serde(rename = "suggestedSlug")]
    suggested_slug: Option<String>,
    #[serde(rename = "didYouMean")]
    did_you_mean: Option<&'a str>,
    pub(crate) reason: String,
    #[serde(rename = "proposedAction")]
    pub(crate) proposed_action: Option<ProposedAction>,
    pub(crate) node: NodeSummary<'a>,
}

/// References that name no node and are not code. A near match gets `didYouMean` and no proposal
/// to create a node, so following the proposal never makes a duplicate.
pub fn dangling_references(
    graph: &CompiledGraph,
    limit: usize,
) -> RowPage<DanglingReferenceRow<'_>> {
    let dangling: Vec<EdgeId> = graph
        .edge_ids()
        .filter(|id| graph.edge(*id).is_dangling())
        .collect();
    let rows = dangling
        .iter()
        .take(limit)
        .map(|id| {
            let edge = graph.edge(*id);
            let from = graph.node(edge.from).slug();
            let kind = inferred_kind(edge.via);
            let near = near_match_slug(graph, &edge.reference);
            let score = match (near, kind) {
                (Some(_), _) => 0.85,
                (None, Some(_)) => 0.7,
                (None, None) => 0.4,
            };
            let reason = match near {
                Some(slug) => format!(
                    "Graph reference \"{reference}\" from \"{from}\" via \"{via}\" does not resolve, but \"{slug}\" is an existing node with a matching name: likely a missing folder prefix or typo. Fix the \"{via}\" reference on \"{from}\" (e.g. `replace_relation` from \"{from}\", oldTo \"{reference}\", newTo \"{slug}\", oldType and newType \"{relation}\", or edit the \"domain:\" field directly for a scalar reference) instead of creating a duplicate node.",
                    reference = edge.reference,
                    via = edge.via,
                    relation = writable_relation(edge.via),
                ),
                None => format!(
                    "Graph reference \"{}\" from \"{from}\" via \"{}\" does not resolve to a vault node.",
                    edge.reference, edge.via
                ),
            };
            let proposal = match (near, kind) {
                (None, Some(kind)) => Some(ProposedAction::add_concept(ConceptRow {
                    slug: suggested_slug(&edge.reference, kind),
                    kind: concept_kind(kind),
                    title: title_from_reference(&edge.reference),
                    domain: None,
                    path: None,
                })),
                _ => None,
            };
            DanglingReferenceRow {
                kind: "resolve_dangling_reference",
                score,
                from,
                reference: &edge.reference,
                relation: edge.via,
                inferred_kind: kind,
                suggested_slug: kind.map(|kind| suggested_slug(&edge.reference, kind)),
                did_you_mean: near,
                reason,
                proposed_action: proposal,
                node: NodeSummary::of(graph, edge.from),
            }
        })
        .collect();
    RowPage::new(dangling.len(), limit, rows)
}

fn concept_kind(kind: &str) -> &'static str {
    match kind {
        "domain" => "domain",
        "capability" => "capability",
        _ => "element",
    }
}

/// Capabilities and elements with no domain of their own and nothing containing them.
pub fn unassigned_nodes<'a>(graph: &'a CompiledGraph, limit: usize) -> RowPage<NodeCandidate<'a>> {
    let unassigned: Vec<NodeId> = graph
        .node_ids()
        .filter(|id| matches!(graph.node(*id).kind(), "capability" | "element"))
        .filter(|id| named_domain(graph, *id).is_none() && !has_parent(graph, *id))
        .collect();
    let rows = unassigned
        .iter()
        .take(limit)
        .map(|id| {
            NodeCandidate::about(
                graph,
                *id,
                "unassigned_node",
                0.5,
                format!(
                    "{} has no resolved domain and no containment parent. Assign it to a domain or keep it intentionally global.",
                    graph.node(*id).slug()
                ),
            )
        })
        .collect();
    RowPage::new(unassigned.len(), limit, rows)
}

/// Domains that contain no capability and no element.
pub fn empty_domains<'a>(graph: &'a CompiledGraph, limit: usize) -> RowPage<NodeCandidate<'a>> {
    let empty: Vec<NodeId> = graph
        .node_ids()
        .filter(|id| graph.node(*id).kind() == "domain")
        .filter(|id| {
            !children(graph, *id)
                .iter()
                .any(|link| matches!(graph.node(link.next).kind(), "capability" | "element"))
        })
        .collect();
    let rows = empty
        .iter()
        .take(limit)
        .map(|id| {
            NodeCandidate::about(
                graph,
                *id,
                "empty_domain",
                0.4,
                format!(
                    "{} has no contained capability or element nodes yet.",
                    graph.node(*id).slug()
                ),
            )
        })
        .collect();
    RowPage::new(empty.len(), limit, rows)
}

/// Capabilities that never reach code: no canonical `path:` entry point and no `elements:` link
/// to a node. Reported, never refused, so a behaviour can be named before its file is attached.
pub fn capabilities_without_evidence<'a>(
    graph: &'a CompiledGraph,
    limit: usize,
) -> RowPage<NodeCandidate<'a>> {
    let with_elements: HashSet<NodeId> = graph
        .edge_ids()
        .map(|id| graph.edge(id))
        .filter(|edge| edge.via == "elements" && edge.is_resolved())
        .map(|edge| edge.from)
        .collect();
    let bare: Vec<NodeId> = graph
        .node_ids()
        .filter(|id| graph.node(*id).kind() == "capability")
        .filter(|id| graph.node(*id).path().is_none() && !with_elements.contains(id))
        .collect();
    let rows = bare
        .iter()
        .take(limit)
        .map(|id| {
            NodeCandidate::about(
                graph,
                *id,
                "capability_without_evidence",
                0.5,
                format!(
                    "\"{}\" has neither a canonical `path:` entrypoint nor an `elements:` relation to a real implementation concept, so nothing in the vault says where this behavior lives in code. An agent handed only this vault can describe the capability and cannot open it. Patch `path:` with one repo-relative file or directory; add an element node only when a distinct implementation role earns ontology identity. This never blocked the write and does not block one now; it stays here until the capability points at something.",
                    graph.node(*id).slug()
                ),
            )
        })
        .collect();
    RowPage::new(bare.len(), limit, rows)
}

/// Whether a body is still the template `add_concepts` writes: it holds the template's prose
/// after its heading, which boilerplate plus one more line still says nothing beyond.
pub(super) fn is_starter_body(kind: &str, title: &str, body: &str) -> bool {
    if trim(body).is_empty() {
        return false;
    }
    let Some(starter) = starter_body(kind, title) else {
        return false;
    };
    let after_heading: Vec<&str> = starter.split('\n').skip(2).collect();
    let tail = collapse_whitespace(&after_heading.join("\n"));
    !tail.is_empty() && collapse_whitespace(body).contains(&tail)
}

/// Capabilities that group nothing. Having no children is common and fine, so one is named only
/// when it also sits under a parent of its own kind, or still carries its starter body.
/// `starter_bodies` holds the nodes whose body is the starter's: the caller reads each body once
/// and shares what it found.
pub fn unearned_nodes<'a>(
    graph: &'a CompiledGraph,
    starter_bodies: &NodeMask,
    limit: usize,
) -> RowPage<NodeCandidate<'a>> {
    let mut found: Vec<(NodeId, Option<NodeId>)> = Vec::new();
    for id in graph.node_ids() {
        let node = graph.node(id);
        if node.kind() != "capability" || has_children(graph, id) {
            continue;
        }
        let same_kind_parent = parents(graph, id)
            .iter()
            .map(|link| link.next)
            .find(|parent| graph.node(*parent).kind() == node.kind());
        if same_kind_parent.is_some() || starter_bodies.contains(id) {
            found.push((id, same_kind_parent));
        }
    }
    let rows = found
        .iter()
        .take(limit)
        .map(|(id, parent)| {
            let slug = graph.node(*id).slug();
            let reason = match parent {
                Some(parent) => format!(
                    "{slug} sits under \"{}\", a node of its own kind, but groups nothing: it has no children that resolve to real nodes. A bridge node earns its place by holding the children it was created for. Either patch_concept the children that share its behavior to point at it, or delete_concept it; an empty layer adds a hop to every path through it and answers no question.",
                    graph.node(*parent).slug()
                ),
                None => format!(
                    "{slug} still carries the starter body it was created with and groups nothing. It was created and never given meaning. Either write what it covers and reparent the children that belong to it, or delete_concept it."
                ),
            };
            NodeCandidate::about(graph, *id, "retire_unearned_node", 0.55, reason)
        })
        .collect();
    RowPage::new(found.len(), limit, rows)
}
