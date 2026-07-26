---
slug: elements/ontology-kind-tone-contract
kind: element
title: Ontology Kind Tone Contract
domain: views
---

# Ontology Kind Tone Contract

`src/entities/ontology-class/model/tone.ts` is the source of truth for the five
rendered ontology kind classes and their chip, border, label, and nominal size
values. Current consumers use it for compact kind facts, legends, summaries,
and shared classification language.

Topology canvas nodes do not consume these fills: `topology-map-v2` uses quiet
engraved map tokens and exposes kind through shape, label, legend, and
hierarchy. This prevents categorical UI color from becoming the canvas
attention winner. The removed Sigma adapter, tree kind chips, and Builder
palette are historical consumers only.

The contract does not rely on color alone; text labels, icons, node shape/size,
and the visible kind legend preserve the same semantic distinction.
