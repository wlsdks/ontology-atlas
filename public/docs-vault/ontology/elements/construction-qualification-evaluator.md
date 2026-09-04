---
uid: 899d10d4-289c-4b79-a3f1-c3a9304ef24b
slug: elements/construction-qualification-evaluator
kind: element
title: Construction Qualification Evaluator
display_ko: 구축 자격 판정기
domain: domains/project-portfolio
path: mcp/src/construction-qualification.mjs
created_by: "agent:codex"
---

## Definition

The construction qualification evaluator is the pure categorical policy engine for `constructionQualification:v1`. It validates purpose authority, independent actors, motivating scenarios, human-approved competency questions, current witnesses, exact claims and citations, target coverage, source-hidden execution, seven independent quality axes, regression, resource use, and digest-bound human acceptance without averaging them into a score.

## Project-owned FDE authority

Executive, employee, and agent are required across at least four cases. FDE remains an optional compatibility value and is unusable unless project purpose authority declares `audience:fde`, the CQ belongs to a named project meaning owner, and current `audience-authority:fde` evidence from a declared purpose source reaches the CQ result, a supported claim, and its exact verified citation.

## Boundary

The evaluator reads no repository source, invokes no MCP tool, writes no vault, and authenticates no human identity. It judges only the supplied digest-bound packet and keeps missing, stale, unsupported, conflicting, partial, unknown, refused, or unowned evidence visible and fail-closed.

## Evidence

- Primary implementation: `mcp/src/construction-qualification.mjs#evaluateConstructionQualification`
- Supporting implementation: `mcp/src/construction-qualification.mjs#CONSTRUCTION_QUALIFICATION_CONTRACT`

## Includes

- The pure categorical `constructionQualification:v1` policy: purpose authority, independent actors, motivating scenarios, competency questions, witnesses, citations, coverage, and seven quality axes.
- Keeping missing, stale, unsupported, conflicting, or unowned evidence visible and fail-closed rather than averaged into a score.
- The project-owned FDE compatibility path, gated on declared `audience:fde` purpose authority and current `audience-authority:fde` evidence.

## Excludes

- Reading repository source or invoking any MCP tool: the evaluator only judges a supplied digest-bound packet.
- Writing the vault or authenticating a human identity; that is the caller's and the qualification-handoff helper's responsibility.
- Evaluating a meaning proposal's content, owned by elements/meaning-proposal-evaluator.
