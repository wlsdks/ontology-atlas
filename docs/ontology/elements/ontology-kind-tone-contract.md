---
slug: elements/ontology-kind-tone-contract
kind: element
title: Ontology Kind Tone Contract
domain: views
---

# Ontology Kind Tone Contract

`src/entities/ontology-class/model/tone.ts` is the shared visual contract for ontology kind colors.

It defines the five rendered ontology categories as nominal, qualitative classes:

- `project`: indigo, product/system scope anchor.
- `domain`: teal, shared vocabulary boundary.
- `capability`: amber, user-visible behavior or workflow.
- `element`: sage, concrete implementation part.
- `unknown`: brick, temporary review-needed classification.

The contract is consumed by the Sigma topology adapter, ontology tree kind chips, and the Builder kind palette. This keeps the map, browse tree, and editing workflow from drifting into different color semantics.

The contract deliberately separates graph fills from UI chrome. Sigma nodes keep high-contrast muted fills for small marks on a dark canvas, while tree chips, builder controls, and the Browse detail modal use low-alpha chip backgrounds and borders. This avoids the previous magenta/yellow-heavy treatment that made the classification card read like a generic AI SaaS panel instead of a quiet ontology workbench proof.

The UI does not rely on color alone. Each colored mark is paired with the kind label, icon, visible legend or size hierarchy, matching WCAG SC 1.4.1's requirement that color should not be the only way to communicate meaning. The tests also check dark-canvas contrast for graph fills, matching WCAG SC 1.4.11's expectation that meaningful graphical objects stay visible against adjacent colors.
