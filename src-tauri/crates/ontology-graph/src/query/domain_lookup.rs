//! Which domain a node belongs to.

use std::collections::{HashMap, HashSet};

use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::containment_steps::parents;

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
