---
uid: fe99e84b-5379-4cc2-a45a-c9c25ca1100a
slug: elements/architecture-record-receipt
kind: element
title: Architecture record receipt
display_en: Architecture record receipt
display_ko: 아키텍처 기록 영수증
domain: domains/code-evidence
path: mcp/src/architecture/architecture-record.mjs
created_by: "agent:claude-code"
---

Wraps one architecture conformance measurement as a dated machine receipt carrying the reviewed profile's identity and content hash, so a past verdict can be re-read and told apart from today's.

## Includes
- A dated envelope around one conformance result plus the profile identity that produced it.
- Storage in a local sidecar, replaced atomically per profile.

## Excludes
- Storing the profile body; only its identity and hash travel with the receipt.
- Becoming an ontology node or in-vault Markdown; the record is deliberately not committed.

## Uncertainty
- Read on 2026-11-19 with its consumers. No module under `mcp/src/` imports it. Its only writer was a terminal command removed on 2026-11-22, so nothing writes a record now; only its tests and `tests/contract/harness/architecture-record.contract.test.ts` load it. The app's architecture screen reads stored records (`src/views/architecture/model/use-architecture-record.ts`) and rebuilds one from an analysis run. No record has been written for this vault.