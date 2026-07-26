---
slug: elements/ontology-review-brief
kind: element
title: Ontology Review Brief
domain: views
relates: [elements/ontology-node-detail-modal]
---

> **Superseded (B3 허브가 곧 지도, 2026-07).** `src/views/ontology-view/`
> is physically deleted (commit `3fa2c2508`), including `review-brief.ts`.
> `FullDetailA1` (see `elements/ontology-node-detail-modal`) is the current
> selected-node detail surface, but it does not reproduce the four-tab
> (Overview/Relations/Agent/Review) split described below verbatim — it is
> a single scrollable panel with reach/groups/body-edit sections. The
> agent-facing MCP proof packet idea (node profile, impact, path guard,
> post-change sync) is the part of this doc still conceptually live; the
> concrete tab structure is stale.

`src/views/ontology-view/lib/review-brief.ts` and `src/views/ontology-view/ui/OntologyViewPage.tsx` built the selected concept review surface for the former `/ontology` tree hub.

The selected concept view is a centered modal workbench, not a cramped side rail. It keeps a compact header, a left tab rail, and a scrollable reading pane so people can inspect one concept at a time without losing the graph context behind it.

The tabs separate the jobs a human or AI agent performs on a concept:

- Overview: meaning, key facts, source object, and project/topology jumps.
- Relations: typed incoming/outgoing neighbors and reachability evidence.
- Agent: copyable MCP proof packets for node profile, impact, path guard, and post-change sync.
- Review: collaborator questions, impact summary, vocabulary review, and write guard commands.

This element proves why ontology is useful during development: the UI turns a selected node into a reviewable meaning object, then gives Claude Code/Codex the exact graph checks to run before changing code or vault records.
