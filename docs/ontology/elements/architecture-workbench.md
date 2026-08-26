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
The human-readable Living Blueprint surface at `/architecture`: it keeps implementation roles primary, lets a developer move through Understand, Plan, and Verify, and produces a copyable agent handoff grounded in the reviewed profile. It differs from the profile-contract element because it judges and communicates typed architecture facts but does not itself scan source imports.

## Evidence
- `src/views/architecture`: responsive workbench, profile selection, role blueprint, evidence, and handoff states
- `app/[locale]/architecture/page.tsx`: locale-prefixed static route
- `src/widgets/app-nav-rail` and `src/widgets/bottom-tab-bar`: first-class desktop and mobile navigation
- `tests/e2e/architecture-workbench.spec.ts`: mobile stage-change re-anchoring and handoff reachability

## Boundary
The workbench is not an ontology map and does not render ontology nodes as an architecture diagram. A source-backed conformance receipt comes from `inspect_architecture`; the UI never fabricates a current green status.

## Confidence
high (0.95): static export, responsive measurement, accessibility/contrast gates, and installed-app walkthrough cover the shipped surface