---
slug: elements/builder-node-query-focus
kind: element
title: Builder Node Query Focus
domain: views
---

# Builder Node Query Focus

`src/views/ontology-edit/lib/resolve-builder-query-node.ts` normalizes the `node` query for `src/views/ontology-edit/ui/OntologyEditPage.tsx`, accepting exact live-vault slugs, dogfood `ontology/`-prefixed slugs, and frontmatter `slug` aliases.

`OntologyEditPage` uses the resolved slug to select that vault node in the inspector while panning the canvas to it.

This is the cross-surface handoff used by `/topology`: a user can inspect an ontology node in the topology drawer, then jump directly into builder context without re-finding the node.
