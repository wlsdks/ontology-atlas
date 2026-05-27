---
slug: elements/builder-graph-anchor-rail
kind: element
title: Builder Graph Anchor Rail
domain: views
relates: [elements/insights-query-cockpit, elements/ontology-graph-proof-rail]
---

`src/views/ontology-edit/lib/builder-entry-anchors.ts` derives the saved graph anchors shown at the top-left of `/ontology/edit`.

The rail now ranks persisted ontology nodes by graph degree while preserving project/domain/capability/element diversity. This makes the builder open from useful graph entrypoints instead of arbitrary manifest order, so focus, inspector edits, and proof links stay attached to meaningful saved slugs before the user starts drawing new relations.

The first canvas rail now repeats that as a visible three-step contract: `01 focus saved slug`, `02 edit or connect`, and `03 proof same slug`. This picks up the Source / Draft / Guard / Proof strip at the graph level and keeps the builder from feeling like a freeform diagram surface; the user starts from an existing ontology handle, writes or connects from it, then proves the same slug in the graph DB-style query cockpit.

The rail also repeats the currently focused saved slug and marks the matching anchor button as active. That gives the user a visible write/proof handle before they drag a relation: the canvas focus, inspector, relation confirmation, and Builder proof packet all point at the same vault slug instead of leaving the current anchor implicit.
