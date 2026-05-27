---
slug: elements/ontology-edit-canvas
kind: element
title: Ontology Edit Canvas
domain: views
---

`src/views/ontology-edit/ui/OntologyEditCanvas.tsx` renders the xyflow canvas inside `/ontology/edit`.

The canvas turns the local vault manifest into editable graph nodes and edges, keeps vault nodes draggable, and writes persisted positions back to `canvasPosition` when a live vault is open. It also owns the large-graph viewport recovery path: graph-ready fit, delayed anchor centering for hydrated vaults, full node rendering in the desktop WebView, and the `Graph anchors` rail that keeps project/domain entry points visible even when the full graph is too large to read at overview zoom.

This makes the builder read as a graph workbench instead of an empty drawing surface: the user sees real ontology anchors, can jump to a concrete node, and can continue relation editing with the same Source / Draft / Guard / Proof contract above the canvas.