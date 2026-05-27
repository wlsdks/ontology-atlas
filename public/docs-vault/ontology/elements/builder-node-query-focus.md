---
slug: elements/builder-node-query-focus
kind: element
title: Builder Node Query Focus
domain: views
---

# Builder Node Query Focus

`src/views/ontology-edit/lib/resolve-builder-query-node.ts` normalizes the `node` query for `src/views/ontology-edit/ui/OntologyEditPage.tsx`, accepting exact live-vault slugs, dogfood `ontology/`-prefixed slugs, and frontmatter `slug` aliases.

`OntologyEditPage` uses the resolved slug to select that vault node in the inspector while panning the canvas to it.

This is the cross-surface handoff used by `/topology`: a user can inspect an ontology node in the topology drawer, Focus review order, Path proof packet, or Health repair target, then jump directly into builder context without re-finding the node. `src/entities/knowledge-graph/lib/ontology-node-href.ts` owns the shared graph-id to builder-query conversion so these surfaces do not drift into incompatible `?node=` formats.

`src/views/ontology-edit/lib/resolve-builder-proof-node.ts` resolves the selected builder document back into the ontology graph node id that `/ontology/insights` expects. Project docs use the frontmatter slug (`project:oh-my-ontology`) while non-project docs use the file tail (`domain:views`), so the builder Proof card opens a focused Insights panel instead of handing off an unresolvable vault path.
