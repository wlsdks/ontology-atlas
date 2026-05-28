---
slug: elements/ontology-design-surface-guard
kind: element
title: Ontology Design Surface Guard
domain: views
relates: [elements/builder-graph-anchor-rail, elements/insights-query-cockpit, elements/ontology-graph-proof-rail]
---

`scripts/check-ontology-design-surface.mjs` powers `pnpm design:ontology`.

It scans `/ontology`, `/ontology/edit`, `/ontology/insights`, ontology subnav, and operations nav source files for design-system drift: glow-like hover shadows, scale hover, glass blur, purple/pink accents, and decorative gradients. It also checks that the four workbench structure contracts remain wired in source: Browse / Write / Query plus graph DB proof and runtime-gate copy on `/ontology`, Source Vault execution contract on `/docs`, Source / Draft / Guard / Proof plus persisted graph anchors on `/ontology/edit`, and the executable query cockpit plus runtime gate and result contracts on `/ontology/insights`. The Insights contract now explicitly requires focused `blast_radius`, `relation_name_parity`, and `pattern_walk/project_map` runtime replay markers, so the query cockpit cannot regress to a path-only or scan-only proof surface while claiming graph DB-style verification. The guard turns the design-system comparison into a repeatable local gate for the ontology workbench instead of a one-off manual grep.
