---
uid: e098afc6-7170-4740-9161-c370a7cb2283
slug: capabilities/design-token-ramps
kind: capability
title: Design Token Ramps
display_ko: 디자인 토큰 램프
display_en: Design Token Ramps
domain: domains/design-system
elements: []
path: app/globals.css
created_by: "agent:unknown"
---

# Design Token Ramps

Ladders with predefined values available for use. Lint blocks any other values.

## Definition

Design Token Ramps are the fixed value ladders (font size, line height, letter-spacing, weight, radius, shadow, motion, control height, layering, icon size, and dialog width) available for every screen to use. Lint blocks any value outside a ramp.

## User Outcome
- No varying font sizes, border radii, or shadows across screens.
- Light comes from one direction, and elements above cast darker shadows.

## Ramps
Font size (8 steps) · Line height (10 steps, 1:1 ratio with size) · Letter-spacing · Weight (3 steps) · Radius (5 steps) ·
Shadow (5 types: elevation 3 + docking 2) · Motion (3 steps: fast check · base move · settle confirm) ·
Control height · Layering (z) ladder · Icon (3 steps) · Dialog width (2 steps)

## Extraction Boundary
**Mixed.** Of the **580** unique token names, **269 (46%) are `--topology-*`**, and others
like `--git-*`, `--chrome-*`, `--app-nav-*`, `--gateway-*`, `--footprint-*`,
`--docs-*` are tied to the app surface. Only core tokens (color, type, line-height, letter-spacing, weight, radius, shadow,
motion, control height, z, icon, dialog width, overlay) are extractable.

**Do not classify manually**: Use prefix rules to determine classification, and **reject** tokens that do not fit (do not allow new tokens to quietly slip past the boundary). The full two-layer separation was carried over in the 2026-08-15 Council slide (rabbit hole priority #1: classification debates take days). This time, only leave boundary markers.

## Includes

- The eleven core ramps: font size (8 steps), line height (10 steps), letter-spacing, weight (3 steps), radius (5 steps), shadow (5 types), motion (3 steps), control height, layering (z) ladder, icon (3 steps), and dialog width (2 steps).
- The `unused-token-ratchet`, `type-ramp-step-defined`, `type-ramp-leading-pair`, contrast measurement, and CSS-to-JS `icon-size-ramp` mirror gates.
- Prefix-rule classification of each token name into extractable-core versus Atlas-surface-bound, rejecting any token that does not fit a rule.

## Excludes

- The roughly 46% of token names prefixed `--topology-*`, plus `--git-*`, `--chrome-*`, `--app-nav-*`, `--gateway-*`, `--footprint-*`, and `--docs-*`: all tied to a specific app surface and not extractable as core.
- Manual, case-by-case token classification; classification is prefix-rule-only per the 2026-08-15 Council decision.
- Enforcing the ramp values structurally against violating code, owned by capabilities/design-gate-ratchets.

## Gate
`unused-token-ratchet` (tokens that no one uses are not specifications but misinformation) ·
`type-ramp-step-defined` · `type-ramp-leading-pair` · `contrast` measurement ·
`icon-size-ramp` (CSS↔JS mirror)
