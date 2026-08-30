---
uid: 2a62e2be-ce8e-4923-8883-da0630e64152
slug: capabilities/construction-review
kind: capability
title: Construction Qualification Review
display_ko: 온톨로지 구축 검수
display_en: Construction Qualification Review
domain: domains/project-portfolio
elements: [elements/project-detail, elements/qualification-handoff-helper]
path: src/entities/construction-review
created_by: "agent:unknown"
relation_notes: { elements/project-detail: Construction qualification is opened and judged inside the existing project-detail workbench., elements/qualification-handoff-helper: "Construction qualification uses this private source-checkout helper to preserve exact candidate, evidence, actor, approval, and release boundaries without writing a vault." }
---

## Definition

Read conclusions first in project details for verified ontology construction artifacts, then unfold digest-bound evidence and exact plans when needed to make judgments. Malformed inputs, different projects, or digest/plan mismatches do not appear as normal judgments but close with failure; files are not saved outside the session or written to the vault.

## Source-checkout qualification handoff

The private qualification handoff helper emits canonical proposal coverage before claim authoring, seals payload witnesses without requiring callers to reproduce transport hashes, and packages isolated source-hidden and source-aware receipts through join, human acceptance, and release. Every actor discovers the complete contract from a file-backed schema; truncation, actor/access collision, claim or citation drift, and pre-join acceptance fail closed before any writer call.

## Boundary

The helper invokes no MCP tool and writes no vault content. It derives transport-only fields, while builders, evaluators, auditors, and the named human owner retain responsibility for meaning, evidence judgments, gaps, and acceptance.
