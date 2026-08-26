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
The ability for a developer and coding agent to start from a reviewed architecture profile, understand the intended implementation roles, produce an explicit change plan, and verify the resulting source dependencies against the same contract. Unlike the MCP transport, visual design handoff, or ontology map, this capability governs where implementation changes belong and reports violations and measurement gaps without inventing compliance.

## Evidence
- `docs/ontology/architecture/ontology-atlas-web.md`: reviewed FSD role order, scope, exclusions, and lower-only dependency policy
- `mcp/src/architecture-profile.mjs` and `mcp/src/index.js`: `architectureBrief:v1`, `architectureConformance:v1`, and public `inspect_architecture`
- `cli/src/commands/architecture.mjs`: exact source-checkout fallback
- `src/views/architecture`: Living Blueprint Understand / Plan / Verify workbench
- `tests/e2e/architecture-workbench.spec.ts`: rendered workflow and mobile handoff reachability

## Agent Contract
Before editing, call `inspect_architecture`, report selected scope, roles, observed edges, violations, and unknowns, then return `architectureChangePlan:v1`. After editing, inspect again and compare the actual result with the plan. Unknown never means compliant, and pattern names never come from folder-name inference.

## Inclusion / Exclusion
- Included: reviewed profile discovery, bounded import observation, role conformance, change-plan handoff, CLI fallback, and the human Architecture destination
- Excluded: automatic refactoring, semantic ontology inference, exhaustive runtime dependency truth, and green status without complete evidence

## Confidence
high (0.95): MCP/CLI parity, 52 changed-path gates, and installed-app interaction provide current evidence