---
uid: d4c18150-b6ad-40e3-8d5d-331b5b73051a
slug: elements/source-receipt-store
kind: element
title: Source receipt store
display_en: Source receipt store
display_ko: 소스 영수증 저장소
domain: domains/code-evidence
path: mcp/src/project-source-receipt.mjs
created_by: "agent:claude-code"
dependencies: [elements/source-inspection-probe]
relation_notes: { elements/source-inspection-probe: "You asked me to turn imports I actually witnessed into dependencies: the scan shows project-source-receipt.mjs importing project-source-inspection.mjs to take a fresh reading before judging staleness." }
---

Holds the binding receipt in a local sidecar and decides, on every read, whether the recorded measurement still describes the folder or has gone stale.

## Includes
- Reading, replacing and repairing the sidecar that records the binding.
- The verdict comparing the stored fingerprint, revision and graph hash against a fresh probe, and the named next action when they differ.

## Excludes
- Putting the absolute folder path into the graph, a receipt, or any handoff; it stays local.
- Re-measuring on its own.

## Uncertainty
- Read from the module header and the stale branches of its verdict logic. Observed in use: a stale verdict fired between a measurement and the next call in this session, and the fingerprint inputs that caused it were not identified.