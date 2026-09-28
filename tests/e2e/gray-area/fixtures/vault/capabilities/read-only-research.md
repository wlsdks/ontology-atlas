---
uid: 03cb9459-5097-411e-bcfb-310ae7104754
slug: capabilities/read-only-research
kind: capability
title: Read-only research
display_en: Read-only research
display_ko: 읽기 전용 조사
domain: domains/request-safety
elements: [elements/request-shape, elements/retry-dispatch, elements/title-format, elements/write-policy]
path: src/research/index.ts
created_by: "agent:atlas-gray-area-proof"
dependencies: [elements/retry-dispatch]
relation_notes: { elements/retry-dispatch: src/research/index.ts imports and invokes retryRequest from src/retry/index.ts. }
---

Starts an investigation with read-only authority.

## Includes
- Passing a read-only request to retry dispatch.

## Excludes
- Authorizing a Wiki write.

## Uncertainty
- The retry behavior in src/retry/index.ts was not verified.
