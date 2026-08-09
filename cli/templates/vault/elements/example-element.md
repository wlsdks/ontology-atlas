---
slug: elements/example-element
kind: element
title: Example element
display_ko: 예시 구성요소
display_en: Example element
domain: domains/example-domain
---

# Example element

An *element* is a distinct implementation role that realizes or proves a
capability and has evidence someone can open. A bare path, import edge, or
dependency name is evidence—not a concept by itself. Name the role; put its
canonical repository-relative entrypoint in `path:`.

Kind and relation contract:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## How to fill it in

- Describe what role this element plays, which capability it realizes or proves,
  and the path or interface that verifies the claim.
- Frontmatter keys:
  - `domain: <slug>` — the single parent domain
  - `path: <src/...>` — code path this element corresponds to (optional)
  - `depends_on: [...]` — other elements / capabilities this depends on
  - `relates: [...]` — loose related-to references (optional)
