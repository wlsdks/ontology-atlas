---
slug: elements/builder-write-summary
kind: element
title: Builder Write Summary
domain: views
---

`src/views/ontology-edit/ui/OntologyEditPage.tsx` owns the compact `Source` / `Draft` / `Guard` / `Proof` status strip above the `/ontology/edit` canvas.

The strip makes the builder persistence contract visible before a user touches the canvas: source distinguishes local writable vaults from sample read-only data, draft counts unsaved canvas nodes and edges, guard explains relation key inference and preflight before frontmatter mutation, and proof hands off to `/ontology/insights/` for graph DB-style validation.

When a vault node is selected, the Proof cell changes from a generic MCP/CLI handoff into selected-node verification: `node_profile`, `blast_radius`, and the shared sync gate for that slug. When a relation write confirmation is open, the Guard cell names the concrete `source.key -> target` relation waiting for preflight, so the top-level builder contract reflects the active graph mutation rather than staying canvas-generic.
