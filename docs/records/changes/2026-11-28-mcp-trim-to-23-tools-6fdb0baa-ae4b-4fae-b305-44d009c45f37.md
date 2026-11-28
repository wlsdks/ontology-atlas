---
id: 6fdb0baa-ae4b-4fae-b305-44d009c45f37
date: 2026-11-28
category: Removed
---
The MCP server lists 23 tools instead of 33, and its `tools/list` answer is 10,572 bytes smaller. `git_status`, `git_history` and `git_snapshot` are gone; the agent runs its own `git`. Seven tools became an option of another: `get_constellation` with no `id`, `list_concepts` with `mentions` or `filter`, `query_ontology` `match_nodes` with `hasIncoming:false`, `connect_project_source` with `disconnect:true`, `remove_relation` with `replaceWith`, and `rename_concept` with `newKind`. An old name answers `tool_retired` and names the call to use instead.
