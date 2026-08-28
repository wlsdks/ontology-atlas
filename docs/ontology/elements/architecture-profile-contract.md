---
uid: cfe54c34-45b6-45b0-9755-b260b8ecf606
slug: elements/architecture-profile-contract
kind: element
title: Architecture Profile Contract
display_en: Architecture Profile Contract
display_ko: 아키텍처 프로필 계약
domain: domains/codebase-architecture
path: mcp/src/architecture-profile.mjs
created_by: "agent:unknown"
---

## Definition
The machine-readable `architecture-profile/v1` contract and conformance evaluator that keeps declared pattern axes, scoped roles, dependency rules, governed import usages, observed imports, violations, and unknowns in one fail-closed result. It differs from the workbench element because it produces usage-qualified typed facts for MCP and CLI consumers rather than rendering a human interface.

## Evidence
- `mcp/src/architecture-profile.mjs`: canonical profile parsing, role mapping, `dependency_usages`, and `architectureConformance:v1`
- `mcp/src/index.js`: public `inspect_architecture` tool and closed usage-qualified output schema
- `cli/src/lib/architecture-results.mjs`: fail-closed consumer validation for governed usages, receipt counts, and unknown usage
- `tests/contract/architecture-profile.contract.test.ts`: web/MCP parser parity and legacy default behavior
- `mcp/src/architecture-profile.test.mjs`: type-only exclusion, upward value violation, and unknown-usage probes

## Boundary
Pattern names and governed usages are reviewed declarations, never inferred from folders or current imports. Missing v1 `dependency_usages` preserves value-plus-type-only behavior. Unsupported languages, unknown import usage, unmapped edges, unruled edges, and empty roles remain unknown instead of becoming green compliance.

## Confidence
high (0.95): cross-surface contract, strict consumer validation, and live dogfood scan are gated