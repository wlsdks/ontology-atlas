//! `overview`, `schema` and `facets`: what the whole graph holds. Counts, the most connected
//! nodes, and the patterns of kind, relation and kind that its edges make.

use std::collections::HashMap;

use answer_format::collation::compare_text;
use indexmap::IndexMap;
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

use crate::compiled_graph::{CompiledGraph, NodeId, Target};
use crate::query::edge_rows::name_reached;
use crate::query::name_counts::{domain_counts, kind_counts, sorted_counts};
use crate::query::node_summary::NodeSummary;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;

const DEFAULT_OVERVIEW_LIMIT: usize = 10;
const DEFAULT_SCHEMA_LIMIT: usize = 50;

/// A node as the hub lists and the node scans show it: the summary and its total degree.
#[derive(Serialize)]
pub struct DegreeRow<'a> {
    #[serde(flatten)]
    summary: NodeSummary<'a>,
    degree: u32,
}

impl<'a> DegreeRow<'a> {
    pub fn of(graph: &'a CompiledGraph, id: NodeId) -> Self {
        Self {
            summary: NodeSummary::of(graph, id),
            degree: graph.node(id).degree(),
        }
    }
}

/// The `limit` most connected of `nodes`: by total degree, then by incoming degree, then by slug.
pub fn top_hubs_among(
    graph: &CompiledGraph,
    nodes: impl IntoIterator<Item = NodeId>,
    limit: usize,
) -> Vec<DegreeRow<'_>> {
    let mut nodes: Vec<NodeId> = nodes.into_iter().collect();
    nodes.sort_by(|left, right| {
        let (left_node, right_node) = (graph.node(*left), graph.node(*right));
        right_node
            .degree()
            .cmp(&left_node.degree())
            .then_with(|| right_node.in_degree.cmp(&left_node.in_degree))
            .then_with(|| left.cmp(right))
    });
    nodes
        .into_iter()
        .take(limit)
        .map(|id| DegreeRow::of(graph, id))
        .collect()
}

/// The `limit` most connected nodes of the graph.
pub fn top_hubs(graph: &CompiledGraph, limit: usize) -> Vec<DegreeRow<'_>> {
    top_hubs_among(graph, graph.node_ids(), limit)
}

#[derive(Serialize)]
struct EdgeExample<'a> {
    from: &'a str,
    to: &'a str,
    #[serde(rename = "ref")]
    reference: &'a str,
}

#[derive(Serialize)]
pub struct SchemaPattern<'a> {
    #[serde(rename = "fromKind")]
    from_kind: &'a str,
    relation: &'static str,
    #[serde(rename = "toKind")]
    to_kind: &'a str,
    count: usize,
    resolved: usize,
    external: usize,
    unresolved: usize,
    examples: Vec<EdgeExample<'a>>,
}

/// The patterns the edges make, most common first.
pub fn schema_patterns(graph: &CompiledGraph) -> Vec<SchemaPattern<'_>> {
    let mut patterns: Vec<SchemaPattern<'_>> = Vec::new();
    let mut at: HashMap<(&str, &str, &str), usize> = HashMap::new();
    for id in graph.edge_ids() {
        let edge = graph.edge(id);
        let from_kind = graph.node(edge.from).kind();
        let to_kind = match edge.target {
            Target::Node(node) => graph.node(node).kind(),
            Target::External => "external",
            Target::Unresolved => "unresolved",
        };
        let index = *at.entry((from_kind, edge.via, to_kind)).or_insert_with(|| {
            patterns.push(SchemaPattern {
                from_kind,
                relation: edge.via,
                to_kind,
                count: 0,
                resolved: 0,
                external: 0,
                unresolved: 0,
                examples: Vec::new(),
            });
            patterns.len() - 1
        });
        let Some(pattern) = patterns.get_mut(index) else {
            continue;
        };
        pattern.count += 1;
        match edge.target {
            Target::Node(_) => pattern.resolved += 1,
            Target::External => pattern.external += 1,
            Target::Unresolved => pattern.unresolved += 1,
        }
        if pattern.examples.len() < 3 {
            pattern.examples.push(EdgeExample {
                from: graph.node(edge.from).slug(),
                to: name_reached(graph, id),
                reference: &edge.reference,
            });
        }
    }
    patterns.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| compare_text(left.from_kind, right.from_kind))
            .then_with(|| compare_text(left.relation, right.relation))
            .then_with(|| compare_text(left.to_kind, right.to_kind))
    });
    patterns
}

#[derive(Serialize)]
struct OverviewGraph<'a> {
    nodes: usize,
    edges: usize,
    #[serde(rename = "resolvedEdges")]
    resolved_edges: usize,
    #[serde(rename = "externalEdges")]
    external_edges: usize,
    #[serde(rename = "unresolvedEdges")]
    unresolved_edges: usize,
    #[serde(rename = "referencedOnly")]
    referenced_only: usize,
    aliases: usize,
    #[serde(rename = "ambiguousAliases")]
    ambiguous_aliases: usize,
    issues: usize,
    #[serde(rename = "graphHash")]
    graph_hash: &'a str,
    #[serde(rename = "maxMtime")]
    max_mtime: f64,
}

#[derive(Serialize)]
pub struct OverviewAnswer<'a> {
    operation: &'static str,
    graph: OverviewGraph<'a>,
    #[serde(rename = "byKind")]
    by_kind: IndexMap<String, usize>,
    #[serde(rename = "byDomain")]
    by_domain: IndexMap<String, usize>,
    #[serde(rename = "byRelation")]
    by_relation: IndexMap<String, usize>,
    hubs: Vec<DegreeRow<'a>>,
}

pub fn overview<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<OverviewAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_OVERVIEW_LIMIT);
    let counts = graph.edge_counts();
    Ok(OverviewAnswer {
        operation: "overview",
        graph: OverviewGraph {
            nodes: graph.nodes().len(),
            edges: graph.edges().len(),
            resolved_edges: counts.resolved,
            external_edges: counts.external,
            unresolved_edges: counts.unresolved,
            referenced_only: counts.referenced_only,
            aliases: graph.aliases().len(),
            ambiguous_aliases: graph.ambiguous_aliases().len(),
            issues: graph.issues().len(),
            graph_hash: graph.graph_hash(),
            max_mtime: graph.max_mtime(),
        },
        by_kind: kind_counts(graph, graph.node_ids()),
        by_domain: domain_counts(graph, graph.node_ids()),
        by_relation: sorted_counts(graph.edges().iter().map(|edge| edge.via)),
        hubs: top_hubs(graph, limit),
    })
}

#[derive(Serialize)]
pub struct SchemaAnswer<'a> {
    operation: &'static str,
    #[serde(rename = "totalPatterns")]
    total_patterns: usize,
    limited: bool,
    patterns: Vec<SchemaPattern<'a>>,
}

pub fn schema<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<SchemaAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_SCHEMA_LIMIT);
    let mut patterns = schema_patterns(graph);
    let total = patterns.len();
    patterns.truncate(limit);
    Ok(SchemaAnswer {
        operation: "schema",
        total_patterns: total,
        limited: total > limit,
        patterns,
    })
}

#[derive(Serialize)]
struct FacetGraph {
    nodes: usize,
    edges: usize,
    #[serde(rename = "resolvedEdges")]
    resolved_edges: usize,
    #[serde(rename = "externalEdges")]
    external_edges: usize,
    #[serde(rename = "unresolvedEdges")]
    unresolved_edges: usize,
}

/// How many nodes have no, one, a few or many edges.
struct DegreeBuckets([usize; 5]);

impl DegreeBuckets {
    fn of(graph: &CompiledGraph) -> Self {
        let mut buckets = [0_usize; 5];
        for node in graph.nodes() {
            let at = match node.degree() {
                0 => 0,
                1 => 1,
                2..=4 => 2,
                5..=9 => 3,
                _ => 4,
            };
            if let Some(slot) = buckets.get_mut(at) {
                *slot += 1;
            }
        }
        Self(buckets)
    }
}

impl Serialize for DegreeBuckets {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(5))?;
        for (name, count) in ["0", "1", "2-4", "5-9", "10+"].iter().zip(self.0) {
            map.serialize_entry(name, &count)?;
        }
        map.end()
    }
}

#[derive(Serialize)]
struct FacetNodes<'a> {
    #[serde(rename = "byKind")]
    by_kind: IndexMap<String, usize>,
    #[serde(rename = "byDomain")]
    by_domain: IndexMap<String, usize>,
    #[serde(rename = "byDegreeBucket")]
    by_degree_bucket: DegreeBuckets,
    #[serde(rename = "topByDegree")]
    top_by_degree: Vec<DegreeRow<'a>>,
}

#[derive(Serialize)]
struct Resolution {
    resolved: usize,
    external: usize,
    unresolved: usize,
}

#[derive(Serialize)]
struct FacetEdges<'a> {
    #[serde(rename = "byRelation")]
    by_relation: IndexMap<String, usize>,
    #[serde(rename = "byResolution")]
    by_resolution: Resolution,
    #[serde(rename = "topPatterns")]
    top_patterns: Vec<SchemaPattern<'a>>,
}

#[derive(Serialize)]
pub struct FacetsAnswer<'a> {
    operation: &'static str,
    graph: FacetGraph,
    nodes: FacetNodes<'a>,
    edges: FacetEdges<'a>,
}

pub fn facets<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<FacetsAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_OVERVIEW_LIMIT);
    let counts = graph.edge_counts();
    let mut patterns = schema_patterns(graph);
    patterns.truncate(limit);
    Ok(FacetsAnswer {
        operation: "facets",
        graph: FacetGraph {
            nodes: graph.nodes().len(),
            edges: graph.edges().len(),
            resolved_edges: counts.resolved,
            external_edges: counts.external,
            unresolved_edges: counts.unresolved,
        },
        nodes: FacetNodes {
            by_kind: kind_counts(graph, graph.node_ids()),
            by_domain: domain_counts(graph, graph.node_ids()),
            by_degree_bucket: DegreeBuckets::of(graph),
            top_by_degree: top_hubs(graph, limit),
        },
        edges: FacetEdges {
            by_relation: sorted_counts(graph.edges().iter().map(|edge| edge.via)),
            by_resolution: Resolution {
                resolved: counts.resolved,
                external: counts.external,
                unresolved: counts.unresolved,
            },
            top_patterns: patterns,
        },
    })
}
