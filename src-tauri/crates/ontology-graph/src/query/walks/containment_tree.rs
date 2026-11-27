//! `containment_tree`: what holds what, as a tree from a node, from every project, or from every
//! node nothing holds. The tree is cut at `limit` nodes in all and at `depth` levels, and a node
//! that holds something above it is reported as a cycle, not followed. The cycles listed are cut
//! at `limit` too, and the answer says so.

use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::containment_steps::{children, has_parent};
use crate::query::node_resolution::resolve;
use crate::query::node_summary::NodeSummary;
use crate::query::project_root::project_roots;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;
use crate::query::scope::Scope;

const DEFAULT_DEPTH: usize = 20;
const DEFAULT_LIMIT: usize = 200;

#[derive(Serialize)]
struct TreeNode<'a> {
    slug: &'a str,
    via: Option<&'static str>,
    distance: usize,
    node: NodeSummary<'a>,
    children: Vec<TreeNode<'a>>,
}

/// A node that holds one of the nodes above it.
#[derive(Serialize)]
struct ContainmentCycle<'a> {
    from: &'a str,
    to: &'a str,
    via: &'static str,
    path: Vec<&'a str>,
}

#[derive(Serialize)]
pub struct ContainmentTreeAnswer<'a> {
    operation: &'static str,
    root: Option<&'a str>,
    depth: usize,
    #[serde(rename = "totalRoots")]
    total_roots: usize,
    #[serde(rename = "emittedNodes")]
    emitted_nodes: usize,
    limited: bool,
    roots: Vec<TreeNode<'a>>,
    cycles: Vec<ContainmentCycle<'a>>,
}

/// Every node nothing holds, except those in `excluded`.
fn nodes_nothing_holds(graph: &CompiledGraph, excluded: Option<&Scope>) -> Vec<NodeId> {
    graph
        .node_ids()
        .filter(|&node| !excluded.is_some_and(|scope| scope.contains(node)))
        .filter(|&node| !has_parent(graph, node))
        .collect()
}

/// Where the tree starts when the call names no node: each project, and with `include_orphans`
/// the nodes nothing holds that no project reaches. A graph with no project starts from every
/// node nothing holds.
fn default_roots(graph: &CompiledGraph, include_orphans: bool) -> Vec<NodeId> {
    let mut roots = project_roots(graph);
    if roots.is_empty() {
        return nodes_nothing_holds(graph, None);
    }
    if include_orphans {
        let reached = Scope::holding(graph, &roots);
        roots.extend(nodes_nothing_holds(graph, Some(&reached)));
    }
    roots
}

struct TreeBuilder<'a> {
    graph: &'a CompiledGraph,
    depth: usize,
    limit: usize,
    emitted: usize,
    limited: bool,
    /// More cycles were met than the `limit` kept.
    cycles_cut: bool,
    cycles: Vec<ContainmentCycle<'a>>,
}

impl<'a> TreeBuilder<'a> {
    /// The subtree at `node`, which the nodes of `above` lead to. Its depth is the call's `depth`
    /// at most, so the recursion is as deep as that and no deeper.
    fn build(
        &mut self,
        node: NodeId,
        via: Option<&'static str>,
        distance: usize,
        above: &mut Vec<NodeId>,
    ) -> Option<TreeNode<'a>> {
        if self.emitted >= self.limit {
            self.limited = true;
            return None;
        }
        self.emitted += 1;
        let graph = self.graph;
        let mut row = TreeNode {
            slug: graph.node(node).slug(),
            via,
            distance,
            node: NodeSummary::of(graph, node),
            children: Vec::new(),
        };
        if distance >= self.depth {
            return Some(row);
        }
        above.push(node);
        for step in children(graph, node) {
            let via = graph.edge(step.edge).via;
            if above.contains(&step.next) {
                if self.cycles.len() >= self.limit {
                    self.cycles_cut = true;
                    continue;
                }
                self.cycles.push(ContainmentCycle {
                    from: graph.node(node).slug(),
                    to: graph.node(step.next).slug(),
                    via,
                    path: above
                        .iter()
                        .chain(std::iter::once(&step.next))
                        .map(|held| graph.node(*held).slug())
                        .collect(),
                });
                continue;
            }
            if let Some(child) = self.build(step.next, Some(via), distance + 1, above) {
                row.children.push(child);
            }
            if self.limited {
                break;
            }
        }
        above.pop();
        Some(row)
    }
}

pub fn containment_tree<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<ContainmentTreeAnswer<'a>, QueryError> {
    let named = request
        .slug
        .as_deref()
        .map(|name| resolve(graph, Some(name), "slug"))
        .transpose()?;
    let depth = request.depth_or(DEFAULT_DEPTH);
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let roots = match named {
        Some(root) => vec![root],
        None => default_roots(graph, request.include_orphans.unwrap_or(false)),
    };

    let mut builder = TreeBuilder {
        graph,
        depth,
        limit,
        emitted: 0,
        limited: false,
        cycles_cut: false,
        cycles: Vec::new(),
    };
    let mut trees = Vec::new();
    for &root in &roots {
        if let Some(tree) = builder.build(root, None, 0, &mut Vec::new()) {
            trees.push(tree);
        }
        if builder.limited {
            break;
        }
    }
    Ok(ContainmentTreeAnswer {
        operation: "containment_tree",
        root: named.map(|root| graph.node(root).slug()),
        depth,
        total_roots: roots.len(),
        emitted_nodes: builder.emitted,
        limited: builder.limited || builder.cycles_cut,
        roots: trees,
        cycles: builder.cycles,
    })
}
