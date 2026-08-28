---
uid: 82f9af2b-f9b0-4c52-9d63-3cda3ad4b4a8
slug: capabilities/architecture-guided-development
kind: capability
title: Architecture-Guided Development
display_en: Architecture-Guided Development
display_ko: 아키텍처 기반 개발
domain: domains/codebase-architecture
elements: [elements/architecture-profile-contract, elements/architecture-workbench]
path: mcp/src/architecture-profile.mjs
created_by: "agent:unknown"
---

## Definition
The ability for a developer and coding agent to start from a reviewed architecture profile, understand the intended implementation roles and governed import usages, produce an explicit change plan, and verify current source dependencies against the same contract. Unlike the MCP transport, visual design handoff, or ontology map, this capability governs where implementation changes belong and reports usage-qualified violations and measurement gaps without inventing compliance.

## Evidence
- `docs/ontology/architecture/ontology-atlas-web.md`: reviewed FSD role order, scope, exclusions, lower-only dependency policy, and value-only governed usage
- `mcp/src/architecture-profile.mjs` and `mcp/src/index.js`: `architectureBrief:v1`, usage-qualified `architectureConformance:v1`, and public `inspect_architecture`
- `cli/src/commands/architecture.mjs`: exact source-checkout fallback and governed-usage summary
- `src/views/architecture`: Living Blueprint Understand / Plan / Verify workbench and readable policy sentence
- `tests/contract/architecture-profile.contract.test.ts`: web/MCP parser parity and backward-compatible usage declaration

## Agent Contract
Before editing, call `inspect_architecture`, report selected scope, roles, `dependencyUsages`, usage-qualified observed edges, violations, exclusions, and unknowns, then return `architectureChangePlan:v1`. After editing, inspect again and compare the actual result with the plan. Type-only evidence excluded by a reviewed value-only policy remains visible rather than becoming a violation. Unknown import usage never means compliant, and pattern names never come from folder-name inference.

## Inclusion / Exclusion
- Included: reviewed profile discovery, bounded import observation, profile-wide usage qualification, role conformance, change-plan handoff, CLI fallback, and the human Architecture destination
- Excluded: automatic refactoring, per-role usage DSLs, semantic ontology inference, exhaustive runtime dependency truth, and green status without complete evidence

## Confidence
high (0.95): parser parity, deliberate value/type-only/unknown probes, live self-dogfood, and rendered policy measurement provide current evidence