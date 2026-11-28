//! What the dependency walks say, as `health` and `maintenance_plan` need it: whether dependencies
//! loop and whether they can be put in order. The walks own the search and the written rows; this
//! asks them with the defaults a call of `cycles` has and keeps the facts
//! as typed values, so the two never disagree about what a cycle is.

use serde::Serialize;

use crate::compiled_graph::CompiledGraph;
use crate::query::operation_defaults::{CYCLES_MAX_HOPS, CYCLES_SEARCH_BUDGET};
use crate::query::query_error::QueryError;
use crate::query::relation_set::RelationSet;
use crate::query::walks::dependency_cycles::{find_cycles, CycleRow};
use crate::query::walks::dependency_order::{order_dependencies, BlockedRow};

/// The relations the dependency walks read unless the call names others.
pub fn default_types() -> Vec<String> {
    vec!["dependencies".to_string()]
}

pub struct CycleReport<'a> {
    pub total: usize,
    pub exact: bool,
    pub limited: bool,
    pub cycles: Vec<CycleRow<'a>>,
}

/// The cycles among `types`, at most `limit` of them, up to `max_hops` edges long. Each name in
/// `types` is judged under `argument`, the name the call gave it.
pub fn cycles<'a>(
    graph: &'a CompiledGraph,
    limit: usize,
    max_hops: Option<usize>,
    types: &[String],
    argument: &str,
) -> Result<CycleReport<'a>, QueryError> {
    let relations = RelationSet::parse(Some(types), argument)?;
    let found = find_cycles(
        graph,
        relations.as_ref(),
        max_hops.unwrap_or(CYCLES_MAX_HOPS),
        limit,
        CYCLES_SEARCH_BUDGET,
    );
    let cycles: Vec<CycleRow<'a>> = found
        .cycles
        .iter()
        .map(|cycle| CycleRow::of(graph, cycle))
        .collect();
    Ok(CycleReport {
        total: found.total,
        exact: !found.truncated,
        limited: found.total > cycles.len() || found.truncated,
        cycles,
    })
}

/// One node of the prerequisite order: the layer it sits in, and its slug.
#[derive(Serialize)]
pub struct OrderedRow<'a> {
    rank: usize,
    slug: &'a str,
}

pub struct OrderReport<'a> {
    pub acyclic: bool,
    pub total_nodes: usize,
    pub ordered_count: usize,
    /// Whether more nodes are ordered than `order` lists.
    pub limited: bool,
    /// The first `limit` ordered nodes, prerequisites first.
    pub order: Vec<OrderedRow<'a>>,
    /// Every node a cycle keeps out of the order.
    pub blocked: Vec<BlockedRow<'a>>,
}

/// Whether `types` can be put in prerequisite order: the first `limit` ordered nodes, and every
/// node a cycle blocks.
pub fn order<'a>(
    graph: &'a CompiledGraph,
    limit: usize,
    types: &[String],
    argument: &str,
) -> Result<OrderReport<'a>, QueryError> {
    let relations = RelationSet::parse(Some(types), argument)?;
    let found = order_dependencies(graph, relations.as_ref());
    let ordered_count = found.ordered_count();
    Ok(OrderReport {
        acyclic: found.is_acyclic(),
        total_nodes: found.total_nodes,
        ordered_count,
        limited: ordered_count > limit,
        order: found
            .layers
            .iter()
            .enumerate()
            .flat_map(|(rank, layer)| {
                layer.iter().map(move |node| OrderedRow {
                    rank,
                    slug: graph.node(*node).slug(),
                })
            })
            .take(limit)
            .collect(),
        blocked: found
            .blocked
            .iter()
            .map(|blocked| BlockedRow::of(graph, blocked))
            .collect(),
    })
}
