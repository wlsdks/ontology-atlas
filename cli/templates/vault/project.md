---
slug: project
kind: project
title: My project
domains:
  - domains/example-domain
capabilities:
  - capabilities/example-capability
elements:
  - elements/example-element
---

# My project

Write a one- or two-line summary of your project here — *what / for whom / why*.

## One-line mission

The problem this project solves, or the value it creates, in a single sentence.

## How it grows

- Fill in `domains: [...]` in the frontmatter and the domain nodes hang
  off your project tree automatically.
- Each domain's capabilities and elements follow the same pattern.
- When an AI agent adds a new node, this file's `depends_on` / `domains`
  may auto-update — frontmatter is the source of truth, so there are no
  conflicts.

## Next steps

1. Edit this file's `title` (and any other frontmatter besides `kind: project`)
   to match your project.
2. Rename or copy starters like `domains/example-domain.md` into your real domains.
3. Register an AI agent (Claude Code, Cursor, …) and ask it to "tidy up
   the ontology in this vault."
