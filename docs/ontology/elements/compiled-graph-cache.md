---
uid: 1e1fcec4-88d6-46fe-ba74-8e2f0d2ea0ca
slug: elements/compiled-graph-cache
kind: element
title: Compiled graph cache
display_en: Compiled graph cache
display_ko: 컴파일 그래프 캐시
domain: domains/meaning-layer
path: mcp/src/compiled-cache.mjs
created_by: "agent:claude-code"
---

Reuses an already-compiled graph across several calls in one session, but only while the loaded documents still carry the same signature.

## Includes
- A single in-process cache keyed on the documents' slug, modification time and content signature.
- Hit and miss counts, so reuse is observable rather than assumed.

## Excludes
- Becoming a source of truth; the files on disk stay authoritative and a changed file invalidates the entry.
- Persisting between processes.

## Uncertainty
- Read in full at sixty lines, and its only production consumer is the server runtime. Whether the terminal surface gets the same reuse was not checked.