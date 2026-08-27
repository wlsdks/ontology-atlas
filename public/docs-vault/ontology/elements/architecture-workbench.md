---
uid: 39f620c5-b115-41a7-be34-e544c7587074
slug: elements/architecture-workbench
kind: element
title: Architecture Workbench
display_en: Architecture Workbench
display_ko: 아키텍처 워크벤치
domain: domains/codebase-architecture
path: src/views/architecture
created_by: "agent:unknown"
---

## Definition
The human-readable Living Blueprint surface at `/architecture`: it keeps implementation roles primary, lets a developer move through Understand, Plan, and Verify, and produces a copyable agent handoff grounded in the reviewed profile. Each role band is a boxed layer container that also lists its occupants (the ontology's capability and element concepts whose `path` frontmatter falls inside that role's globs), with a derived per-band count, a bounded card preview, and derived stat tiles in the Understand rail. It differs from the profile-contract element because it judges and communicates typed architecture facts but does not itself scan source imports.

## Evidence
- `src/views/architecture`: responsive workbench, profile selection, role blueprint with occupant cards, evidence, and handoff states
- `src/entities/architecture-profile/model/architecture-occupants.ts`: the role-glob and vault-`path` join; `matchesArchitecturePath` mirrors the MCP's `matchesPathPattern`, guarded by `tests/contract/architecture-profile.contract.test.ts`
- `app/[locale]/architecture/page.tsx`: locale-prefixed static route
- `src/widgets/app-nav-rail` and `src/widgets/bottom-tab-bar`: first-class desktop and mobile navigation
- `tests/e2e/architecture-workbench.spec.ts`: mobile stage-change re-anchoring and handoff reachability

## Boundary
The workbench is not an ontology map: the map remains the ontology reading and writing surface, and the blueprint draws only the join between reviewed role globs and reviewed concept `path` facts, never invented component edges. It must never scan source imports (the profile must not become a second source of observed imports). A source-backed conformance receipt comes from `inspect_architecture`, and the UI never fabricates a current green status.

## Confidence
high (0.95): static export, responsive measurement, accessibility/contrast gates, and installed-app walkthrough cover the shipped surface; the occupant join is contract-tested against the MCP glob dialect