---
slug: elements/builder-write-summary
kind: element
title: Builder Write Summary
domain: views
---

`src/views/ontology-edit/ui/OntologyEditPage.tsx` owns the compact `Source` / `Draft` / `Guard` / `Proof` status strip above the `/ontology/edit` canvas.

The strip makes the builder's write contract visible before the user draws: source tells whether the current graph is a writable local markdown vault, a restoring desktop vault, or a read-only sample; draft separates unsaved canvas work; guard names relation preflight; proof hands the saved slug to the graph DB + health query cockpit.

Each status cell now uses the same visible execution-order block as the `/ontology` Browse / Write / Query cards: `01 Source`, `02 Draft`, `03 Guard`, and `04 Proof` are carried by the leading icon block instead of a small trailing badge. That makes the builder first viewport read as source check → draft work → preflight guard → graph proof, matching the design-system write/verify loop before the user opens the help popover.

The proof cell now also copies a portable builder graph proof packet. The packet starts with the same connector-less setup proof used by agent handoff (`agent-brief --verify-fallbacks --json`) and the graph DB pack (`agent-brief --graph-db-pack`), so Builder proof begins by proving the local query surface before it asks the user or agent to trust scan rows. With no selected node, the packet then starts from `workspace_brief`, planned `match_nodes`, planned `match_edges`, a frontmatter-key `capability -> element` scan for `type=elements`, `facets`, `schema`, and `health`; the CLI fallback rows include the matching `--plan` scan commands before raw scan commands. With a selected node, the visible Insights link, card copy, and copied MCP/CLI packet all prefer the canonical vault slug. It then switches to `node_profile`, incoming `blast_radius`, planned incoming/outgoing `match_edges`, the same `elements` frontmatter-key edge scan, `query_plan(all_paths)`, bounded `all_paths`, `relation_check` target/type placeholders, and the same sync gate. The evidence checklist now tells agents to report `relationType` and `via` for frontmatter-key scans, so Builder proof distinguishes stored keys like `elements` and `dependencies` from generic `contains` / `relates` edges. That keeps the builder first viewport in the write → verify loop even before a relation confirmation panel appears, without showing a graph-id alias where a vault slug is clearer and safer.

The desktop restore state exists because the macOS app can route into Builder before the persisted vault manifest finishes rehydrating. During that window the Source cell must not claim "sample read-only"; it shows `desktop restore` until `useLocalVault()` reports the selected vault manifest.
