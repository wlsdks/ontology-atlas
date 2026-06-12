---
slug: elements/ontology-design-surface-guard
kind: element
title: Ontology Design Surface Guard
domain: views
relates: [elements/builder-graph-anchor-rail, elements/insights-query-cockpit]
---

`scripts/check-ontology-design-surface.mjs` powers `pnpm design:ontology`.

It scans `/ontology`, `/ontology/edit`, `/ontology/insights`, ontology subnav, and operations nav source files for design-system drift: glow-like hover shadows, scale hover, glass blur, purple/pink accents, decorative gradients, and full-height kind decision stripes that make detail cards read like generated AI callouts. It also checks that the workbench structure contracts remain wired in source: Browse / Write / Query plus graph DB proof and runtime-gate copy on `/ontology`, Workspace execution contract on `/docs`, Source / Draft / Guard / Proof plus saved node entrypoints on `/ontology/edit`, the executable query cockpit plus runtime gate and result contracts on `/ontology/insights`, and topology kind legend role descriptions on `/topology`. The Workspace and Insights contracts now explicitly require `relation_name_parity` and `pattern_walk/project_map` runtime replay markers, while the topology legend contract requires the five `kindLegend*Role` strings so the map explains project/domain/capability/element/unknown roles rather than showing color alone. The runtime e2e guard also checks that mobile operations chrome and write-summary controls keep visible hitboxes inside the viewport, including the compact demo/local mode badge; the mobile mode badge must keep a visible text label instead of collapsing to a dot-only affordance. The guard turns the design-system comparison into a repeatable local gate for the ontology workbench instead of a one-off manual grep.
