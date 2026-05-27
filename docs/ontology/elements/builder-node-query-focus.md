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

`src/views/ontology-edit/lib/resolve-builder-proof-node.ts` resolves the selected builder document into two explicit ids: the ontology graph node id that `/ontology/insights` expects and the canonical vault slug that MCP/CLI proof commands expect. Project docs use the frontmatter slug for the Insights node id (`project:oh-my-ontology`) while non-project docs use the file tail (`domain:views`), but the copied Proof packet keeps commands on vault slugs such as `domains/views` or `elements/insights-query-cockpit`. The builder Proof card can therefore open a focused Insights panel without handing Claude Code, Codex, or terminal users a graph-id alias where a vault slug is clearer and safer.
