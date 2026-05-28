---
slug: elements/ontology-design-surface-guard
kind: element
title: Ontology Design Surface Guard
domain: views
relates: [elements/builder-graph-anchor-rail, elements/insights-query-cockpit, elements/ontology-graph-proof-rail]
---

`scripts/check-ontology-design-surface.mjs` powers `pnpm design:ontology`.

It scans `/ontology`, `/ontology/edit`, `/ontology/insights`, ontology subnav, and operations nav source files for design-system drift: glow-like hover shadows, scale hover, glass blur, purple/pink accents, and decorative gradients. It also checks that the three workbench structure contracts remain wired in source: Browse / Write / Query plus graph DB proof on `/ontology`, Source / Draft / Guard / Proof plus persisted graph anchors on `/ontology/edit`, and the executable query cockpit plus runtime gate and result contracts on `/ontology/insights`. The guard turns the design-system comparison into a repeatable local gate for the ontology workbench instead of a one-off manual grep.
