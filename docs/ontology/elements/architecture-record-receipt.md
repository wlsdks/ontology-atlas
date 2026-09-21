---
uid: fe99e84b-5379-4cc2-a45a-c9c25ca1100a
slug: elements/architecture-record-receipt
kind: element
title: Architecture record receipt
display_en: Architecture record receipt
display_ko: 아키텍처 기록 영수증
domain: domains/code-evidence
path: mcp/src/architecture-record.mjs
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
- Read from the module header and its two imports. No module under `mcp/src/` imports it, so its consumer is on the application side and was not opened; whether a record is produced on every measurement is unverified here.