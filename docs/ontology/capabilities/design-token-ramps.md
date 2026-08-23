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

## Gate
`unused-token-ratchet` (tokens that no one uses are not specifications but misinformation) ·
`type-ramp-step-defined` · `type-ramp-leading-pair` · `contrast` measurement ·
`icon-size-ramp` (CSS↔JS mirror)
