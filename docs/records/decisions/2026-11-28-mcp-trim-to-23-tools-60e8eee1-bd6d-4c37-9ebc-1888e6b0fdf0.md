---
id: 60e8eee1-bd6d-4c37-9ebc-1888e6b0fdf0
date: 2026-11-28
---
## 2026-11-28 — The MCP server advertises 23 tools, not 33

**Why**: an agent picks a tool from `tools/list` at the start of a task. Measured 2026-11-28, the list was 33 tools and 76,282 bytes. Three (`git_status`, `git_history`, `git_snapshot`) repeat the agent's own `git`; seven are a second name for one call of another tool. Every session pays the tokens and has two ways to ask one question.
**Prior**: extends 2026-08-09 "The current MCP inventory derives only from the active runtime registry".
**Decision**: `tools/list` advertises 23 tools (13 read, 10 write), 65,710 bytes. The three Git tools are cut. The other seven fold into `get_constellation` (no `id`), `list_concepts` (`mentions`, `filter`), `query_ontology` (`match_nodes`, `hasIncoming:false`), `connect_project_source` (`disconnect`), `remove_relation` (`replaceWith`) and `rename_concept` (`newKind`). The ten old names answer `tool_retired` with the replacement and run nothing. Folded writes keep dry run, `expected_mtime`, consent, write log, audit line and error codes. The Rust port ports the 23 and the ten answers.
**Dissent**: only the owner has used the cut tools and no count of other users exists; the in-app agent loses a commit it made without a shell. Not adopted: an agent with a shell has `git`, and the Git screen commits for the person.
**Falsifier**: a real user's workflow needs a cut tool and cannot reach it through the call its `tool_retired` answer names, or a folded call loses a gate its old tool had.
**Owner**: stark (lead decision, 2026-11-28)
