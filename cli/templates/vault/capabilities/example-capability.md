---
slug: capabilities/example-capability
kind: capability
title: Example capability
display_ko: 예시 기능
display_en: Example capability
domain: domains/example-domain
elements:
  - elements/example-element
---

# Example capability

A *capability* is an observable ability the product, operator, agent, or a
dependent system can perform without prescribing the current module or
framework. A component, package, UI screen, command, workflow step, or README
heading is not a capability without an independent ability claim.

Kind and relation contract:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## Includes

- The one thing this ability actually does, in your own words, once you rename it.

## Excludes

- The nearby ability this one does not provide, so a reader stops looking for it
  here.

## Uncertainty

- Nothing here has been checked against your code yet: this file is a starter,
  not an observation.

## How to fill it in

- State the observable outcome, its boundary, and one or two acceptance
  scenarios. Then rename this file and update `domain:` / `elements:`.
- Frontmatter keys:
  - `domain: <slug>` — the single parent domain
  - `elements: [...]` — slugs of elements this capability uses
  - `depends_on: [...]` — other capabilities this depends on
  - `relates: [...]` — loose related-to references (optional)
