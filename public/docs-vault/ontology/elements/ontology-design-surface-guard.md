---
slug: elements/ontology-design-surface-guard
kind: element
title: Ontology Design Surface Guard
domain: views
---

`scripts/check-ontology-design-surface.mjs` powers `pnpm design:ontology`.

It scans `src/views/docs-vault`, `src/widgets/docs-vault`, `src/views/ontology-edit`, `src/views/ontology-insights`, `src/widgets/ontology-sub-nav`, `src/widgets/operations-nav`, `src/widgets/topology-index-panel`, and `src/shared/ui` for design-system drift: glow-like hover shadows, scale hover, glass blur, purple/pink accents, decorative gradients, and full-height kind decision stripes. It also checks that structural contracts stay wired in source: a Files/Graph/Agent execution contract bar on `/docs`, Source/Draft/Guard/Proof plus saved node entrypoints on `/ontology/edit`, the Product Design OS designer-bench/public-reference contract in `docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md` plus `AGENTS.md`, and the Relief/Topology token anti-pattern contract in `docs/DESIGN-SYSTEM.md` plus `.claude/rules/design.md`.

**Known drift (2026-07, discovered during vault sync, not yet fixed in code):**
the script's `query-cockpit-runtime-gate` check still lists
`src/views/ontology-insights/ui/parts/InsightsQueryPackCockpit.tsx` and
`InsightsFocusedNodeProofPanel.tsx` as required files. Both were deleted when
`/ontology/insights` was rebuilt into its current fixed 3-tab dashboard
(Overview / Relations / Freshness). Because the check unconditionally
`readFileSync`s every listed file, `pnpm design:ontology` currently throws
`ENOENT` on `main` instead of reporting a pass/fail — the guard is broken, not
green. A B3-era comment already documents the sibling `/ontology` retirement
(`OntologyViewPage.tsx` + `ontology-tree-view` widget → `/topology` INDEX
panel) and the removal of the `topology-kind-legend-role-copy` check, but the
insights-cockpit check was not updated in the same pass. Fixing this requires
deciding what the new `/ontology/insights` structural contract should assert
(3-tab dashboard + `InsightsHandoffRow`, not a query cockpit) — a product-design
decision, not a vault-only fix, so it is flagged here rather than patched
silently.

The guard turns the design-system comparison into a repeatable local gate for
the ontology workbench instead of a one-off manual grep — once its own target
list is brought current.