---
uid: 570c1f4e-32da-4d4f-a636-3064b2c84233
slug: capabilities/analysis-archive
kind: capability
title: Analysis archive
display_en: Analysis archive
display_ko: 분석 기록 보관소
domain: domains/code-evidence
elements: []
path: mcp/src/analysis-records.mjs
created_by: "agent:claude-code"
---

Keeps every analysis and inspection run as a dated immutable record that can be listed and re-read later, so a past reading of the code survives the session that produced it.

## Includes
- Listing past runs and reading one exact record by its identifier, with paging.
- Retained raw answers, request scope and stated uncertainty, joined to the review that judged them.

## Excludes
- Treating a stored record as approved ontology fact or as evidence that the source is still valid today.
- Editing a record once written.

## Uncertainty
- Read from the module header, its consumer in the graph tool layer, and the archive operations that tool advertises. No records exist in this vault yet, so nothing was listed or read back during this scan.