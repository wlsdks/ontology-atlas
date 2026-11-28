//! `query_plan`: what another operation would cost on this graph, said before it is run. A plan
//! resolves the names the call gives, counts what the search would look at, and answers with the
//! arguments the operation would use (its own defaults, from `operation_defaults`), a cost class
//! and a call to send. It runs no operation and writes nothing.
//!
//! The counts come from the same edges and the same filters the operations use, so a plan and an
//! answer cannot disagree about what a call touches.

mod cost_class;
mod cost_estimate;
mod execution_advice;
mod planned_arguments;
mod traversal_estimate;

use serde::Serialize;

use self::cost_class::CostClass;
use self::cost_estimate::CostEstimate;
use self::execution_advice::ExecutionAdvice;
use self::planned_arguments::{ArgumentValue, PlannedArguments, SuggestedCall};
use self::traversal_estimate::estimate_traversal;
use crate::compiled_graph::CompiledGraph;
use crate::query::node_resolution::resolve;
use crate::query::operation::Operation;
use crate::query::operation_defaults::{
    default_limit, neighbors_direction, DEPENDENCY_IMPACT, MATCH_NODES_LIMIT, NEIGHBORS_LIMIT,
    PATH_MAX_HOPS, REACHABILITY, SUBGRAPH,
};
use crate::query::query_error::QueryError;
use crate::query::relation_set::{public_relation_type, RelationSet};
use crate::query::request::{Direction, QueryRequest};
use crate::query::selection::SelectionOperation;
use crate::query::selection::count_matching_nodes;
use crate::query::walks::impact::refuse_structural_types;
use crate::query::walks::neighbors::count_filtered_edges;
use crate::query::walks::WalkOperation;

const NODE_KINDS: [&str; 6] = [
    "project",
    "domain",
    "capability",
    "element",
    "document",
    "vault-readme",
];

#[derive(Serialize)]
struct PlannedGraph<'a> {
    nodes: usize,
    edges: usize,
    #[serde(rename = "resolvedEdges")]
    resolved_edges: usize,
    #[serde(rename = "graphHash")]
    graph_hash: &'a str,
}

#[derive(Serialize)]
pub struct PlanAnswer<'a> {
    operation: &'static str,
    #[serde(rename = "targetOperation")]
    target_operation: &'static str,
    #[serde(rename = "sideEffect")]
    side_effect: bool,
    graph: PlannedGraph<'a>,
    normalized: PlannedArguments,
    #[serde(rename = "indexesUsed")]
    indexes_used: Vec<&'static str>,
    estimate: CostEstimate,
    warnings: Vec<String>,
    execution: ExecutionAdvice,
}

/// What reading a call for one family of operations gives: the arguments as the operation will
/// take them, the structures it would use, the cost, and the warnings.
struct Reading {
    arguments: PlannedArguments,
    indexes: Vec<&'static str>,
    estimate: CostEstimate,
    warnings: Vec<String>,
}

/// The relations a call names, as the names an agent writes them in, sorted.
fn public_names(set: Option<&RelationSet>) -> ArgumentValue {
    let Some(set) = set else {
        return ArgumentValue::Absent;
    };
    let mut names: Vec<&str> = set
        .sorted_names()
        .into_iter()
        .map(public_relation_type)
        .collect();
    names.sort_unstable();
    ArgumentValue::names(&names)
}

fn adjacency_indexes(direction: Direction) -> Vec<&'static str> {
    match direction {
        Direction::Incoming => vec!["in"],
        Direction::Outgoing => vec!["out"],
        Direction::Both | Direction::Undirected => vec!["in", "out"],
    }
}

fn check_kind(
    value: Option<&String>,
    name: &str,
    allowed_kinds: &'static [&'static str],
) -> Result<(), QueryError> {
    match value {
        Some(kind) if !allowed_kinds.contains(&kind.as_str()) => {
            Err(QueryError::NotAnAllowedValue {
                name: name.to_string(),
                received: kind.clone(),
                allowed: allowed_kinds.to_vec(),
            })
        }
        _ => Ok(()),
    }
}

/// The rows an operation would list: the call's `limit`, or the operation's default when it has
/// one. A plan states no `limit` for an operation that has none and was sent none.
fn limit_of(target: Operation, request: &QueryRequest) -> Option<usize> {
    request.limit.or_else(|| default_limit(target))
}

/// The head every plan states: the operation, the relations, and the rows.
fn head(target: Operation, types: ArgumentValue, limit: Option<usize>) -> PlannedArguments {
    let mut arguments = PlannedArguments::default();
    arguments.put("targetOperation", ArgumentValue::text(target.name()));
    arguments.put("types", types);
    arguments.put("limit", ArgumentValue::of_count(limit));
    arguments
}

fn read_neighbors(graph: &CompiledGraph, request: &QueryRequest) -> Result<Reading, QueryError> {
    let center = resolve(graph, request.slug.as_deref(), "slug")?;
    let direction = neighbors_direction(request);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let limit = request.limit.unwrap_or(NEIGHBORS_LIMIT);
    let rows = count_filtered_edges(graph, center, request, types.as_ref());
    let mut arguments = head(
        Operation::Walk(WalkOperation::Neighbors),
        public_names(types.as_ref()),
        Some(limit),
    );
    arguments.put("slug", ArgumentValue::text(graph.node(center).slug()));
    arguments.put("direction", ArgumentValue::text(direction_name(direction)));
    // The flags are stated only when set, so a plan never drops the edges the call asked for.
    for (name, flag) in [
        ("includeExternal", request.include_external),
        ("includeUnresolved", request.include_unresolved),
    ] {
        if flag == Some(true) {
            arguments.put(name, ArgumentValue::Flag(true));
        }
    }
    let mut indexes = adjacency_indexes(direction);
    if types.is_some() {
        indexes.push("edge.type filter");
    }
    Ok(Reading {
        arguments,
        indexes,
        estimate: CostEstimate::AdjacencyLookup {
            strategy: "adjacency_lookup",
            edge_scans: rows,
            result_upper_bound: rows.min(limit),
            cost_class: CostClass::of(rows as f64),
        },
        warnings: Vec::new(),
    })
}

fn direction_name(direction: Direction) -> &'static str {
    match direction {
        Direction::Incoming => "incoming",
        Direction::Outgoing => "outgoing",
        Direction::Both => "both",
        Direction::Undirected => "undirected",
    }
}

fn read_paths(
    graph: &CompiledGraph,
    request: &QueryRequest,
    target: WalkOperation,
) -> Result<Reading, QueryError> {
    let from = resolve(graph, request.from.as_deref(), "from")?;
    let to = resolve(graph, request.to.as_deref(), "to")?;
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let direction = Direction::for_paths(request.direction);
    let max_hops = request.max_hops.unwrap_or(PATH_MAX_HOPS);
    let limit = limit_of(Operation::Walk(target), request);
    let traversal = estimate_traversal(graph, from, direction, types.as_ref(), max_hops);
    let mut arguments = head(Operation::Walk(target), public_names(types.as_ref()), limit);
    arguments.put("from", ArgumentValue::text(graph.node(from).slug()));
    arguments.put("to", ArgumentValue::text(graph.node(to).slug()));
    arguments.put("direction", ArgumentValue::text(direction_name(direction)));
    arguments.put("maxHops", ArgumentValue::Count(max_hops));
    let mut indexes = adjacency_indexes(direction);
    indexes.push("aliasToSlug");
    if types.is_some() {
        indexes.push("edge.type filter");
    }
    let potential = traversal.potential_path_upper_bound;
    let cost_class = CostClass::of(traversal.edge_scans as f64 + potential);
    Ok(Reading {
        arguments,
        indexes,
        estimate: CostEstimate::PathSearch {
            strategy: "bounded_bfs",
            edge_scans: traversal.edge_scans,
            reachable_within_depth: traversal.reachable_within_depth,
            frontier_by_depth: traversal.frontier_by_depth,
            potential_path_upper_bound: potential,
            result_upper_bound: 1.0,
            cost_class,
        },
        warnings: Vec::new(),
    })
}

fn read_expansion(
    graph: &CompiledGraph,
    request: &QueryRequest,
    target: WalkOperation,
) -> Result<Reading, QueryError> {
    let defaults = match target {
        WalkOperation::Reachability => &REACHABILITY,
        WalkOperation::Subgraph => &SUBGRAPH,
        _ => &DEPENDENCY_IMPACT,
    };
    let start = resolve(graph, request.slug.as_deref(), "slug")?;
    let dependencies_only = matches!(target, WalkOperation::Impact | WalkOperation::BlastRadius);
    let types = if dependencies_only {
        refuse_structural_types(request)?;
        Some(RelationSet::dependencies())
    } else {
        RelationSet::parse(request.types.as_deref(), "types")?
    };
    let direction = defaults.direction(request);
    let depth = defaults.depth(request);
    let limit = defaults.limit(request);
    let traversal = estimate_traversal(graph, start, direction, types.as_ref(), depth);
    let mut arguments = head(
        Operation::Walk(target),
        public_names(types.as_ref()),
        Some(limit),
    );
    arguments.put("slug", ArgumentValue::text(graph.node(start).slug()));
    arguments.put("direction", ArgumentValue::text(direction_name(direction)));
    arguments.put("depth", ArgumentValue::Count(depth));
    let mut indexes = adjacency_indexes(direction);
    if types.is_some() {
        indexes.push("edge.type filter");
    }
    Ok(Reading {
        arguments,
        indexes,
        estimate: CostEstimate::GraphExpansion {
            strategy: "bounded_graph_expansion",
            edge_scans: traversal.edge_scans,
            reachable_within_depth: traversal.reachable_within_depth,
            result_upper_bound: traversal.reachable_within_depth.min(limit),
            cost_class: CostClass::of(traversal.edge_scans as f64),
            frontier_by_depth: traversal.frontier_by_depth,
        },
        warnings: Vec::new(),
    })
}

fn read_match_nodes(graph: &CompiledGraph, request: &QueryRequest) -> Result<Reading, QueryError> {
    let selected = &request.selection.arguments;
    check_kind(selected.kind.as_ref(), "kind", &NODE_KINDS)?;
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let limit = request.limit.unwrap_or(MATCH_NODES_LIMIT);
    let total = count_matching_nodes(graph, request);
    let mut arguments = head(
        Operation::Selection(SelectionOperation::MatchNodes),
        public_names(types.as_ref()),
        Some(limit),
    );
    arguments.put("kind", ArgumentValue::of_text(selected.kind.as_deref()));
    arguments.put("domain", ArgumentValue::of_text(selected.domain.as_deref()));
    arguments.put("hasIncoming", ArgumentValue::of_flag(selected.has_incoming));
    arguments.put("hasOutgoing", ArgumentValue::of_flag(selected.has_outgoing));
    arguments.put(
        "sort",
        ArgumentValue::text(selected.sort.unwrap_or_default().name()),
    );
    let nodes = graph.nodes().len();
    Ok(Reading {
        arguments,
        indexes: vec!["nodes"],
        estimate: CostEstimate::NodeScan {
            strategy: "node_scan",
            node_scans: nodes,
            total_matches: total,
            result_upper_bound: total.min(limit),
            cost_class: CostClass::of(nodes as f64),
        },
        warnings: Vec::new(),
    })
}

/// Every other operation reads the whole graph. The plan states the arguments the call sent, so
/// the call it suggests names the node or the project the operation needs.
fn read_whole_graph(
    graph: &CompiledGraph,
    request: &QueryRequest,
    target: Operation,
) -> Result<Reading, QueryError> {
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let mut arguments = head(
        target,
        public_names(types.as_ref()),
        limit_of(target, request),
    );
    let selected = &request.selection.arguments;
    let sent_text = |name| match name {
        "slug" => request.slug.as_deref(),
        "from" => request.from.as_deref(),
        "to" => request.to.as_deref(),
        "project" => request.project.as_deref(),
        "kind" => selected.kind.as_deref(),
        "domain" => selected.domain.as_deref(),
        _ => None,
    };
    for name in ["slug", "from", "to", "project", "kind", "domain"] {
        if let Some(text) = sent_text(name) {
            arguments.put(name, ArgumentValue::text(text));
        }
    }
    if let Some(direction) = request.direction {
        arguments.put("direction", ArgumentValue::text(direction_name(direction)));
    }
    for (name, count) in [("depth", request.depth), ("maxHops", request.max_hops)] {
        if let Some(count) = count {
            arguments.put(name, ArgumentValue::Count(count));
        }
    }
    if let Some(pattern) = &request.pattern {
        arguments.put("pattern", ArgumentValue::Names(pattern.clone()));
    }
    let nodes = graph.nodes().len();
    let edges = graph.edges().len();
    Ok(Reading {
        arguments,
        indexes: vec!["compiled_artifact"],
        estimate: CostEstimate::AggregateScan {
            strategy: "aggregate_scan",
            node_scans: nodes,
            edge_scans: edges,
            cost_class: CostClass::of((nodes + edges) as f64),
        },
        warnings: Vec::new(),
    })
}

fn read(
    graph: &CompiledGraph,
    request: &QueryRequest,
    target: Operation,
) -> Result<Reading, QueryError> {
    match target {
        Operation::Walk(WalkOperation::Neighbors) => read_neighbors(graph, request),
        Operation::Walk(walk @ (WalkOperation::Path | WalkOperation::ExplainRelation)) => {
            read_paths(graph, request, walk)
        }
        Operation::Walk(
            walk @ (WalkOperation::Reachability
            | WalkOperation::Impact
            | WalkOperation::BlastRadius
            | WalkOperation::Subgraph),
        ) => read_expansion(graph, request, walk),
        Operation::Selection(SelectionOperation::MatchNodes) => read_match_nodes(graph, request),
        other => read_whole_graph(graph, request, other),
    }
}

/// The plan for `request.target_operation` on `graph`.
pub fn query_plan<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<PlanAnswer<'a>, QueryError> {
    let Some(target) = request.target_operation else {
        return Err(QueryError::Invalid(
            "targetOperation is required for query_plan and must name a supported query."
                .to_string(),
        ));
    };
    if !target.can_be_planned() {
        return Err(QueryError::NotAnAllowedValue {
            name: "targetOperation".to_string(),
            received: target.name().to_string(),
            allowed: Operation::plan_target_names(),
        });
    }
    let reading = read(graph, request, target)?;
    let mut indexes = reading.indexes;
    indexes.sort_unstable();
    indexes.dedup();
    let suggested = SuggestedCall::of(target.name(), &reading.arguments);
    let execution = ExecutionAdvice::of(
        target,
        reading.estimate.cost_class(),
        &reading.warnings,
        suggested,
    );
    Ok(PlanAnswer {
        operation: "query_plan",
        target_operation: target.name(),
        side_effect: false,
        graph: PlannedGraph {
            nodes: graph.nodes().len(),
            edges: graph.edges().len(),
            resolved_edges: graph.edge_counts().resolved,
            graph_hash: graph.graph_hash(),
        },
        normalized: reading.arguments,
        indexes_used: indexes,
        estimate: reading.estimate,
        warnings: reading.warnings,
        execution,
    })
}
