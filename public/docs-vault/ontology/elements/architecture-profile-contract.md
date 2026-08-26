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
The machine-readable `architecture-profile/v1` contract and conformance evaluator that keeps declared pattern axes, scoped roles, dependency rules, observed imports, violations, and unknowns in one fail-closed result. It differs from the workbench element because it produces typed facts for MCP and CLI consumers rather than rendering a human interface.

## Evidence
- `mcp/src/architecture-profile.mjs`: canonical profile parsing, role mapping, and `architectureConformance:v1`
- `mcp/src/index.js`: public `inspect_architecture` tool and closed output schema
- `cli/src/commands/architecture.mjs`: connector-less source-checkout fallback
- `tests/contract/architecture-profile.contract.test.ts`: web/MCP parser parity

## Boundary
Pattern names are reviewed declarations, never inferred from folders. Unsupported languages, unmapped edges, unruled edges, and empty roles remain unknown instead of becoming green compliance.

## Confidence
high (0.95): cross-surface contract and live dogfood scan are gated