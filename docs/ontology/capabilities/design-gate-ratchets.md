---
uid: 3090f5e0-65e3-4d66-810a-28f6d616bf02
slug: capabilities/design-gate-ratchets
kind: capability
title: Design Gates & Ratchets
display_ko: 디자인 게이트와 래칫
display_en: Design Gates & Ratchets
domain: domains/design-system
elements: []
path: eslint.config.mjs
created_by: "agent:unknown"
---

# Design Gates & Ratchets

The layer that **turns red if the spec is violated**. This is the most irreplaceable part of this design system (as of 2026-08-15 PO Council measurement: parts and token deployments are common, but no one deploys enforcement as a whole), and simultaneously **the hardest part to port**.

## Definition

Design Gates & Ratchets is the enforcement layer that turns CI red when a rendered screen deviates from the design spec, so a person does not have to catch the drift visually. It combines lint selectors, contract tests, and repository-wide ratchets, and a probe catches a gate that has silently stopped finding anything.

## User Outcome
- If the screen created by the agent deviates from the spec, CI turns red: no need for humans to spot it visually.
- The probe also catches gates silently failing (idling over an empty set).

## Three Branches
1. **lint selector** (`no-restricted-syntax`): Specs where values remain as strings in the code:
   type, radius, shadow, motion, letter-spacing, weight, palette, layering, cursor, inactive state, accent, inline size.
2. **Contract tests**: Layers that lint cannot theoretically see: those requiring inspection of values in other files
   (e.g., cva composition results, CSS token comparison) or where violations are **absence of classes**, making them uncatchable by selectors.
3. **Ratchets**: Criteria based on the total count across the repository: adoption rate, debt ceiling.

## Extraction Boundary
**atlas-bound.** Ratchets are inherently tied to **this repository's census values**:
"Currently N locations, blocking the (N+1)th." In a new consumer repository, those numbers are meaningless:
starting at 0 blocks all adoption; carrying them over blocks nothing.

Therefore, what the extraction deploys is not the ratchet **file** but the **bootstrap procedure**:
Following `/gate-probe` discipline, "count violations in your repository before enabling this gate" must be
the first step. Otherwise, the first consumer will receive hundreds of warnings immediately upon enabling and disable the entire gate.

**Recorded Objection (2026-08-15)**: "The empty space of forced deployment may be an opportunity, not a tomb:
no one adopts it because the gate's essential codebase-specificity is inherent."
Falsification condition: If the ratchet baseline fails during the first external application despite creating a census bootstrap for consumers, then this objection holds true.

## Includes

- The lint-selector branch (`no-restricted-syntax`) catching spec values still written as literal strings: type, radius, shadow, motion, letter-spacing, weight, palette, layering, cursor, inactive state, accent, inline size.
- Contract tests for violations lint cannot see structurally: cross-file value composition (cva results, CSS token comparison) and violations that are an absence of classes.
- Repository-wide ratchets (adoption rate, debt ceiling) that only ever tighten, plus the probe that catches a gate idling over an empty set.

## Excludes

- Defining the token values themselves, owned by capabilities/design-token-ramps.
- Shipping as a portable file; only the bootstrap procedure (census violations in the target repository before enabling a gate) is extractable, not today's ratchet baselines.
- Judging a design decision; a gate only enforces a spec that a person has already decided.
