---
slug: elements/ontology-design-surface-guard
kind: element
title: Ontology Design Surface Guard
domain: views
---

`scripts/check-ontology-design-surface.mjs` powers `pnpm design:ontology`.

It scans the live Source Vault, Workshop, Insights, app rail/settings/mobile
navigation, Topology INDEX, and shared UI directories. The forbidden-pattern
layer rejects glow-like hover shadows, scale hover, glass blur, purple/pink
accents, decorative color gradients, glow rings, and full-height kind decision
stripes.

The structural layer follows the current workbench:

- Source Vault keeps its Files / Graph / Agent execution contract and copyable
  runtime replay.
- Workshop keeps fixed compass bearings, relation-fill/MCP packets, and a plain
  progress caption. The retired xyflow ERD builder is not scanned.
- Insights keeps the exact five-question tab set
  (`do-next`, `composition`, `connections`, `boundaries`, `freshness`), the
  `maintenance-board` / `one-tab-one-question` surface markers, one active
  `tabpanel`, and a `tab-query` agent handoff. The former fixed three-tab
  dashboard, reader-persona lanes, and query cockpit are explicitly not the
  protected structure.
- Product Design OS, `AGENTS.md`, and Relief/Topology token/anti-pattern
  contracts remain pinned.

The 2026-07-27 UX-042 pass added a regression fixture showing that the retired
three-tab dashboard must fail even when it still contains a `TabBar`, census
hero, and copy button. The live command checks 159 implementation files across
10 surfaces plus six structural contracts and reports a normal pass/fail
instead of relying on manual grep.
