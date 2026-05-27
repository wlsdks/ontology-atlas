---
slug: elements/builder-graph-anchor-rail
kind: element
title: Builder Graph Anchor Rail
domain: views
relates: [elements/insights-query-cockpit, elements/ontology-graph-proof-rail]
---

`src/views/ontology-edit/lib/builder-entry-anchors.ts` derives the saved graph anchors shown at the top-left of `/ontology/edit`.

The rail now ranks persisted ontology nodes by graph degree while preserving project/domain/capability/element diversity. This makes the builder open from useful graph entrypoints instead of arbitrary manifest order, so focus, inspector edits, and proof links stay attached to meaningful saved slugs before the user starts drawing new relations.