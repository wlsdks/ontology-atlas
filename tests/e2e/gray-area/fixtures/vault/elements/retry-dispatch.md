---
uid: f5783b86-97ac-4e77-b00c-b34a8b254194
slug: elements/retry-dispatch
kind: element
title: Retry dispatch
display_en: Retry dispatch
display_ko: 재시도 전달
domain: domains/request-safety
path: src/retry/index.ts
created_by: "agent:atlas-gray-area-proof"
---

Passes the request to the local write-policy decision.

## Includes
- Preserving request fields while selecting a policy.

## Excludes
- Persisting a report.

## Uncertainty
- The behavior at src/retry/index.ts:3-5 was not verified after changing the runner.
