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
The human-readable Living Blueprint surface at `/architecture`: it keeps implementation roles primary, lets a developer move through Understand, Plan, and Verify, and produces a copyable agent handoff grounded in the reviewed profile. Each role band is a boxed layer container that lists its occupants: the source modules the role's globs actually contain, from a read-only directory walk of the bound project source in the installed app, with a derived per-band count, a bounded card preview, and derived stat tiles in the Understand rail. It differs from the profile-contract element because it judges and communicates typed architecture facts but does not itself scan source imports.

## Evidence
- `src/views/architecture`: responsive workbench, profile selection, role blueprint with source-module cards, evidence, and handoff states
- `src/views/architecture/model/source-modules.ts`: the read-only glob-to-directory walk; excludes filter with the shared MCP glob dialect
- `src/entities/architecture-profile/model/architecture-occupants.ts`: `matchesArchitecturePath`, mirroring the MCP's `matchesPathPattern`, guarded by `tests/contract/architecture-profile.contract.test.ts`
- `app/[locale]/architecture/page.tsx`: locale-prefixed static route
- `src/widgets/app-nav-rail` and `src/widgets/bottom-tab-bar`: first-class desktop and mobile navigation
- `tests/e2e/architecture-workbench.spec.ts`: mobile stage-change re-anchoring and handoff reachability

## Boundary
The workbench is not an ontology map, and its bands never show ontology concepts: the ontology is the meaning layer and stays on the map, while architecture is the source layer (owner decision, 2026-08-27). The band walk lists directories only; it must never open files or read imports (the profile must not become a second source of observed imports). A browser cannot list a source folder, and the surface states that impossibility instead of rendering it as emptiness. A source-backed conformance receipt comes from `inspect_architecture`, and the UI never fabricates a current green status.

## Confidence
high (0.9): static export, responsive measurement, accessibility/contrast gates cover the shipped surface; the directory walk is unit-tested against an in-memory tree and shares its glob dialect with the MCP by contract test; the installed-app listing path awaits an installed-app walkthrough
