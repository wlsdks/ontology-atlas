---
slug: elements/topology-ontology-drawer
kind: element
title: Topology Ontology Drawer
domain: views
dependencies: [elements/ontology-description-helper]
---

`src/views/home/lib/topology-ontology-drawer.ts` is the shared "node facts" model behind the selected-concept surfaces on `/` and `/topology`: direct relations (with source-backed / authored / needs-review provenance), transitive reachability, and the owning domain for a selected node.

The centered modal workbench this element originally described was rejected (badge-soup full-detail surface) and its markdown-export / vocabulary-review / MCP-CLI check-string formatters were deleted along with the old `TopologyOntologyDrawer.tsx`. The full-detail experience now lives in the `full-detail-a1` widget, opened opt-in via the compact popover's "전체 상세 →" link. This module kept only what the surviving consumers still read.

Current contract: the model is a single computation that the compact canvas popover (`topology-node-focus.ts`) and the plain-language significance line (`topology-node-significance.ts`) both project from, so relation and reach counts cannot drift between the two surfaces. Regression coverage lives in `src/views/home/lib/topology-ontology-drawer.test.ts`.
