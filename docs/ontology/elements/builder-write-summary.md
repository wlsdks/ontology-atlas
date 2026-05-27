---
slug: elements/builder-write-summary
kind: element
title: Builder Write Summary
domain: views
---

`src/views/ontology-edit/ui/OntologyEditPage.tsx` owns the compact `Source` / `Draft` / `Guard` / `Proof` status strip above the `/ontology/edit` canvas.

The strip makes the builder's write contract visible before the user draws: source tells whether the current graph is a writable local markdown vault, a restoring desktop vault, or a read-only sample; draft separates unsaved canvas work; guard names relation preflight; proof hands the saved slug to the graph DB + health query cockpit.

Each status cell now uses the same visible execution-order block as the `/ontology` Browse / Write / Query cards: `01 Source`, `02 Draft`, `03 Guard`, and `04 Proof` are carried by the leading icon block instead of a small trailing badge. That makes the builder first viewport read as source check → draft work → preflight guard → graph proof, matching the design-system write/verify loop before the user opens the help popover.

The proof cell now also copies a portable builder graph proof packet. With no selected node, the packet starts from `workspace_brief`, graph scans, and `health`; with a selected node, the visible Insights link, card copy, and copied MCP/CLI packet all prefer the canonical vault slug. It then switches to `node_profile`, incoming `blast_radius`, incoming/outgoing `match_edges`, `query_plan(all_paths)`, bounded `all_paths`, `relation_check` target/type placeholders, and the same sync gate. That keeps the builder first viewport in the write → verify loop even before a relation confirmation panel appears, without showing a graph-id alias where a vault slug is clearer and safer.

The desktop restore state exists because the macOS app can route into Builder before the persisted vault manifest finishes rehydrating. During that window the Source cell must not claim "sample read-only"; it shows `desktop restore` until `useLocalVault()` reports the selected vault manifest.
