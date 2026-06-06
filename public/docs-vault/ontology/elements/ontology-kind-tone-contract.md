---
slug: elements/ontology-kind-tone-contract
kind: element
title: Ontology Kind Tone Contract
domain: views
---

# Ontology Kind Tone Contract

`src/entities/ontology-class/model/tone.ts` is the shared visual contract for ontology kind colors.

It defines the five rendered ontology categories as nominal, qualitative classes:

- `project`: magenta, product/system scope anchor.
- `domain`: cyan, shared vocabulary boundary.
- `capability`: yellow, user-visible behavior or workflow.
- `element`: green, concrete implementation part.
- `unknown`: orange, temporary review-needed classification.

The contract is consumed by the Sigma topology adapter, ontology tree kind chips, and the Builder kind palette. This keeps the map, browse tree, and editing workflow from drifting into different color semantics.

The UI does not rely on color alone. Each colored mark is paired with the kind label, icon, visible legend or size hierarchy, matching WCAG SC 1.4.1's requirement that color should not be the only way to communicate meaning. The tests also check dark-canvas contrast for graph fills, matching WCAG SC 1.4.11's expectation that meaningful graphical objects stay visible against adjacent colors.
