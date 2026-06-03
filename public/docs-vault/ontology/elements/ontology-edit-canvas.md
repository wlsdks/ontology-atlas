---
slug: elements/ontology-edit-canvas
kind: element
title: Ontology Edit Canvas
domain: views
---

# Ontology Edit Canvas

`src/views/ontology-edit/ui/OntologyEditCanvas.tsx` renders the xyflow canvas inside `/ontology/edit`, while `src/views/ontology-edit/ui/OntologyEditPage.tsx` owns the page-level graph entrypoint rail and write/proof controls around that canvas.

The builder is optimized for graph-first work: persisted vault nodes and relation edges should remain the primary visual objects, with onboarding, entry anchors, save state, relation guard, and graph proof available only when they help the current action.

The write/proof summary is intentionally an on-demand compact menu, not a permanently visible numbered stepper. Source state, draft safety, relation guard, and Graph DB proof are still present for AI-agent handoff and human confidence, but the canvas keeps the main screen budget.

This element supports the ontology workbench contract: humans manipulate meaning nodes visually, while Claude Code/Codex can still receive precise guard/proof packets that map the UI action back to vault markdown and graph DB-style verification.