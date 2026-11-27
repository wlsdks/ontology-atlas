//! `impact`: what depends on a node, or what it depends on, within `depth` edges. Only declared
//! `depends_on` edges are followed; a structural relation has `reachability` and `subgraph`.

use serde::Serialize;

use super::dependency_qualification::{DependencyEdge, Qualification};
use super::neighborhood::{Neighborhood, NodeAtDistance};
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::node_resolution::resolve;
use crate::query::query_error::QueryError;
use crate::query::relation_set::RelationSet;
use crate::query::request::{Direction, QueryRequest};

const DEFAULT_DEPTH: usize = 2;
const DEFAULT_LIMIT: usize = 100;

/// The search `impact` and `blast_radius` share: from a node along declared dependencies, incoming
/// unless the call says otherwise.
pub struct DependencyWalk {
    pub center: NodeId,
    pub direction: Direction,
    pub depth: usize,
    pub limit: usize,
    pub neighborhood: Neighborhood,
}

impl DependencyWalk {
    pub fn run(graph: &CompiledGraph, request: &QueryRequest) -> Result<Self, QueryError> {
        let center = resolve(graph, request.slug.as_deref(), "slug")?;
        let direction = request.direction_undirected_as_both(Direction::Incoming);
        let depth = request.depth_or(DEFAULT_DEPTH);
        let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
        refuse_structural_types(request)?;
        let types = RelationSet::dependencies();
        let neighborhood = Neighborhood::explore(graph, center, direction, depth, Some(&types));
        Ok(Self {
            center,
            direction,
            depth,
            limit,
            neighborhood,
        })
    }
}

/// A call that names `types` may name `depends_on` and nothing else.
fn refuse_structural_types(request: &QueryRequest) -> Result<(), QueryError> {
    RelationSet::parse(request.types.as_deref(), "types")?;
    let mut structural: Vec<&str> = Vec::new();
    for name in request.types.as_deref().unwrap_or_default() {
        if name != "depends_on" && name != "dependencies" && !structural.contains(&name.as_str()) {
            structural.push(name);
        }
    }
    if structural.is_empty() {
        return Ok(());
    }
    Err(QueryError::Invalid(format!(
        "dependency impact only accepts depends_on relations; use reachability or subgraph for structural relation types: {}",
        structural.join(", ")
    )))
}

#[derive(Serialize)]
pub struct ImpactAnswer<'a> {
    operation: &'static str,
    center: &'a str,
    direction: Direction,
    depth: usize,
    total: usize,
    limited: bool,
    qualification: Qualification,
    nodes: Vec<NodeAtDistance<'a>>,
    edges: Vec<DependencyEdge<'a>>,
}

pub fn impact<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<ImpactAnswer<'a>, QueryError> {
    let walk = DependencyWalk::run(graph, request)?;
    let nearest = walk.neighborhood.nearest_first();
    let hops = walk.neighborhood.hops();
    Ok(ImpactAnswer {
        operation: "impact",
        center: graph.node(walk.center).slug(),
        direction: walk.direction,
        depth: walk.depth,
        total: nearest.len(),
        limited: nearest.len() > walk.limit,
        qualification: Qualification::of(graph, hops),
        nodes: nearest
            .iter()
            .take(walk.limit)
            .filter_map(|&place| walk.neighborhood.reached().get(place))
            .map(|row| NodeAtDistance::of(graph, row.node, row.distance))
            .collect(),
        edges: hops
            .iter()
            .take(walk.limit)
            .map(|&hop| DependencyEdge::new(graph, hop, None))
            .collect(),
    })
}
