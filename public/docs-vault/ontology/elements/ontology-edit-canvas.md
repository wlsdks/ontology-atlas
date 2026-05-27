---
slug: elements/ontology-edit-canvas
kind: element
title: Ontology Edit Canvas
domain: views
---

`src/views/ontology-edit/ui/OntologyEditCanvas.tsx` renders the xyflow canvas inside `/ontology/edit`, while `src/views/ontology-edit/ui/OntologyEditPage.tsx` now owns the page-level graph entrypoint rail above that canvas.

The canvas turns the local vault manifest into editable graph nodes and edges, keeps vault nodes draggable, and writes persisted positions back to `canvasPosition` when a live vault is open. It also owns the large-graph viewport recovery path: graph-ready fit, delayed node-scoped anchor fitting for hydrated vaults, sparse persisted-position recovery, and full node rendering in the desktop WebView.

The page-level `Graph entrypoints` rail keeps project/domain anchors visible even if the WebView is still hydrating or the full graph overview is too small to read. It now includes a compact focus contract beside the node/ref counts (`focus saved slug` / `저장 slug 먼저`): pick a persisted anchor before drawing so the canvas focus, inspector state, and proof links keep the same slug. Each anchor uses the same selected-node/focus pipeline as search and deep links, so the builder starts with a real ontology handle before the user draws anything.

The first viewport now lands on a concrete anchor card after measuring the full vault graph instead of staying at an unreadable whole-graph thumbnail. This makes the builder read as a graph workbench instead of an empty drawing surface: the user sees real ontology anchors, can jump to a concrete node, and can continue relation editing with the same Source / Draft / Guard / Proof contract above the canvas.

Persisted canvas coordinates are treated as a complete layout only when enough nodes have them. If a larger vault has just a few stale `canvasPosition` entries, the builder falls back to the deterministic graph layout instead of letting those outliers stretch the first viewport into a tiny thumbnail. Fully positioned small graphs and deliberate user layouts still restore from frontmatter.

The builder onboarding copy now matches that same contract: vault-to-vault edges are described as opening a write preview and relation preflight before save, not as automatic writes. This keeps the empty-vault coach mark aligned with the `Guard` status cell and the relation confirmation panel, so first-time users learn the graph write safety loop before drawing their first saved relation.
