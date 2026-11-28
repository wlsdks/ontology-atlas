//! Which domain a node belongs to: itself when it is one, else the domain it names, else the
//! nearest domain among what holds it. A lookup may be limited to a scope: a node outside it has
//! no domain, and a domain outside it is neither named nor climbed to.
//!
//! "Nearest among what holds it" is found for every node at once, by one search that starts at
//! every domain and walks down to what each holds. Climbing from each node instead would repeat
//! the climb for every node under a long chain, and a project that holds fifty thousand
//! capabilities would be read again for each of them.

use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::containment_steps::children;
use crate::query::scope::Scope;

pub struct DomainLookup<'a> {
    graph: &'a CompiledGraph,
    within: Option<&'a Scope>,
    /// The nearest domain above each node, found the first time a node needs it.
    held_by: Option<Vec<Option<NodeId>>>,
}

/// The node the `domain:` of `node` names, as a slug or an alias: a domain or not.
pub fn named_domain(graph: &CompiledGraph, node: NodeId) -> Option<NodeId> {
    graph
        .node(node)
        .domain_name()
        .and_then(|name| graph.resolve_name(answer_format::whitespace::trim(name)))
}

impl<'a> DomainLookup<'a> {
    pub fn new(graph: &'a CompiledGraph) -> Self {
        Self {
            graph,
            within: None,
            held_by: None,
        }
    }

    /// A lookup that answers only for the nodes of `scope`, through the domains of `scope`.
    pub fn within(graph: &'a CompiledGraph, scope: &'a Scope) -> Self {
        Self {
            graph,
            within: Some(scope),
            held_by: None,
        }
    }

    fn is_in_scope(&self, node: NodeId) -> bool {
        self.within.is_none_or(|scope| scope.contains(node))
    }

    pub fn of(&mut self, node: NodeId) -> Option<NodeId> {
        if !self.is_in_scope(node) {
            return None;
        }
        if self.is_domain(node) {
            return Some(node);
        }
        let named = named_domain(self.graph, node)
            .filter(|&named| self.is_in_scope(named) && self.is_domain(named));
        if named.is_some() {
            return named;
        }
        let (graph, within) = (self.graph, self.within);
        self.held_by
            .get_or_insert_with(|| nearest_domains_above(graph, within))
            .get(node.index())
            .copied()
            .flatten()
    }

    pub fn slug_of(&mut self, node: NodeId) -> Option<&'a str> {
        let graph = self.graph;
        self.of(node).map(|domain| graph.node(domain).slug())
    }

    fn is_domain(&self, node: NodeId) -> bool {
        self.graph.node(node).kind() == "domain"
    }
}

/// How the search has met one node.
#[derive(Clone, Copy)]
struct Meeting {
    /// How many steps down from a domain the node was first met.
    depth: Option<usize>,
    /// The node one step up that holds it, the first in the order of the graph among those at
    /// that depth.
    holder: Option<NodeId>,
    domain: Option<NodeId>,
}

/// For each node, the domain nearest above it through what holds it: a domain is its own. When two
/// domains are equally near, the node's holder that comes first in the order of the graph decides,
/// and then that holder's own choice, step by step up.
fn nearest_domains_above(graph: &CompiledGraph, within: Option<&Scope>) -> Vec<Option<NodeId>> {
    let in_scope = |node: NodeId| within.is_none_or(|scope| scope.contains(node));
    let mut meetings = vec![
        Meeting {
            depth: None,
            holder: None,
            domain: None,
        };
        graph.nodes().len()
    ];
    let mut level: Vec<NodeId> = graph
        .node_ids()
        .filter(|&node| graph.node(node).kind() == "domain" && in_scope(node))
        .collect();
    for &domain in &level {
        if let Some(meeting) = meetings.get_mut(domain.index()) {
            *meeting = Meeting {
                depth: Some(0),
                holder: None,
                domain: Some(domain),
            };
        }
    }
    let mut depth = 0;
    while !level.is_empty() {
        let below_depth = depth + 1;
        let mut below: Vec<NodeId> = Vec::new();
        for &above in &level {
            for step in children(graph, above) {
                if !in_scope(step.next) {
                    continue;
                }
                let Some(meeting) = meetings.get_mut(step.next.index()) else {
                    continue;
                };
                match meeting.depth {
                    None => {
                        *meeting = Meeting {
                            depth: Some(below_depth),
                            holder: Some(above),
                            domain: None,
                        };
                        below.push(step.next);
                    }
                    Some(met)
                        if met == below_depth
                            && meeting.holder.is_some_and(|held| above < held) =>
                    {
                        meeting.holder = Some(above);
                    }
                    Some(_) => {}
                }
            }
        }
        for &node in &below {
            let domain = meetings
                .get(node.index())
                .and_then(|meeting| meeting.holder)
                .and_then(|holder| meetings.get(holder.index()))
                .and_then(|meeting| meeting.domain);
            if let Some(meeting) = meetings.get_mut(node.index()) {
                meeting.domain = domain;
            }
        }
        level = below;
        depth = below_depth;
    }
    meetings.into_iter().map(|meeting| meeting.domain).collect()
}
