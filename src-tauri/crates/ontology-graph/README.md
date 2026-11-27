# ontology-graph

The ontology a vault's documents make, and the answers of `compile_ontology` and `query_ontology`.
It reads documents that `vault-document` already read; it never opens a file.

| File | What it owns |
|---|---|
| `graph_compiler.rs` | `compile`: which documents are nodes, what each name reaches, the edges, the issues |
| `compiled_graph.rs` | `CompiledGraph`, `Node`, `Edge`, `EdgeView`: nodes and edges named by place, not by text |
| `compile_issue.rs` | `CompileIssue`: what compiling noticed and still compiled |
| `identity_error.rs` | `IdentityError`: the faults in `uid:` that refuse the compile |
| `graph_hash.rs` | `hash_graph`: the SHA-256 an agent compares to see the graph changed |
| `compile_answer.rs` | `compile_answer`: the summary, the pages and the lookup tables of `compile_ontology` |

`src/query/` holds the operations of `query_ontology` that read the graph alone, one function per
operation from the graph and a `QueryRequest` to a typed answer. `Operation` names every operation
the tool offers; the ones no module answers yet are `Operation::Pending`, which `run` refuses by
name, and the differential corpus shows which those are. A family of operations is a folder with
its own `run` and its own answer type: `walks/` follows edges from a node, `selection/` picks nodes
from the whole graph.

| File in `src/query/` | What it owns |
|---|---|
| `mod.rs` | `run`: the family an operation belongs to, and the `compiledSummary` that closes every answer |
| `operation.rs` | `Operation`: every operation, its name, and whether a plan may target it |
| `request.rs` | `QueryRequest`, `Direction`: what a call asked, read once by the tool layer, and the defaults and caps a walk applies to `depth` and `direction` |
| `query_error.rs` | `QueryError`: an invalid call, a value not allowed, an unknown node, an operation not answered yet |
| `relation_set.rs` | `RelationSet`: the relation names a call may select, with their aliases |
| `node_resolution.rs` | `resolve`: a slug or alias to a node, or the slugs near a name that is none |
| `node_summary.rs` | `NodeIdentity`, `NodeSummary`: the node row every answer writes |
| `node_mask.rs` | `NodeMask`: a set of nodes, one flag each |
| `step.rs` | `Step`: the edge a walk takes and the node it leads to |
| `containment_steps.rs` | `containment_steps`, `children`, `has_parent`: what a node holds and what holds it, from its own edges |
| `domain_lookup.rs` | `DomainLookup`: the domain a node belongs to, for every node from one search down from the domains |
| `project_root.rs` | `project_roots`, `project_root`: the project nodes of a graph, and which one a call means |
| `scope.rs` | `Scope`, `ScopeEdges`: a node and everything it holds, and where the edges that start inside end |
| `edge_rows.rs` | the edge rows of an answer: directed, on a path, compiled |
| `name_counts.rs` | counts by kind, domain or relation, in the order of the names |
| `walks/graph_walk.rs` | `traversal_steps`: the edges a walk may follow from a node, in the order walks use |
| `walks/neighbors.rs`, `walks/paths.rs` | `neighbors`, `path`, `all_paths`: breadth-first, shortest and budgeted iterative search |
| `walks/dependency_cycles.rs`, `walks/topological_order.rs` | `cycles` (bounded Johnson search) and `topological_order` (layered Kahn); `find_cycles` and `order_dependencies` give selection the typed facts, so it never reads the written answer |
| `walks/neighborhood.rs`, `walks/hop.rs`, `walks/row_page.rs` | `Neighborhood`: the exact breadth-first search that `reachability`, `impact`, `blast_radius`, `subgraph` and `builder_context` cut; `Hop`; the page of rows an answer cuts at `limit` |
| `walks/reachability.rs`, `walks/lineage.rs` | `reachability` and `lineage`: what a node reaches, and its containers and contents |
| `walks/pattern_walk.rs` | `pattern_walk`: simple paths that follow a list of relations, a layer at a time |
| `walks/impact.rs`, `walks/blast_radius.rs`, `walks/dependency_qualification.rs` | `impact` and `blast_radius` over declared `depends_on` edges, and whether each edge carries a reason |
| `walks/subgraph.rs`, `walks/builder_context.rs`, `walks/builder_focus.rs` | `subgraph`, and `builder_context`: the same cut with the workbench's focus name, canvas position and handoff |
| `walks/explain_relation.rs`, `walks/relation_check.rs` | `explain_relation` and `relation_check`: how two nodes relate, and whether a proposed edge fits the graph's patterns |
| `walks/containment_tree.rs`, `walks/project_scope.rs`, `walks/project_map.rs` | `containment_tree`, `project_scope` and `project_map`: what holds what, and what each project holds |
| `selection/clusters.rs` | `components` and `communities` (label propagation) |
| `selection/centrality.rs` | `centrality`: PageRank and degree rankings |
| `selection/graph_summary.rs` | `overview`, `schema`, `facets` |
| `selection/match_nodes.rs`, `selection/match_edges.rs` | `match_nodes`, `match_edges`: the rows that pass a condition, by degree or slug |
| `selection/node_profile.rs`, `selection/domain_profile.rs`, `selection/domain_matrix.rs` | one node, one domain, and the domain-to-domain edge table |
| `selection/similar_nodes.rs`, `selection/relation_recommendations.rs` | `similar_nodes` and `recommend_relations` (the domain links a capability or element lacks) |
| `selection/health.rs`, `selection/workspace_brief.rs` | `health`: the verdict and its checks; `workspace_brief`: the first page of a vault |
| `selection/growth_plan.rs`, `selection/growth_candidates.rs` | `growth_plan` and the groups it lists: external files, dangling references, unassigned nodes, empty domains |
| `selection/maintenance_plan.rs`, `selection/maintenance_action.rs` | `maintenance_plan`: every action in order, with its address (`maint_` and an FNV-1a hash) |
| `selection/containment.rs` | `Containment`: who contains whom, the scope under a node, the nearest domain, lineage |
| `selection/project_page.rs` | a project's domains with counts and short lists, cut to a character bound (`workspace_brief` carries one per project) |
| `selection/outside_checks.rs` | the validation and meaning-review checks `health` and `workspace_brief` carry when the tool layer hands them over |
| `selection/selection_request.rs` | `SelectionArguments`, `OutsideFacts`: what the selection operations read beside `QueryRequest` |

`OutsideFacts` is the seam to what a graph cannot know: the vault's `.ontology-atlasignore`, the
summaries whose members changed since they were written (Git), the reads an `## Uncertainty`
section asks for, and the validation and meaning-review results. An operation given none of them
answers without them and says so (no check, no rows) instead of guessing.

Every list and table of an answer is in the order of the graph: nodes by the collation of their
slugs (a `NodeId` is that position), edges by the collation of `from:via:to:ref`. Tables keyed by
names are `IndexMap`s, written in the order the keys were added.

No walk recurses as deep as the graph: searches are iterative or bounded by `maxHops` (at most 20)
and a budget of expanded states, and an answer that hit its budget says its count is a lower bound.

A node or an edge is a number (`NodeId`, `EdgeId`), so a walk over fifty thousand nodes holds
numbers and writes a name only into the answer. A graph is built once per set of document reads;
`mcp-server` keeps it while every document is the read the cache still holds.

Tests plant a vault in a temporary folder (`tests/support`) and compile what the document cache
reads of it.
