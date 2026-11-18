---
uid: d96a7100-9ba3-44fc-84b4-5211a891e6bf
slug: elements/frontmatter-parser
kind: element
title: Frontmatter parser
display_en: Frontmatter parser
display_ko: 프론트매터 파서
domain: domains/meaning-layer
path: mcp/src/parser.mjs
created_by: "agent:claude-code"
---

Turns the block at the top of a Markdown file into keys and values, and knows which of those keys are graph edges rather than free metadata.

## Includes
- Scalars, inline lists, inline objects, block lists and block objects, without a YAML library.
- A fixed set of keys treated as graph arrays, so a scalar written at one of them is caught rather than silently dropped later.
- Rebuilding a file's text from parsed values, which is how an edit preserves everything it did not touch.

## Excludes
- Judging whether the parsed values form a valid node; that verdict belongs to validation.
- Reading or writing the file on disk.

## Uncertainty
- Read from the module's own header and its graph-array key list. The repository keeps it capability-synced with `src/shared/lib/vault-document/parse-frontmatter.ts`, a separate implementation of about 680 lines whose header and graph-key set were read on 2026-11-19. `tests/contract/vault-format/parse-frontmatter.contract.test.ts` runs one fixture matrix through all four parsers (app, MCP, scripts and CLI) and passed that day, so agreement rests on that matrix, not on a line-by-line comparison.