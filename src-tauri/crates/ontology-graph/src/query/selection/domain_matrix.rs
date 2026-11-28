//! `domain_matrix`: how the domains of a project, or of the whole graph, connect to one another.
//! Each node counts for the domain nearest to it, and each edge for the pair of domains it joins,
//! so an agent sees which responsibilities depend on which before it moves anything.

use std::collections::HashMap;

use answer_format::collation::compare_text;
use indexmap::IndexMap;
use serde::Serialize;

use super::relation_filter::EchoedRelations;
use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::domain_lookup::DomainLookup;
use crate::query::edge_rows::CompiledEdge;
use crate::query::name_counts::sorted_counts;
use crate::query::node_summary::NodeSummary;
use crate::query::operation_defaults::DOMAIN_MATRIX_LIMIT;
use crate::query::project_root::project_named_or_only;
use crate::query::query_error::QueryError;
use crate::query::relation_set::{allowed, public_relation_type, RelationSet};
use crate::query::request::QueryRequest;
use crate::query::scope::Scope;
use crate::query::walks::row_page::RowPage;

const EXAMPLES_PER_PAIR: usize = 3;

#[derive(Default)]
struct DomainCounts {
    nodes: usize,
    outgoing: usize,
    incoming: usize,
    self_edges: usize,
    external_edges: usize,
    unresolved_edges: usize,
}

#[derive(Serialize)]
struct DomainRow<'a> {
    slug: &'a str,
    node: NodeSummary<'a>,
    nodes: usize,
    outgoing: usize,
    incoming: usize,
    #[serde(rename = "selfEdges")]
    self_edges: usize,
    #[serde(rename = "externalEdges")]
    external_edges: usize,
    #[serde(rename = "unresolvedEdges")]
    unresolved_edges: usize,
}

#[derive(Default)]
struct PairTally {
    edges: Vec<EdgeId>,
}

#[derive(Serialize)]
struct Connection<'a> {
    from: &'a str,
    to: &'a str,
    count: usize,
    #[serde(rename = "byRelation")]
    by_relation: IndexMap<String, usize>,
    #[serde(rename = "byRelationType")]
    by_relation_type: IndexMap<String, usize>,
    #[serde(rename = "fromNode")]
    from_node: NodeSummary<'a>,
    #[serde(rename = "toNode")]
    to_node: NodeSummary<'a>,
    examples: Vec<CompiledEdge<'a>>,
}

#[derive(Serialize)]
struct MatrixSummary {
    domains: usize,
    nodes: usize,
    #[serde(rename = "assignedNodes")]
    assigned_nodes: usize,
    #[serde(rename = "unassignedNodes")]
    unassigned_nodes: usize,
    #[serde(rename = "crossDomainEdges")]
    cross_domain_edges: usize,
    #[serde(rename = "selfDomainEdges")]
    self_domain_edges: usize,
    #[serde(rename = "externalEdges")]
    external_edges: usize,
    #[serde(rename = "unresolvedEdges")]
    unresolved_edges: usize,
}

#[derive(Serialize)]
pub struct DomainMatrixAnswer<'a> {
    operation: &'static str,
    project: Option<&'a str>,
    filters: EchoedRelations,
    summary: MatrixSummary,
    domains: RowPage<DomainRow<'a>>,
    connections: RowPage<Connection<'a>>,
}

/// The edges of the scope that join two different domains, grouped by the pair they join.
struct Tally {
    domain_counts: HashMap<NodeId, DomainCounts>,
    pairs: HashMap<(NodeId, NodeId), PairTally>,
    cross: usize,
    own: usize,
    external: usize,
    unresolved: usize,
}

fn tally(
    graph: &CompiledGraph,
    scope: &Scope,
    types: Option<&RelationSet>,
    domain_for: &HashMap<NodeId, NodeId>,
    domains: &[NodeId],
) -> Tally {
    let mut tally = Tally {
        domain_counts: domains
            .iter()
            .map(|domain| (*domain, DomainCounts::default()))
            .collect(),
        pairs: HashMap::new(),
        cross: 0,
        own: 0,
        external: 0,
        unresolved: 0,
    };
    for domain in domain_for.values() {
        if let Some(counts) = tally.domain_counts.get_mut(domain) {
            counts.nodes += 1;
        }
    }
    for id in graph.edge_ids() {
        let edge = graph.edge(id);
        if !scope.contains(edge.from) || !allowed(types, edge.via) {
            continue;
        }
        let Some(from_domain) = domain_for.get(&edge.from).copied() else {
            continue;
        };
        if edge.is_external() {
            tally.external += 1;
            if let Some(counts) = tally.domain_counts.get_mut(&from_domain) {
                counts.external_edges += 1;
            }
            continue;
        }
        let Some(to) = edge.to().filter(|to| scope.contains(*to)) else {
            tally.unresolved += 1;
            if let Some(counts) = tally.domain_counts.get_mut(&from_domain) {
                counts.unresolved_edges += 1;
            }
            continue;
        };
        let Some(to_domain) = domain_for.get(&to).copied() else {
            continue;
        };
        if from_domain == to_domain {
            tally.own += 1;
            if let Some(counts) = tally.domain_counts.get_mut(&from_domain) {
                counts.self_edges += 1;
            }
            continue;
        }
        tally.cross += 1;
        if let Some(counts) = tally.domain_counts.get_mut(&from_domain) {
            counts.outgoing += 1;
        }
        if let Some(counts) = tally.domain_counts.get_mut(&to_domain) {
            counts.incoming += 1;
        }
        let pair = tally.pairs.entry((from_domain, to_domain)).or_default();
        pair.edges.push(id);
    }
    tally
}

pub fn domain_matrix<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<DomainMatrixAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DOMAIN_MATRIX_LIMIT);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let named = request
        .project
        .as_deref()
        .or(request.slug.as_deref())
        .filter(|name| !answer_format::whitespace::trim(name).is_empty());
    let project = named
        .map(|name| project_named_or_only(graph, Some(name), "domain_matrix"))
        .transpose()?;
    let scope = match project {
        Some(root) => Scope::of(graph, root),
        None => Scope::everything(graph),
    };
    let domains = scope.of_kind(graph, "domain");
    let mut lookup = DomainLookup::within(graph, &scope);
    let domain_for: HashMap<NodeId, NodeId> = scope
        .nodes
        .iter()
        .filter_map(|&id| lookup.of(id).map(|domain| (id, domain)))
        .collect();
    let tallied = tally(graph, &scope, types.as_ref(), &domain_for, &domains);

    let mut pairs: Vec<((NodeId, NodeId), &PairTally)> = tallied
        .pairs
        .iter()
        .map(|(pair, tally)| (*pair, tally))
        .collect();
    pairs.sort_by(
        |((left_from, left_to), left), ((right_from, right_to), right)| {
            right
                .edges
                .len()
                .cmp(&left.edges.len())
                .then_with(|| {
                    compare_text(
                        graph.node(*left_from).slug(),
                        graph.node(*right_from).slug(),
                    )
                })
                .then_with(|| {
                    compare_text(graph.node(*left_to).slug(), graph.node(*right_to).slug())
                })
        },
    );
    let total_pairs = pairs.len();
    let connections: Vec<Connection<'a>> = pairs
        .iter()
        .take(limit)
        .map(|((from, to), pair)| Connection {
            from: graph.node(*from).slug(),
            to: graph.node(*to).slug(),
            count: pair.edges.len(),
            by_relation: sorted_counts(pair.edges.iter().map(|id| graph.edge(*id).via)),
            by_relation_type: sorted_counts(
                pair.edges
                    .iter()
                    .map(|id| public_relation_type(graph.edge(*id).via)),
            ),
            from_node: NodeSummary::of(graph, *from),
            to_node: NodeSummary::of(graph, *to),
            examples: pair
                .edges
                .iter()
                .take(EXAMPLES_PER_PAIR)
                .map(|id| CompiledEdge::of(graph, *id))
                .collect(),
        })
        .collect();

    let domain_rows: Vec<DomainRow<'a>> = domains
        .iter()
        .take(limit)
        .map(|domain| {
            let counts = tallied.domain_counts.get(domain);
            let count = |read: fn(&DomainCounts) -> usize| counts.map_or(0, read);
            DomainRow {
                slug: graph.node(*domain).slug(),
                node: NodeSummary::of(graph, *domain),
                nodes: count(|counts| counts.nodes),
                outgoing: count(|counts| counts.outgoing),
                incoming: count(|counts| counts.incoming),
                self_edges: count(|counts| counts.self_edges),
                external_edges: count(|counts| counts.external_edges),
                unresolved_edges: count(|counts| counts.unresolved_edges),
            }
        })
        .collect();

    Ok(DomainMatrixAnswer {
        operation: "domain_matrix",
        project: project.map(|root| graph.node(root).slug()),
        filters: EchoedRelations::of(types.as_ref()),
        summary: MatrixSummary {
            domains: domains.len(),
            nodes: scope.nodes.len(),
            assigned_nodes: domain_for.len(),
            unassigned_nodes: scope.nodes.len() - domain_for.len(),
            cross_domain_edges: tallied.cross,
            self_domain_edges: tallied.own,
            external_edges: tallied.external,
            unresolved_edges: tallied.unresolved,
        },
        domains: RowPage::new(domains.len(), limit, domain_rows),
        connections: RowPage::new(total_pairs, limit, connections),
    })
}
