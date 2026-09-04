---
uid: eb2a7d5e-0050-4043-b8ae-1300046d7e21
slug: elements/ontology-meaning-editor
kind: element
title: Ontology Meaning Editor
display_ko: 뜻 편집기
domain: domains/graph-modeling
path: src/features/ontology-meaning-editor
created_by: "agent:unknown"
---

A contextual relation editor that shares space with the compact inspector of the selected node on the map. When you select the relation type, target, and reason, it draws a dashed directional preview on the actual map geometry, then writes to frontmatter with expectedMtime after passing the Ontology Change Review. It handles only one relation at a time, avoiding the need to recreate a separate Studio in a small panel.

## Evidence

- Primary implementation: `src/features/ontology-meaning-editor/ui/MeaningEditorPanel.tsx#MeaningEditorPanel`
- Supporting implementation: `src/features/ontology-meaning-editor/ui/MeaningEditorPanel.tsx#candidateAllowed`

## Includes

- The contextual single-relation editor sharing space with the map's compact node inspector: type, target, and reason fields with a live dashed directional preview.
- Writing the confirmed relation to frontmatter with `expectedMtime` only after the change passes Ontology Change Review.

## Excludes

- Multi-relation or bulk editing: deliberately scoped to one relation at a time, unlike the retired Studio surface.
- Rendering the pre-write review card itself, owned by elements/ontology-change-review.
- Deciding whether a candidate relation is allowed at all beyond its own `candidateAllowed` check; schema-level validity is `mcp/src/schema.mjs`.
