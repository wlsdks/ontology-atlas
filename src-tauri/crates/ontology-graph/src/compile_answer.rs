//! What `compile_ontology` answers: the counts and the hash alone, or the graph's arrays in pages,
//! or the arrays with the lookup tables built from them.

use std::collections::HashMap;

use answer_format::collation::compare_text;
use answer_format::pagination::Pagination;
use indexmap::IndexMap;
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

use crate::compiled_graph::{CompiledGraph, Edge, EdgeView, Node, NodeId};
use crate::graph_hash::COMPILER_VERSION;

/// The most nodes or edges one page of `compile_ontology` holds.
pub const COMPILE_PAGE_MAX: usize = 500;

/// What the call asked for. A number or flag that was not sent is `None`, which is not the same
/// as zero or `false`: sending `nodesOffset: 0` asks for the arrays.
#[derive(Debug, Clone, Copy, Default)]
pub struct CompileRequest {
    pub include_indexes: Option<bool>,
    pub summary: Option<bool>,
    pub full: Option<bool>,
    pub nodes_limit: Option<usize>,
    pub nodes_offset: Option<usize>,
    pub edges_limit: Option<usize>,
    pub edges_offset: Option<usize>,
}

impl CompileRequest {
    fn asks_for_arrays(&self) -> bool {
        self.full == Some(true)
            || self.include_indexes == Some(true)
            || self.nodes_limit.is_some()
            || self.nodes_offset.is_some()
            || self.edges_limit.is_some()
            || self.edges_offset.is_some()
    }
}

/// How the answer is shaped, chosen from the request.
pub enum CompileAnswer<'a> {
    /// `summary: true`: the counts, nothing around them.
    Summary(&'a CompiledGraph),
    /// No argument asked for arrays: the counts, and how to ask for the arrays.
    SummaryWithDelivery(&'a CompiledGraph),
    Arrays(ArraysAnswer<'a>),
}

pub struct ArraysAnswer<'a> {
    graph: &'a CompiledGraph,
    nodes: Window,
    edges: Window,
    include_indexes: bool,
}

pub fn compile_answer<'a>(graph: &'a CompiledGraph, request: &CompileRequest) -> CompileAnswer<'a> {
    if request.summary == Some(true) {
        return CompileAnswer::Summary(graph);
    }
    if !request.asks_for_arrays() {
        return CompileAnswer::SummaryWithDelivery(graph);
    }
    CompileAnswer::Arrays(ArraysAnswer {
        graph,
        nodes: Window::of(
            graph.nodes().len(),
            request.nodes_offset.unwrap_or(0),
            request.nodes_limit,
        ),
        edges: Window::of(
            graph.edges().len(),
            request.edges_offset.unwrap_or(0),
            request.edges_limit,
        ),
        include_indexes: request.include_indexes == Some(true),
    })
}

/// The part of a list one page shows.
#[derive(Debug, Clone, Copy)]
struct Window {
    start: usize,
    end: usize,
    total: usize,
    limit: Option<usize>,
    paginated: bool,
}

impl Window {
    fn of(total: usize, offset: usize, limit: Option<usize>) -> Self {
        let start = offset.min(total);
        let end = limit.map_or(total, |limit| start.saturating_add(limit).min(total));
        Self {
            start,
            end,
            total,
            limit,
            paginated: limit.is_some() || offset != 0,
        }
    }

    fn meta(&self) -> Pagination {
        Pagination::of(
            self.start,
            self.limit.unwrap_or(self.total - self.start),
            self.total,
            self.end - self.start,
        )
    }
}

/// How many nodes hold each value of a key, in the order of the key's text.
fn counts_by(values: impl Iterator<Item = String>) -> IndexMap<String, usize> {
    let mut counts: Vec<(String, usize)> = Vec::new();
    let mut at: HashMap<String, usize> = HashMap::new();
    for value in values {
        match at.get(&value) {
            Some(index) => {
                if let Some((_, count)) = counts.get_mut(*index) {
                    *count += 1;
                }
            }
            None => {
                at.insert(value.clone(), counts.len());
                counts.push((value, 1));
            }
        }
    }
    counts.sort_by(|left, right| compare_text(&left.0, &right.0));
    counts.into_iter().collect()
}

fn by_kind(graph: &CompiledGraph) -> IndexMap<String, usize> {
    counts_by(graph.nodes().iter().map(|node| node.kind().to_string()))
}

fn by_domain(graph: &CompiledGraph) -> IndexMap<String, usize> {
    counts_by(
        graph
            .nodes()
            .iter()
            .filter_map(|node| node.domain_name().map(String::from)),
    )
}

fn write_counts<M: SerializeMap>(map: &mut M, graph: &CompiledGraph) -> Result<(), M::Error> {
    let counts = graph.edge_counts();
    map.serialize_entry("edgeCount", &graph.edges().len())?;
    map.serialize_entry("resolvedEdgeCount", &counts.resolved)?;
    map.serialize_entry("externalEdgeCount", &counts.external)?;
    map.serialize_entry("unresolvedEdgeCount", &counts.unresolved)?;
    map.serialize_entry("referencedOnlyCount", &counts.referenced_only)?;
    map.serialize_entry("aliasCount", &graph.aliases().len())?;
    map.serialize_entry("ambiguousAliasCount", &graph.ambiguous_aliases().len())?;
    map.serialize_entry("issueCount", &graph.issues().len())?;
    map.serialize_entry(
        "canonicalizationActionCount",
        &graph.canonicalization_actions().len(),
    )?;
    map.serialize_entry("byKind", &by_kind(graph))?;
    map.serialize_entry("byDomain", &by_domain(graph))
}

fn write_head<M: SerializeMap>(map: &mut M, graph: &CompiledGraph) -> Result<(), M::Error> {
    map.serialize_entry("version", &COMPILER_VERSION)?;
    map.serialize_entry("graphHash", graph.graph_hash())?;
    map.serialize_entry("maxMtime", &graph.max_mtime())?;
    map.serialize_entry("nodeCount", &graph.nodes().len())
}

struct SummaryBody<'a>(&'a CompiledGraph);

impl Serialize for SummaryBody<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(None)?;
        write_summary(&mut map, self.0)?;
        map.end()
    }
}

fn write_summary<M: SerializeMap>(map: &mut M, graph: &CompiledGraph) -> Result<(), M::Error> {
    write_head(map, graph)?;
    map.serialize_entry("skippedNonNodeCount", &graph.skipped_non_node_count())?;
    write_counts(map, graph)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Delivery {
    selection: &'static str,
    reason: &'static str,
    full_arguments: FullArguments,
    page_arguments: PageArguments,
}

#[derive(Serialize)]
struct FullArguments {
    full: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PageArguments {
    nodes_limit: usize,
    edges_limit: usize,
}

impl Serialize for CompileAnswer<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Summary(graph) => SummaryBody(graph).serialize(serializer),
            Self::SummaryWithDelivery(graph) => {
                let mut map = serializer.serialize_map(None)?;
                map.serialize_entry(
                    "delivery",
                    &Delivery {
                        selection: "summary_default",
                        reason: "No argument asked for arrays, so this is the bounded summary: counts, graphHash and aggregates.",
                        full_arguments: FullArguments { full: true },
                        page_arguments: PageArguments {
                            nodes_limit: COMPILE_PAGE_MAX,
                            edges_limit: COMPILE_PAGE_MAX,
                        },
                    },
                )?;
                write_summary(&mut map, graph)?;
                map.end()
            }
            Self::Arrays(answer) => answer.serialize(serializer),
        }
    }
}

struct Nodes<'a>(&'a CompiledGraph, Window);

impl Serialize for Nodes<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let slice = self
            .0
            .nodes()
            .get(self.1.start..self.1.end)
            .unwrap_or_default();
        serializer.collect_seq(slice)
    }
}

struct Edges<'a>(&'a CompiledGraph, Window);

impl Serialize for Edges<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_seq((self.1.start..self.1.end).map(|index| {
            self.0
                .edge_view(crate::compiled_graph::EdgeId::from_index(index))
        }))
    }
}

impl Serialize for ArraysAnswer<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let graph = self.graph;
        let mut map = serializer.serialize_map(None)?;
        write_head(&mut map, graph)?;
        write_counts(&mut map, graph)?;
        map.serialize_entry("nodes", &Nodes(graph, self.nodes))?;
        map.serialize_entry("edges", &Edges(graph, self.edges))?;
        if self.nodes.paginated {
            map.serialize_entry("nodesPagination", &self.nodes.meta())?;
        }
        if self.edges.paginated {
            map.serialize_entry("edgesPagination", &self.edges.meta())?;
        }
        map.serialize_entry("aliases", &graph.aliases())?;
        map.serialize_entry("ambiguousAliases", graph.ambiguous_aliases())?;
        map.serialize_entry("issues", graph.issues())?;
        map.serialize_entry("canonicalizationActions", graph.canonicalization_actions())?;
        if self.include_indexes {
            map.serialize_entry("indexes", &Indexes::of(graph))?;
        }
        map.serialize_entry("summary", &Recap(graph))?;
        map.end()
    }
}

/// The counts again, under the names the earlier answers of this tool gave them.
struct Recap<'a>(&'a CompiledGraph);

impl Serialize for Recap<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let graph = self.0;
        let counts = graph.edge_counts();
        let mut map = serializer.serialize_map(Some(10))?;
        map.serialize_entry("nodes", &graph.nodes().len())?;
        map.serialize_entry("edges", &graph.edges().len())?;
        map.serialize_entry("graphHash", graph.graph_hash())?;
        map.serialize_entry("maxMtime", &graph.max_mtime())?;
        map.serialize_entry("resolvedEdges", &counts.resolved)?;
        map.serialize_entry("externalEdges", &counts.external)?;
        map.serialize_entry("unresolvedEdges", &counts.unresolved)?;
        map.serialize_entry("aliases", &graph.aliases().len())?;
        map.serialize_entry("ambiguousAliases", &graph.ambiguous_aliases().len())?;
        map.serialize_entry("issues", &graph.issues().len())?;
        map.end()
    }
}

/// The lookup tables an agent may ask for beside the arrays.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Indexes<'a> {
    out: IndexMap<&'a str, Vec<String>>,
    #[serde(rename = "in")]
    incoming: IndexMap<&'a str, Vec<String>>,
    by_kind: IndexMap<&'a str, Vec<&'a str>>,
    by_domain: IndexMap<&'a str, Vec<&'a str>>,
    edge_by_id: IndexMap<String, EdgeView<'a>>,
    alias_to_slug: IndexMap<&'a str, &'a str>,
    uid_to_slug: IndexMap<&'a str, &'a str>,
    slug_to_uid: IndexMap<&'a str, &'a str>,
    merged_uid_to_slug: IndexMap<&'a str, &'a str>,
}

/// Edge ids listed under the node `key_of` gives each edge, each list in edge order, the nodes in
/// the order their first edge appears.
fn edge_ids_by_node<'a>(
    graph: &'a CompiledGraph,
    ids: &[String],
    key_of: impl Fn(&Edge) -> Option<NodeId>,
) -> IndexMap<&'a str, Vec<String>> {
    let mut lists: IndexMap<&'a str, Vec<String>> = IndexMap::new();
    for (edge, id) in graph.edges().iter().zip(ids) {
        let Some(node) = key_of(edge) else { continue };
        lists
            .entry(graph.node(node).slug())
            .or_default()
            .push(id.clone());
    }
    lists
}

/// Slugs listed under the text `key_of` gives each node, the keys in collation order and the
/// slugs in node order.
fn slugs_by<'a>(
    graph: &'a CompiledGraph,
    key_of: impl Fn(&'a Node) -> Option<&'a str>,
) -> IndexMap<&'a str, Vec<&'a str>> {
    let mut groups: IndexMap<&'a str, Vec<&'a str>> = IndexMap::new();
    for node in graph.nodes() {
        let Some(key) = key_of(node) else { continue };
        groups.entry(key).or_default().push(node.slug());
    }
    groups.sort_by(|left, _, right, _| compare_text(left, right));
    groups
}

impl<'a> Indexes<'a> {
    fn of(graph: &'a CompiledGraph) -> Self {
        let ids: Vec<String> = graph
            .edge_ids()
            .map(|id| graph.edge_view(id).id())
            .collect();
        let mut by_uid: Vec<&Node> = graph.nodes().iter().collect();
        by_uid.sort_by(|left, right| compare_text(left.uid(), right.uid()));
        let mut merged: Vec<(&str, &str)> = graph
            .nodes()
            .iter()
            .flat_map(|node| {
                node.merged_uids()
                    .iter()
                    .map(move |uid| (uid.as_str(), node.slug()))
            })
            .collect();
        merged.sort_by(|left, right| compare_text(left.0, right.0));
        Self {
            out: edge_ids_by_node(graph, &ids, |edge| Some(edge.from)),
            incoming: edge_ids_by_node(graph, &ids, Edge::to),
            by_kind: slugs_by(graph, |node| Some(node.kind())),
            by_domain: slugs_by(graph, Node::domain_name),
            edge_by_id: ids
                .into_iter()
                .zip(graph.edge_ids())
                .map(|(id, edge)| (id, graph.edge_view(edge)))
                .collect(),
            alias_to_slug: graph
                .aliases()
                .iter()
                .map(|entry| (entry.alias, entry.slug))
                .collect(),
            uid_to_slug: by_uid
                .iter()
                .map(|node| (node.uid(), node.slug()))
                .collect(),
            slug_to_uid: by_uid
                .iter()
                .map(|node| (node.slug(), node.uid()))
                .collect(),
            merged_uid_to_slug: merged.into_iter().collect(),
        }
    }
}
