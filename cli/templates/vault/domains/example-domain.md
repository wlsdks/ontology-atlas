---
slug: domains/example-domain
kind: domain
title: Example domain
capabilities:
  - capabilities/example-capability
---

# Example domain

A *domain* is a large area of your project (subsystems like auth,
billing, builder, realtime, search). Rename this file to match one of
your real domains (`domains/auth.md`, `domains/billing.md`, …) and list
the capabilities it owns under `capabilities:` in the frontmatter above.

## How to fill it in

- Use one or two paragraphs of body text to describe *what this domain is*.
- Markdown links to other domains / capabilities in the body register as
  backlinks automatically.
- Frontmatter keys:
  - `capabilities: [...]` — slugs of capabilities this domain owns
  - `depends_on: [...]` — other domains or external systems this depends on
  - `relates: [...]` — loose related-to references (optional)

## Keep it or delete it?

- Keep it: fill it in following the guide above.
- Don't need it: just delete this file — it's only a starter.
