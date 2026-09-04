---
uid: 778665c5-7273-436f-a192-e3519f8f8352
slug: elements/design-proof-router
kind: element
title: Design Proof Router
display_en: Design Proof Router
display_ko: 디자인 증거 라우터
domain: domains/design-system
path: scripts/lib/design-proof-router.mjs
created_by: "agent:unknown"
---

## Definition

The Design Proof Router is the deterministic source-checkout classifier behind `pnpm design:route`. It translates one or more observable Atlas UI change classes into the smallest required proof bundle: build and audit skills, rendered-window instruments, specialist seats, and concrete artifacts.

## Evidence

- `scripts/lib/design-proof-router.mjs`: change-class registry, proof routing, and council-selection rules
- `scripts/design-proof-router.mjs`: command-line entry point
- `tests/contract/design-proof-router.contract.test.ts`: routing and failure contracts
- Primary implementation: `scripts/lib/design-proof-router.mjs#routeDesignProof`

## Includes

- Classifying one or more observable Atlas UI change classes into the smallest required proof bundle: skills, rendered-window instruments, specialist seats, and artifacts.
- Backing `pnpm design:route`'s deterministic routing and council-selection rules.

## Excludes

- Judging whether a design is good: it routes evidence requirements, never approves a change.
- Performing the actual screenshot capture, DOM measurement, or motion recording; those are separate instruments the routed proof bundle names.
- Convening a design council itself, reserved for hard-to-reverse structural commitments the router flags.

## Boundary

It routes evidence; it does not declare a design good. Every rendered change still requires a fresh actual-window screenshot and accessibility-tree inspection while building, geometry-localizing work adds DOM/computed-style/rect measurements, and motion changes require a real macOS screen recording. Councils remain reserved for hard-to-reverse structural commitments rather than ordinary local visual work.
