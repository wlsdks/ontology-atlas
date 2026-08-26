---
uid: f088ee9c-cde9-4119-8955-4bb91e452538
slug: domains/codebase-architecture
kind: domain
title: Codebase Architecture
display_en: Codebase Architecture
display_ko: 코드베이스 아키텍처
capabilities: [capabilities/architecture-guided-development]
created_by: "agent:unknown"
elements: [elements/architecture-profile-contract, elements/architecture-workbench]
---

## Definition
The responsibility area that declares reviewed implementation roles and dependency rules for a codebase, then compares observed source imports with that intent. It stays separate from the ontology map: architecture profiles describe how implementation is organized, while ontology nodes preserve what the product means and why.

## Evidence
- `docs/ontology/architecture/ontology-atlas-web.md`: reviewed `architecture-profile/v1` declaration for the web workbench
- `mcp/src/architecture-profile.mjs`: profile parsing and fail-closed conformance evaluation
- `src/views/architecture`: human-readable Living Blueprint workbench

## Inclusion / Exclusion
- Included: named architecture patterns, scoped roles, dependency policy, observed conformance, unknown coverage, agent change plans, and the Architecture destination
- Excluded: product-domain and capability meaning (`domains/graph-modeling`), generic symbol indexing, design-system values, and agent transport/setup

## Confidence
high (0.95): the reviewed profile, MCP/CLI contract, route, and rendered workbench are all implemented and independently gated