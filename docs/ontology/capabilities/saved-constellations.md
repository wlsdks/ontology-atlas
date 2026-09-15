---
uid: 2546833b-d01b-4601-94c5-d925ae2fa853
slug: capabilities/saved-constellations
kind: capability
title: Saved Constellation Task Scopes
display_en: Saved Constellation Task Scopes
display_ko: 저장된 개념 모음
domain: domains/topology-navigation
elements: [elements/saved-constellation-sidecar]
path: src/features/saved-constellations
created_by: "agent:ontology-atlas-cli"
---

People can save a named, purposeful set of real ontology concepts and reopen that durable task scope in Galaxy or Library. MCP and CLI expose the same saved set as bounded read-only context for a later agent session.

## Includes

- Creating, renaming, changing, and deleting a constellation in Galaxy.
- Saving current ontology-node membership with a purpose and stable constellation identity.
- Reopening the whole set on the topology map and inspecting its resolved members in Library.
- Reading the saved constellation inventory or one constellation through MCP and CLI without changing it.
- Reporting unresolved members explicitly when a saved UID no longer resolves.

## Excludes

- A new ontology kind or a graph relation for constellation membership.
- Accepting constellation membership as project meaning, dependency evidence, or complete impact coverage.
- Replacing canonical ontology nodes with copied collection records.
- Automatically sending the saved set to an external agent or service.

## Evidence

- `src/features/saved-constellations`: shared saved-constellation hook and actions.
- `src/widgets/saved-constellations`: Galaxy editor and current-set controls.
- `src/views/library/ui/LibraryConstellations.tsx`: Library list, member resolution, and map re-entry.
- `mcp/src/tools/constellations.mjs`: bounded read-only `list_constellations` and `get_constellation` tools.
- `cli/src/commands/constellations.mjs`: connector-less constellation inventory and detail commands.