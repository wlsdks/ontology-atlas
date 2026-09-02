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
The ability for a developer and coding agent to compare human-reviewed architecture intent with a revision-stamped source observation, decide what should change, and verify the result against the same contract. The Architecture workbench starts the guarded Draft, Change, or Verify conversation inside its own route and passes the visible stage, role, profile, local roots, and optional receipt as a typed task context. A connected agent may inspect and propose, while people still name and approve architectural meaning and Markdown plus Git remain canonical. Missing or incomplete observation remains Unknown rather than becoming compliance, and an absent local receipt is not rediscovered or invented by the agent.

## Evidence
- `docs/ontology/architecture/ontology-atlas-web.md`: reviewed FSD role order, scope, exclusions, lower-only dependency policy, and value-only governed usage
- `mcp/src/architecture-profile.mjs` and `mcp/src/index.js`: `architectureBrief:v1`, usage-qualified conformance, and public `inspect_architecture`
- `src/views/architecture/model/architecture-agent.ts`: fail-closed admission for verified, ready, guarded ACP runtimes with a vault and bundled MCP launch
- `src/views/architecture/ui/ArchitectureAgentDock.tsx`: same-route ACP conversation as a narrow-workbench sheet or wide side dock, with process start bound to real reflow completion
- `src/views/architecture/ui/ArchitectureWorkbench.tsx`: contextual Draft / Change / Verify task, compact evidence rail, on-canvas provenance overlay, and browser clipboard fallback
- `src/views/architecture/ui/ArchitectureSketch.tsx`: aligned contract and observation marks plus finite replay of stamped import traffic
- `tests/contract/architecture-profile.contract.test.ts`: web/MCP parser parity and backward-compatible usage declaration

## Agent Contract
Before editing, call `inspect_architecture`, report selected scope, roles, declared pattern axes, governed usages, observed coverage, violations, exclusions, and unknowns, then return `architectureChangePlan:v1`. After editing, inspect again and compare the actual result with the plan. For a first profile, inspect paths and imports, propose literal path groups, then stop for a person to name the architecture and roles before writing. Never infer permissions from current imports, treat type-only evidence excluded by policy as judged, or present Unknown as compliant.

## Inclusion / Exclusion
- Included: reviewed profile discovery, guarded in-tab ACP handoff, human naming and approval, bounded import observation, usage qualification, role conformance, change-plan handoff, CLI fallback, and the human Architecture destination
- Excluded: app-side source inference, automatic approval or refactoring, unreviewed profile writes, exhaustive runtime dependency truth, and motion that implies a stored receipt is continuously current

## Confidence
high (0.96): parser parity, focused component tests, zero-profile and reviewed-profile installed-app journeys, a real guarded inspection, and recorded import-replay motion provide current evidence
