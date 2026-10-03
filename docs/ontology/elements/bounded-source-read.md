---
uid: e7761a89-a867-486e-93ec-29ffe2e71e05
slug: elements/bounded-source-read
kind: element
title: Bounded source read
display_en: Bounded source read
display_ko: 제한된 소스 읽기
domain: domains/code-evidence
path: mcp/src/source-evidence.mjs
created_by: "agent:claude-code"
dependencies: [elements/source-declaration-outline]
relation_notes: { elements/source-declaration-outline: "You asked me to witness the import: mcp/src/source-evidence.mjs:14 imports outlineSource from source-outline.mjs, which is what mode outline returns." }
---

Returns exact repository source lines or declaration outlines under fixed request, line, file and packet budgets so a builder can inspect actual implementation evidence.

## Includes
- Range reads with complete-file hashes, actual ranges and continuation selectors.
- Outline rows without source text or claim citations.
- The same guarded evidence packet in full analysis and opt-in source-only continuations; the caller can avoid repeated candidate scans without changing the evidence.
- Refusal and omission states for unsafe, missing, changed, unreadable or over-budget source, kept visible rather than reported as complete coverage.

## Excludes
- Reading outside the bound repository or interpreting source as accepted meaning.
- Inferring behavior from a declaration or treating an individual packet as a repository-wide snapshot.
- Write plans, human approval or semantic qualification.

## Uncertainty
- The limits, stable-read and selector implementation is in `mcp/src/source-evidence.mjs`; source-only dispatch is in `mcp/src/tools/repo-analysis.mjs`. Sixteen existing source-evidence unit cases and MCP source-only parity/refusal cases ran on 2026-10-03.
- Exact evidence equality and smaller delivery were measured on one calibration range. General host token savings, runtime correctness and ontology quality do not follow from those measurements.
