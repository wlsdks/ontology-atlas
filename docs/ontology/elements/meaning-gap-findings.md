---
uid: df5c25f8-b789-48b7-9dc9-76d2a4f8d2f0
slug: elements/meaning-gap-findings
kind: element
title: Meaning gap findings
display_en: Meaning gap findings
display_ko: 의미 결락 검출
domain: domains/meaning-layer
path: mcp/src/meaning-findings.mjs
created_by: "agent:claude-code"
---

Reads a node's prose rather than its frontmatter, and names what a concept is missing: no definition sentence, no stated boundary, no stated unknown.

## Includes
- The definition, boundary and uncertainty checks a write path reports back immediately.
- The rule that an exclusion describing what the author did not read is not a product boundary.

## Excludes
- Blocking a write; every finding is a warning naming its own repair.
- Judging whether a present definition is accurate.

## Uncertainty
- Read from the module header, which records why prose judgment was added after frontmatter-only checks proved insufficient. The individual finding implementations were not read.