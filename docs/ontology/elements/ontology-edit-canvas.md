---
slug: elements/ontology-edit-canvas
kind: element
title: Ontology Edit Canvas
domain: views
---

`src/views/ontology-edit/ui/OntologyEditCanvas.tsx` renders the xyflow canvas inside `/ontology/edit`, while `src/views/ontology-edit/ui/OntologyEditPage.tsx` now owns the page-level graph entrypoint rail above that canvas.

The canvas turns the local vault manifest into editable graph nodes and edges, keeps vault nodes draggable, and writes persisted positions back to `canvasPosition` when a live vault is open. It also owns the large-graph viewport recovery path: graph-ready fit, delayed anchor centering for hydrated vaults, and full node rendering in the desktop WebView.

The page-level `Graph entrypoints` rail keeps project/domain anchors visible even if the WebView is still hydrating or the full graph overview is too small to read. Each anchor uses the same selected-node/focus pipeline as search and deep links, so the builder starts with a real ontology handle before the user draws anything.

This makes the builder read as a graph workbench instead of an empty drawing surface: the user sees real ontology anchors, can jump to a concrete node, and can continue relation editing with the same Source / Draft / Guard / Proof contract above the canvas.
