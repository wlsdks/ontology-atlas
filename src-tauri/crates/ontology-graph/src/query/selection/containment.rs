//! What sits under a node and what over it. Containment is not one relation: a project's `domains:`,
//! a domain's `capabilities:` and `elements:`, and `contains:` point downward, and a node's own
//! `domain:` points upward. One pass over the edges lists both directions for every node, so
//! asking again for a node costs its own edges, however large the graph is.

use std::collections::HashSet;

use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};

const DOWNWARD_RELATIONS: [&str; 4] = ["domains", "capabilities", "elements", "contains"];
const UPWARD_RELATION: &str = "domain";

/// The node on the other end of a containment edge, and the edge that says so.
#[derive(Debug, Clone, Copy)]
pub struct Link {
    pub next: NodeId,
    pub edge: EdgeId,
}

/// A set of nodes, kept as the slug-ordered list of their ids.
#[derive(Debug, Clone, Default)]
pub struct Scope {
    ids: Vec<NodeId>,
}

impl Scope {
    pub fn everything(graph: &CompiledGraph) -> Self {
        Self {
            ids: graph.node_ids().collect(),
        }
    }

    pub fn contains(&self, id: NodeId) -> bool {
        self.ids.binary_search(&id).is_ok()
    }

    pub fn ids(&self) -> &[NodeId] {
        &self.ids
    }

    pub fn len(&self) -> usize {
        self.ids.len()
    }

    /// The nodes both scopes hold.
    pub fn intersect(&self, other: &Self) -> Self {
        Self {
            ids: self
                .ids
                .iter()
                .copied()
                .filter(|id| other.contains(*id))
                .collect(),
        }
    }
}

/// Which way a lineage walk climbs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineageDirection {
    Ancestors,
    Descendants,
}

/// One node a lineage walk reached, with how far it is and the relation that led to it first.
#[derive(Debug, Clone, Copy)]
pub struct LineageStep {
    pub node: NodeId,
    pub distance: usize,
    pub via: &'static str,
}

#[derive(Debug, Clone, Default)]
pub struct Lineage {
    pub steps: Vec<LineageStep>,
    pub limited: bool,
}

pub struct Containment<'a> {
    graph: &'a CompiledGraph,
    below: Vec<Vec<Link>>,
    above: Vec<Vec<Link>>,
}

fn push(lists: &mut [Vec<Link>], at: NodeId, link: Link) {
    if let Some(list) = lists.get_mut(at.index()) {
        list.push(link);
    }
}

/// One link per node on the other end, sorted by that node: when two edges reach the same node
/// the first stands, unless it is a node's own `domain:` and a later one is a relation of the
/// other side, which says more.
fn distinct(graph: &CompiledGraph, links: &[Link]) -> Vec<Link> {
    let mut kept: Vec<Link> = Vec::with_capacity(links.len());
    for link in links {
        match kept.last_mut() {
            Some(previous) if previous.next == link.next => {
                if graph.edge(previous.edge).via == UPWARD_RELATION
                    && graph.edge(link.edge).via != UPWARD_RELATION
                {
                    *previous = *link;
                }
            }
            _ => kept.push(*link),
        }
    }
    kept
}

impl<'a> Containment<'a> {
    pub fn of(graph: &'a CompiledGraph) -> Self {
        let count = graph.nodes().len();
        let mut below: Vec<Vec<Link>> = vec![Vec::new(); count];
        let mut above: Vec<Vec<Link>> = vec![Vec::new(); count];
        for id in graph.edge_ids() {
            let edge = graph.edge(id);
            let Some(to) = edge.to() else { continue };
            if DOWNWARD_RELATIONS.contains(&edge.via) {
                push(&mut below, edge.from, Link { next: to, edge: id });
                push(
                    &mut above,
                    to,
                    Link {
                        next: edge.from,
                        edge: id,
                    },
                );
            } else if edge.via == UPWARD_RELATION {
                push(
                    &mut below,
                    to,
                    Link {
                        next: edge.from,
                        edge: id,
                    },
                );
                push(&mut above, edge.from, Link { next: to, edge: id });
            }
        }
        for list in below.iter_mut().chain(above.iter_mut()) {
            list.sort_unstable_by_key(|link| (link.next, link.edge));
        }
        Self {
            graph,
            below,
            above,
        }
    }

    fn all_below(&self, node: NodeId) -> &[Link] {
        self.below.get(node.index()).map_or(&[], Vec::as_slice)
    }

    fn all_above(&self, node: NodeId) -> &[Link] {
        self.above.get(node.index()).map_or(&[], Vec::as_slice)
    }

    /// The nodes directly under `node`, each once, in slug order.
    pub fn children(&self, node: NodeId) -> Vec<Link> {
        distinct(self.graph, self.all_below(node))
    }

    /// The nodes directly over `node`, each once, in slug order.
    pub fn parents(&self, node: NodeId) -> Vec<Link> {
        distinct(self.graph, self.all_above(node))
    }

    pub fn has_children(&self, node: NodeId) -> bool {
        !self.all_below(node).is_empty()
    }

    pub fn has_parents(&self, node: NodeId) -> bool {
        !self.all_above(node).is_empty()
    }

    /// `root` and everything below it, found breadth first.
    pub fn scope_under(&self, root: NodeId) -> Scope {
        let mut seen: HashSet<NodeId> = HashSet::from([root]);
        let mut queue = vec![root];
        let mut head = 0;
        while let Some(current) = queue.get(head).copied() {
            head += 1;
            for link in self.all_below(current) {
                if seen.insert(link.next) {
                    queue.push(link.next);
                }
            }
        }
        queue.sort_unstable();
        Scope { ids: queue }
    }

    /// The domain a node belongs to inside `scope`: itself when it is one, else the domain its
    /// own `domain:` names, else the nearest domain found by climbing.
    pub fn nearest_domain(&self, node: NodeId, scope: &Scope) -> Option<NodeId> {
        if !scope.contains(node) {
            return None;
        }
        if self.graph.node(node).kind() == "domain" {
            return Some(node);
        }
        if let Some(named) = self.named_domain(node) {
            if scope.contains(named) && self.graph.node(named).kind() == "domain" {
                return Some(named);
            }
        }
        let mut visited: HashSet<NodeId> = HashSet::from([node]);
        let mut queue = vec![node];
        let mut head = 0;
        while let Some(current) = queue.get(head).copied() {
            head += 1;
            for link in self.parents(current) {
                if visited.contains(&link.next) || !scope.contains(link.next) {
                    continue;
                }
                if self.graph.node(link.next).kind() == "domain" {
                    return Some(link.next);
                }
                visited.insert(link.next);
                queue.push(link.next);
            }
        }
        None
    }

    /// The node the `domain:` of `node` names, as a slug or an alias.
    pub fn named_domain(&self, node: NodeId) -> Option<NodeId> {
        self.graph
            .node(node)
            .domain_name()
            .and_then(|name| self.graph.resolve_name(answer_format::whitespace::trim(name)))
    }

    /// The nodes over or under `center`, nearest first and in slug order within a distance, at
    /// most `limit` of them. A walk stops at the first node past `limit`, so `limited` is true
    /// only when one more exists.
    pub fn lineage(
        &self,
        center: NodeId,
        direction: LineageDirection,
        depth: usize,
        limit: usize,
    ) -> Lineage {
        let mut discovered: HashSet<NodeId> = HashSet::from([center]);
        let mut steps: Vec<LineageStep> = Vec::new();
        let mut queue: Vec<(NodeId, usize)> = vec![(center, 0)];
        let mut head = 0;
        while let Some((current, distance)) = queue.get(head).copied() {
            head += 1;
            if distance >= depth {
                continue;
            }
            let links = match direction {
                LineageDirection::Ancestors => self.all_above(current),
                LineageDirection::Descendants => self.all_below(current),
            };
            for link in links {
                if !discovered.insert(link.next) {
                    continue;
                }
                if steps.len() == limit {
                    return Self::ordered(steps, true);
                }
                steps.push(LineageStep {
                    node: link.next,
                    distance: distance + 1,
                    via: self.graph.edge(link.edge).via,
                });
                queue.push((link.next, distance + 1));
            }
        }
        Self::ordered(steps, false)
    }

    fn ordered(mut steps: Vec<LineageStep>, limited: bool) -> Lineage {
        steps.sort_by_key(|step| (step.distance, step.node));
        Lineage { steps, limited }
    }
}
