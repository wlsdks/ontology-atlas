---
slug: project
kind: project
title: My project
display_ko: 내 프로젝트
display_en: My project
domains:
  - domains/example-domain
capabilities:
  - capabilities/example-capability
elements:
  - elements/example-element
---

# My project

Write a one- or two-line summary of your project here — *what / for whom / why*.
This node sets the outcome and scope for the rest of the graph; it is not a
synonym for a repository, monorepo, department, or release phase.

Kind and relation contract:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## One-line mission

The problem this project solves, or the value it creates, in a single sentence.

## How it grows

- Fill in `domains: [...]` in the frontmatter and the domain nodes hang
  off your project tree automatically.
- Each domain's capabilities and elements follow the same pattern.
- When an AI agent proposes a new node, confirm its meaning before it writes.
  Frontmatter is the source of truth once written; git keeps the change
  inspectable.

## Next steps

1. Edit this file's `title` (and any other frontmatter besides `kind: project`)
   to match your project.
2. Rename one starter in place, or create each additional domain through Studio,
   MCP `add_concept`, or CLI `add`. Never copy a starter UID into a new node.
3. Register an AI agent (Claude Code, Cursor, …) and ask it to "tidy up
   the ontology in this vault."
