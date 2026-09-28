---
uid: d49d7cd8-2cb3-4d33-96b3-b3af5ad374b0
slug: elements/write-policy
kind: element
title: Write policy
display_en: Write policy
display_ko: 쓰기 권한 규칙
domain: domains/request-safety
path: src/policy/index.ts
created_by: "agent:atlas-gray-area-proof"
---

Derives whether a local request permits writing.

## Includes
- The readOnly flag check.

## Excludes
- Executing a write.

## Uncertainty
- Resolved on 2026-09-20: src/policy/index.ts was read and its synchronous flag decision verified.
