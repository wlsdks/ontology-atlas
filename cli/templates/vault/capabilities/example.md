---
slug: capabilities/example
kind: capability
title: Example capability
domain: domains/example
elements:
  - elements/example
---

# Example capability

A *capability* is one user-visible feature within a domain (login,
signup, checkout, search, builder canvas, …). Rename this file to match
one of your real capabilities (`capabilities/login.md`,
`capabilities/checkout.md`) and update the `domain:` and `elements:`
keys above accordingly.

## How to fill it in

- In the body, describe *what this capability does* and one or two user
  scenarios.
- Frontmatter keys:
  - `domain: <slug>` — the single parent domain
  - `elements: [...]` — slugs of elements this capability uses
  - `depends_on: [...]` — other capabilities this depends on
  - `relates: [...]` — loose related-to references (optional)
