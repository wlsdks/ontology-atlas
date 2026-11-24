---
id: b72c142b-784a-4a3d-bae0-fb05c7e7abc9
date: 2026-11-24
---
## 2026-11-24 — The MCP server advertises 33 tools; seven that repeat another tool answer but leave tools/list

**Why**: Glama scored disambiguation and tool count 2 of 5 each. `find_path`, `find_neighbors` and `list_kinds` answer what `query_ontology` `path`, `neighbors` and `facets` answer, and no description said which to use. Every session loads every definition: 60,163 characters for 40 tools.
**Prior**: Keeps `80fc2632` (each tool bounds its own answer) and the `query_ontology` operations. `get_concept`, `add_concept` and `add_relation` were one-row forms of the plural tools; `index_project` chained three others.
**Decision**: `tools/list` holds 33. Those seven leave it (`RETIRED_TOOL_REPLACEMENTS`, `mcp/src/server/registry.mjs`) but still answer, with a note naming their replacement. `list_concepts` carries the `census` `list_kinds` gave. Tools that still overlap say when to use which, and every hint, skill, template and document names only advertised tools. The handlers go in a later release.
**Dissent**: `get_concept` and `find_path` are the names agents reach for first. 33 is above the scorer's 25; the constellation, Git and project-source pairs stay apart because merged names would stop saying what they do.
**Falsifier**: Agents on 33 tools pick wrong tools or need more calls for the same construction than on 40, or a Glama rescore leaves both rows at 2.
**Owner**: Stark
