---
slug: domains/example-domain
kind: domain
title: Example domain
display_ko: 예시 영역
display_en: Example domain
capabilities:
  - capabilities/example-capability
elements:
  - elements/example-element
---

# Example domain

A *domain* is a durable responsibility, problem, vocabulary, or ownership
boundary that groups coherent capabilities and would survive an implementation
rewrite. A source/package folder, team, technology, lifecycle phase, or workflow
name is evidence to investigate—not a domain by itself.

Kind and relation contract:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## How to fill it in

- Describe the responsibility it owns, what is inside and outside the boundary,
  and the evidence that supports that meaning.
- Rename this file to a real domain only after that test passes
  (`domains/identity.md`, `domains/billing.md`, …).
- Markdown links to other domains / capabilities in the body register as
  backlinks automatically.
- Frontmatter keys:
  - `capabilities: [...]` — slugs of capabilities this domain owns
  - `depends_on: [...]` — other domains or external systems this depends on
  - `relates: [...]` — loose related-to references (optional)

## Keep it or delete it?

- Keep it: fill it in following the guide above.
- Don't need it: just delete this file — it's only a starter.
