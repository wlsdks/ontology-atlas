---
uid: 334448c3-4496-4f0f-8b5c-f37b421973e3
slug: elements/semantic-evidence-packet
kind: element
title: Semantic evidence packet
display_en: Semantic evidence packet
display_ko: 의미 근거 묶음
domain: domains/code-evidence
path: mcp/src/analyze/semantic-evidence.mjs
created_by: "agent:claude-code"
---

Decides which of a repository's documents are worth quoting, pulls the headings and excerpts that say something, and downgrades trust when a document reads like marketing or an unfilled template.

## Includes
- Document discovery, per-document heading and excerpt extraction inside a fixed character budget.
- A risk scan that flags negated, future-tense or deprecated prose and holds it back as review-only.

## Excludes
- Accepting a quoted sentence as true; every excerpt stays candidate evidence.
- Executing or rendering anything it reads.

## Uncertainty
- Read from the module header and the packet this repository's own scan returned, which flagged one audit document for negated claims. How the risk heuristics behave on prose in other languages was not checked.