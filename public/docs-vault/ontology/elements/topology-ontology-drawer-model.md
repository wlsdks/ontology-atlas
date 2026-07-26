---
slug: elements/topology-ontology-drawer-model
kind: element
title: Topology Ontology Drawer Model
domain: views
---

`src/views/home/lib/topology-ontology-drawer.ts` builds the shared selected-node
facts model behind the compact canvas popover, plain-language significance
line, and relation-provenance classification.

It computes direct incoming/outgoing relations, relation type and provenance
counts, relation quality, a bounded preview, owning domain, honest
own-document/mentioned-in fields, and transitive dependency/dependent reach.
The projections reuse this one computation so counts cannot drift between
surfaces.

The old `TopologyOntologyDrawer` collaborator-brief formatter, vocabulary
review tabs, and MCP/CLI check-string exports were deleted. Opt-in full detail
now lives in `full-detail-a1`; this model contains only facts consumed by the
surviving Topology surfaces.
