---
uid: e24da401-cc38-4e66-96e9-8c627a093ff6
slug: capabilities/construction-qualification-gate
kind: capability
title: Construction qualification gate
display_en: Construction qualification gate
display_ko: 구축 자격 게이트
domain: domains/code-evidence
elements: [elements/qualification-packet-evaluator]
path: mcp/src/construction-lifecycle.mjs
created_by: "agent:claude-code"
relation_notes: { elements/qualification-packet-evaluator: "You asked me to turn imports I actually witnessed into dependencies: the scan shows construction-lifecycle.mjs importing construction-qualification.mjs." }
dependencies: [elements/qualification-packet-evaluator]
---

Decides whether a whole proposed ontology derived from a repository may be released for bulk writing, by requiring an evaluator separate from its maker plus the person's approval of that exact plan before any write rows appear.

## Includes
- A staged status bound to the plan and source digests, with the write plan withheld until the same proposal comes back qualified.
- A fail-closed outcome on plan or source drift, a maker-only evaluation, an unmeasured axis, or an unapproved gap.

## Excludes
- The incremental write path, which stays open and is governed by warnings rather than this gate.
- Certifying that qualified meaning is true; the gate records provenance, not truth.

## Uncertainty
- Read from its module header, its dependence on the packet evaluator, and the analyzer's own contract. It was never exercised here: this session has no independent evaluator, so the gate held the bulk route closed throughout and every node in this vault came through the incremental path instead.