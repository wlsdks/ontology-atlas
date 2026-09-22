---
uid: 0c31a367-819b-436d-8319-38d224aff5cd
slug: elements/uncertainty-next-reads
kind: element
title: Uncertainty next reads
display_en: Uncertainty next reads
display_ko: 불확실성 다음 읽기
domain: domains/meaning-layer
path: mcp/src/uncertainty-reads.mjs
created_by: "agent:claude-code"
dependencies: [elements/meaning-gap-findings]
relation_notes: { elements/meaning-gap-findings: "You asked me to witness the import: mcp/src/uncertainty-reads.mjs:14 imports uncertaintySectionLines from meaning-findings.mjs to find the section it reads." }
---

Reads what a node's author recorded as not read and turns each of those sentences into a named next read — which file, which lines, and what kind of gap — so the most honest prose in the vault becomes work somebody can pick up.

## Includes
- One row per statement under a node's `## Uncertainty` heading, sorted so the cheapest complete answer comes first: a named range, then an unread file, then an unopened area.
- A kept row for a statement whose wording matches no known shape, so the vault never learns that only recognised phrasing counts.

## Excludes
- Performing the read or writing anything back; a row is work named, not work done.
- Judging whether the recorded unknown matters to the product.

## Uncertainty
- Read the module header and both exports (`mcp/src/uncertainty-reads.mjs:1-30`, `:215`, `:252`) and the call site inside the growth plan (`mcp/src/ontology-engine.mjs:3471`). The classification phrasings themselves were not read, and the parallel copy the header points at in `cli/src/lib/query-result-contract.mjs` was seen referenced but not opened.