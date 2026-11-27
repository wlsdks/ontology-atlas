//! What contains what. `domains`, `capabilities`, `elements` and `contains` lead from a container
//! to what it holds; `domain` leads the other way, from a node to its domain. A node's children
//! and parents are found from its own edges, so asking about one node never reads the rest.

use std::collections::{HashMap, HashSet};

use super::graph_walk::Step;
use crate::compiled_graph::{CompiledGraph, NodeId};

const DOWNWARD: [&str; 4] = ["domains", "capabilities", "elements", "contains"];
const UPWARD: &str = "domain";

/// Which way along containment a step goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Way {
    /// To what the node holds.
    Descendants,
    /// To what holds the node.
    Ancestors,
}

/// The containment edges at `node` that lead `way`, each with the node on its other end, in the
/// order of that node and then the edge. A node may be reached by more than one edge.
pub fn containment_steps(graph: &CompiledGraph, node: NodeId, way: Way) -> Vec<Step> {
    let mut steps: Vec<Step> = Vec::new();
    let (down_from, up_from) = match way {
        Way::Descendants => (graph.outgoing(node), graph.incoming(node)),
        Way::Ancestors => (graph.incoming(node), graph.outgoing(node)),
    };
    for &id in down_from {
        let edge = graph.edge(id);
        if !DOWNWARD.contains(&edge.via) {
            continue;
        }
        let next = match way {
            Way::Descendants => edge.to(),
            Way::Ancestors => Some(edge.from),
        };
        if let Some(next) = next {
            steps.push(Step { next, edge: id });
        }
    }
    for &id in up_from {
        let edge = graph.edge(id);
        if edge.via != UPWARD {
            continue;
        }
        let next = match way {
            Way::Descendants => Some(edge.from),
            Way::Ancestors => edge.to(),
        };
        if let Some(next) = next {
            steps.push(Step { next, edge: id });
        }
    }
    steps.sort_unstable_by_key(|step| (step.next, step.edge));
    steps
}

/// One step to each node: when `domain` and another relation both reach a node, the other one
/// speaks for the pair.
fn one_step_per_node(graph: &CompiledGraph, steps: Vec<Step>) -> Vec<Step> {
    let mut kept: Vec<Step> = Vec::with_capacity(steps.len());
    for step in steps {
        match kept.last_mut() {
            Some(last) if last.next == step.next => {
                if graph.edge(last.edge).via == UPWARD && graph.edge(step.edge).via != UPWARD {
                    *last = step;
                }
            }
            _ => kept.push(step),
        }
    }
    kept
}

/// What `node` holds, one step to each child, in the order of the graph.
pub fn children(graph: &CompiledGraph, node: NodeId) -> Vec<Step> {
    one_step_per_node(graph, containment_steps(graph, node, Way::Descendants))
}

/// What holds `node`, one step to each parent, in the order of the graph.
pub fn parents(graph: &CompiledGraph, node: NodeId) -> Vec<Step> {
    one_step_per_node(graph, containment_steps(graph, node, Way::Ancestors))
}

/// Whether something holds `node`.
pub fn has_parent(graph: &CompiledGraph, node: NodeId) -> bool {
    let held = graph.incoming(node).iter().any(|&id| {
        let edge = graph.edge(id);
        DOWNWARD.contains(&edge.via)
    });
    held || graph.outgoing(node).iter().any(|&id| {
        let edge = graph.edge(id);
        edge.via == UPWARD && edge.is_resolved()
    })
}

/// The nodes of kind `project`, in the order of the graph.
pub fn project_roots(graph: &CompiledGraph) -> Vec<NodeId> {
    graph
        .node_ids()
        .filter(|&id| graph.node(id).kind() == "project")
        .collect()
}

/// Which domain a node belongs to: itself when it is one, else the domain it names, else the
/// nearest domain among what holds it. A node is looked up once.
pub struct DomainLookup<'a> {
    graph: &'a CompiledGraph,
    known: HashMap<NodeId, Option<NodeId>>,
}

impl<'a> DomainLookup<'a> {
    pub fn new(graph: &'a CompiledGraph) -> Self {
        Self {
            graph,
            known: HashMap::new(),
        }
    }

    pub fn of(&mut self, node: NodeId) -> Option<NodeId> {
        if let Some(found) = self.known.get(&node) {
            return *found;
        }
        let found = self.search(node);
        self.known.insert(node, found);
        found
    }

    pub fn slug_of(&mut self, node: NodeId) -> Option<&'a str> {
        let graph = self.graph;
        self.of(node).map(|domain| graph.node(domain).slug())
    }

    fn is_domain(&self, node: NodeId) -> bool {
        self.graph.node(node).kind() == "domain"
    }

    fn search(&self, node: NodeId) -> Option<NodeId> {
        if self.is_domain(node) {
            return Some(node);
        }
        let named = self
            .graph
            .node(node)
            .domain_name()
            .map(answer_format::whitespace::trim)
            .and_then(|name| self.graph.resolve_name(name));
        if let Some(named) = named.filter(|&named| self.is_domain(named)) {
            return Some(named);
        }
        let mut visited: HashSet<NodeId> = HashSet::from([node]);
        let mut queue = vec![node];
        let mut head = 0;
        while let Some(&current) = queue.get(head) {
            head += 1;
            for step in parents(self.graph, current) {
                if visited.contains(&step.next) {
                    continue;
                }
                if self.is_domain(step.next) {
                    return Some(step.next);
                }
                visited.insert(step.next);
                queue.push(step.next);
            }
        }
        None
    }
}
