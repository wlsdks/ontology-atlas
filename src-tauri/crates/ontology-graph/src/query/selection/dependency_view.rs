//! What the dependency walks say, as `health` and `maintenance_plan` need it: whether dependencies
//! loop and whether they can be put in order. The walks own the search; this asks them the same
//! question a caller of `cycles` or `topological_order` would, and reads the facts back out of the
//! answer they wrote, so the two never disagree about what a cycle is.

use serde::Deserialize;
use serde_json::value::RawValue;

use crate::compiled_graph::CompiledGraph;
use crate::query::operation::Operation;
use crate::query::query_error::QueryError;
use crate::query::relation_set::RelationSet;
use crate::query::request::QueryRequest;
use crate::query::walks::{self, WalkOperation};

/// The relations the dependency walks read unless the call names others.
pub fn default_types() -> Vec<String> {
    vec!["dependencies".to_string()]
}

/// A dependency cycle as the walk wrote it, kept whole so a plan can carry it unchanged.
pub struct CycleRow {
    pub length: usize,
    pub nodes: Vec<String>,
    pub row: Box<RawValue>,
}

pub struct CycleReport {
    pub total: usize,
    pub exact: bool,
    pub limited: bool,
    pub cycles: Vec<CycleRow>,
}

#[derive(Deserialize)]
struct WrittenCycles {
    #[serde(rename = "totalCycles")]
    total: usize,
    #[serde(rename = "totalCyclesExact")]
    exact: bool,
    limited: bool,
    cycles: Vec<Box<RawValue>>,
}

#[derive(Deserialize)]
struct WrittenCycleFacts {
    length: usize,
    nodes: Vec<String>,
}

fn walk_request(operation: WalkOperation, limit: usize, types: &[String]) -> QueryRequest {
    let mut request = QueryRequest::new(Operation::Walk(operation));
    request.limit = Some(limit);
    request.types = Some(types.to_vec());
    request
}

fn written<T: for<'de> Deserialize<'de>>(
    answer: &impl serde::Serialize,
) -> Result<T, QueryError> {
    let text = answer_format::json::to_string(answer)
        .map_err(|error| QueryError::Failed(error.to_string()))?;
    serde_json::from_str(&text).map_err(|error| QueryError::Failed(error.to_string()))
}

/// The cycles among `types`, at most `limit` of them, up to `max_hops` edges long. Each name in
/// `types` is judged under `argument`, the name the call gave it.
pub fn cycles(
    graph: &CompiledGraph,
    limit: usize,
    max_hops: Option<usize>,
    types: &[String],
    argument: &str,
) -> Result<CycleReport, QueryError> {
    RelationSet::parse(Some(types), argument)?;
    let mut request = walk_request(WalkOperation::Cycles, limit, types);
    request.max_hops = max_hops;
    let answer = walks::run(graph, WalkOperation::Cycles, &request)?;
    let parsed: WrittenCycles = written(&answer)?;
    let mut cycles = Vec::with_capacity(parsed.cycles.len());
    for row in parsed.cycles {
        let facts: WrittenCycleFacts = serde_json::from_str(row.get())
            .map_err(|error| QueryError::Failed(error.to_string()))?;
        cycles.push(CycleRow {
            length: facts.length,
            nodes: facts.nodes,
            row,
        });
    }
    Ok(CycleReport {
        total: parsed.total,
        exact: parsed.exact,
        limited: parsed.limited,
        cycles,
    })
}

pub struct OrderReport {
    pub acyclic: bool,
    pub total_nodes: usize,
    pub ordered_count: usize,
    pub blocked: Box<RawValue>,
}

#[derive(Deserialize)]
struct WrittenOrder {
    acyclic: bool,
    #[serde(rename = "totalNodes")]
    total_nodes: usize,
    #[serde(rename = "orderedCount")]
    ordered_count: usize,
    blocked: Box<RawValue>,
}

/// Whether `types` can be put in prerequisite order, and what is blocked when they cannot.
pub fn order(
    graph: &CompiledGraph,
    limit: usize,
    types: &[String],
    argument: &str,
) -> Result<OrderReport, QueryError> {
    RelationSet::parse(Some(types), argument)?;
    let request = walk_request(WalkOperation::TopologicalOrder, limit, types);
    let answer = walks::run(graph, WalkOperation::TopologicalOrder, &request)?;
    let parsed: WrittenOrder = written(&answer)?;
    Ok(OrderReport {
        acyclic: parsed.acyclic,
        total_nodes: parsed.total_nodes,
        ordered_count: parsed.ordered_count,
        blocked: parsed.blocked,
    })
}
