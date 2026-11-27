//! `recommend_relations`: the domain links the vault's own `domain:` fields imply and the domain
//! does not state back. A capability or element names its domain; the domain should list it, and
//! the one thing every such row proposes is that single `add_relations` call.

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use super::proposed_action::ProposedAction;
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::domain_lookup::named_domain;
use crate::query::node_summary::NodeSummary;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;
use vault_document::frontmatter::Value;

const DEFAULT_LIMIT: usize = 50;

#[derive(Serialize)]
pub struct RecommendationNodes<'a> {
    from: NodeSummary<'a>,
    to: NodeSummary<'a>,
}

impl RecommendationNodes<'_> {
    pub fn source_slug(&self) -> &str {
        self.from.slug()
    }

    pub fn target_slug(&self) -> &str {
        self.to.slug()
    }
}

#[derive(Serialize)]
pub struct Recommendation<'a> {
    kind: &'static str,
    pub(crate) score: f64,
    pub(crate) from: &'a str,
    pub(crate) to: &'a str,
    relation: &'static str,
    pub(crate) reason: String,
    #[serde(rename = "proposedAction")]
    pub(crate) proposed_action: ProposedAction,
    pub(crate) nodes: RecommendationNodes<'a>,
}

/// Every missing link, counted; only the first `limit` are written out.
pub struct Recommendations<'a> {
    pub total: usize,
    pub rows: Vec<Recommendation<'a>>,
}

/// Which relation a domain links its member by: `capabilities` or `elements`.
fn relation_for(kind: &str) -> Option<&'static str> {
    match kind {
        "capability" => Some("capabilities"),
        "element" => Some("elements"),
        _ => None,
    }
}

/// The resolved edges a domain declares, indexed by relation, for as long as one query asks.
struct DeclaredLinks<'a> {
    graph: &'a CompiledGraph,
    by_source: HashMap<NodeId, HashSet<(&'static str, NodeId)>>,
}

impl<'a> DeclaredLinks<'a> {
    fn new(graph: &'a CompiledGraph) -> Self {
        Self {
            graph,
            by_source: HashMap::new(),
        }
    }

    fn has(&mut self, from: NodeId, to: NodeId, via: &'static str) -> bool {
        let graph = self.graph;
        self.by_source
            .entry(from)
            .or_insert_with(|| {
                graph
                    .outgoing(from)
                    .iter()
                    .filter_map(|id| {
                        let edge = graph.edge(*id);
                        edge.to().map(|target| (edge.via, target))
                    })
                    .collect()
            })
            .contains(&(via, to))
    }
}

/// An element that something already owns through `elements:` or `contains:` needs no direct
/// domain link: the domain's `domain:` field records membership, ownership is stated elsewhere.
fn is_owned(graph: &CompiledGraph, node: NodeId) -> bool {
    graph.incoming(node).iter().any(|id| {
        let via = graph.edge(*id).via;
        via == "elements" || via == "contains"
    })
}

/// The links missing for capabilities and elements, of `kind` only when one is asked for.
pub fn recommend<'a>(
    graph: &'a CompiledGraph,
    kind: Option<&str>,
    limit: usize,
) -> Recommendations<'a> {
    let mut links = DeclaredLinks::new(graph);
    let mut rows: Vec<Recommendation<'a>> = Vec::new();
    let mut total = 0;
    for id in graph.node_ids() {
        let node = graph.node(id);
        let Some(relation) = relation_for(node.kind()) else {
            continue;
        };
        if kind.is_some_and(|wanted| node.kind() != wanted) {
            continue;
        }
        let Some(domain) = named_domain(graph, id) else {
            continue;
        };
        if node.kind() == "element" && is_owned(graph, id) {
            continue;
        }
        if links.has(domain, id, relation) || links.has(domain, id, "contains") {
            continue;
        }
        total += 1;
        if rows.len() >= limit {
            continue;
        }
        let domain_name = match node.domain() {
            Some(Value::Text(text)) => text.as_str(),
            _ => "",
        };
        let domain_slug = graph.node(domain).slug();
        rows.push(Recommendation {
            kind: "missing_domain_containment",
            score: 1.0,
            from: domain_slug,
            to: node.slug(),
            relation,
            reason: format!(
                "{} has domain \"{domain_name}\", but {domain_slug} does not link back via {relation}.",
                node.slug()
            ),
            proposed_action: ProposedAction::add_relation(domain_slug, node.slug(), relation),
            nodes: RecommendationNodes {
                from: NodeSummary::of(graph, domain),
                to: NodeSummary::of(graph, id),
            },
        });
    }
    Recommendations { total, rows }
}

#[derive(Serialize)]
pub struct RecommendRelationsAnswer<'a> {
    operation: &'static str,
    mode: &'static str,
    #[serde(rename = "totalRecommendations")]
    total_recommendations: usize,
    limited: bool,
    recommendations: Vec<Recommendation<'a>>,
}

impl<'a> RecommendRelationsAnswer<'a> {
    pub fn of(found: Recommendations<'a>, limit: usize) -> Self {
        Self {
            operation: "recommend_relations",
            mode: "domain_containment",
            total_recommendations: found.total,
            limited: found.total > limit,
            recommendations: found.rows,
        }
    }

    pub fn total(&self) -> usize {
        self.total_recommendations
    }

    pub fn rows(&self) -> &[Recommendation<'a>] {
        &self.recommendations
    }
}

pub fn recommend_relations<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<RecommendRelationsAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let found = recommend(graph, request.selection.arguments.kind.as_deref(), limit);
    Ok(RecommendRelationsAnswer::of(found, limit))
}
