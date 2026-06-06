---
slug: elements/builder-graph-anchor-rail
kind: element
title: Builder Graph Anchor Rail
domain: views
relates: [elements/insights-query-cockpit]
---

`src/views/ontology-edit/lib/builder-entry-anchors.ts` derives the saved node entrypoints shown at the top-left of `/ontology/edit`.

The rail ranks persisted ontology nodes by graph degree while preserving project/domain/capability/element diversity. This makes the builder open from useful graph entrypoints instead of arbitrary manifest order, so focus, inspector edits, and proof links stay attached to meaningful saved slugs before the user starts drawing new relations.

The rail is collapsed by default into a small top-left `Saved nodes` / `저장된 노드` pill. That keeps the builder's first viewport canvas-first: the user sees the selected slug handle without carrying a full saved-node strip across the graph.

When expanded, the rail is rendered as a flat one-line canvas status strip rather than a floating card or multi-row node shelf. It stays visually subordinate to the Source / Draft / Guard / Proof strip, avoids decorative shadow, and keeps the canvas readable by showing one current focus handle plus a compact picker for the remaining saved nodes.

The visible rail now centers the write/proof handle: graph counts, the `pick focus node` chip, the active slug, the primary node button, and the `+N more` picker. The longer three-step contract (`pick focus node`, `edit or connect`, `proof same slug`) remains in screen-reader text and proof copy, but no longer consumes canvas space.

The rail also repeats the currently focused saved slug and marks the matching node button as active. That gives the user a visible write/proof handle before they drag a relation: the canvas focus, details panel, relation confirmation, and Builder proof packet all point at the same vault slug instead of leaving the current focus implicit.

Each saved node still names the vault slug in the title and accessible label, while the compact visible button shows only the kind marker, label, and connection count. The full saved-node set moves into the center picker dialog so users can choose the exact frontmatter id without forcing every high-degree node onto the first canvas viewport.
