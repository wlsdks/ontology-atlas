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

A node or an edge is a number (`NodeId`, `EdgeId`), so a walk over fifty thousand nodes holds
numbers and writes a name only into the answer. A graph is built once per set of document reads;
`mcp-server` keeps it while every document is the read the cache still holds.

Tests plant a vault in a temporary folder (`tests/support`) and compile what the document cache
reads of it.
