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
| `object_map.rs` | `ObjectMap`: a map written in the order a JavaScript object lists its keys |

`src/query/` holds the operations of `query_ontology` that read the graph alone, one function per
operation from the graph and a `QueryRequest` to a typed answer. `ANSWERED_OPERATIONS` lists them;
a call naming any other operation is refused as not answered yet, and the differential corpus
shows which those are.

| File in `src/query/` | What it owns |
|---|---|
| `mod.rs` | `run`: the operation named, and the `compiledSummary` that closes every answer |
| `request.rs` | `QueryRequest`, `Direction`: what a call asked, already range-checked |
| `query_error.rs` | `QueryError`: an invalid call, a value not allowed, an unknown node, a failure |
| `relation_set.rs` | `RelationSet`: the relation names a call may select, with their aliases |
| `node_resolution.rs` | `resolve`: a slug or alias to a node, or the slugs near a name that is none |
| `graph_walk.rs` | `traversal_steps`: the edges a walk may follow from a node, in the order walks use |
| `neighbors.rs`, `paths.rs` | `neighbors`, `path`, `all_paths`: breadth-first, shortest and budgeted iterative search |
| `dependency_order.rs` | `cycles` (bounded Johnson search) and `topological_order` (layered Kahn) |
| `clusters.rs` | `components` and `communities` (label propagation) |
| `centrality.rs` | `centrality`: PageRank and degree rankings |
| `graph_summary.rs` | `overview`, `schema`, `facets` |
| `views.rs` | the small rows every answer shares: node summaries, edges on a path, counts |

No walk recurses as deep as the graph: searches are iterative or bounded by `maxHops` (at most 20)
and a budget of expanded states, and an answer that hit its budget says its count is a lower bound.

A node or an edge is a number (`NodeId`, `EdgeId`), so a walk over fifty thousand nodes holds
numbers and writes a name only into the answer. A graph is built once per set of document reads;
`mcp-server` keeps it while every document is the read the cache still holds.

Tests plant a vault in a temporary folder (`tests/support`) and compile what the document cache
reads of it.
