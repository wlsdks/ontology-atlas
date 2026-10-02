---
title: Brand — Ontology Atlas
doc_type: design
status: current
area: design-system
---

# Brand — Ontology Atlas

> The meaning, source contract, and usage rules for the pixel mascot identity.
> The [2026-10-02 identity decision](../records/decisions/2026-10-02-planet-traveler-identity-5b4ca3c7-ae8f-4ac8-a729-3c9b721ab982.md) owns the current character; the committed PNG masters own the pixels.

## Identity Status

The pixel mascot is the primary and only shipping brand mark. It replaces the
nested-hex compatibility mark in browser, PWA, Open Graph, README, macOS,
Windows, mobile packaging trees, loading, and evidence-bound mascot presence.
The app rail intentionally starts with destinations and repeats no mark or
wordmark. Hexagons remain valid topology data marks for project kinds; they are
no longer brand marks.

## One Sentence

> **Understand your system as AI agents change its code.**

Category — **A local-first codebase ontology workbench.**

Support the human promise with its mechanism: shared Markdown meaning, task
context for the agent, and evidence and unknowns a person can inspect and
correct. Follow the [current product thesis](../PRODUCT-DIRECTION.md#the-atlas-product-thesis).
Do not turn control into a guarantee of safe code, complete impact analysis,
automatic meaning reconstruction, or an enforced review in every external client.

Asset shorthand — **Understand your codebase.** Localized product copy belongs
in the message catalogs rather than raster assets.

## Character

The mascot is a curious planet traveler: a cream parchment hood and coat, a dark navy face with two cyan eyes, a blue scarf and boots, and a floating ringed blue planet. Compact and micro forms retain the hood and eyes while simplifying the planet and removing the body. The owner supplied the reference pack on 2026-10-02.

This is a character, not an ontology kind, an assistant persona, or a claim that
work is happening. Static brand surfaces are state-free.

## Canonical Pixel Grids

The source masters live under `assets/brand/mascot/`.

| Tier | Source | Native use |
|---|---|---|
| Full | `mascot-full-64.png` | 64px and larger; full traveler and ringed planet |
| Compact | `mascot-compact-32.png` | 20–48px; hood, eyes, scarf, and planet |
| Micro | `mascot-micro-16.png` | 16–18px; hood, paired cyan eyes, and simplified planet |
| macOS template | `mascot-tray-template-{16,32}.png` | black/clear menu-bar mask at 1×/2× |

Each tier is authored separately. Do not downscale the full body to make a
favicon. Scale a tier only by whole-number nearest-neighbour steps; fractional
scaling makes individual pixel widths inconsistent.

## Palette Boundary

| Role | Value |
|---|---|
| Face shadow / outline | `#101025` family |
| Hood | `#FFF0CA` |
| Identity signal | `#65BDE9` |
| Blue accents | `#286DD0` |

These colours are licensed only inside committed mascot raster pixels and their
brand compositions. `#65BDE9` is not an application token, status colour, data
colour, control fill, or replacement for the indigo accent. Product UI continues
to use the existing neutral-plus-indigo system.

## Truthful Motion

Three six-frame rows live beside the masters:

| State | Source | Meaning |
|---|---|---|
| Walk | `mascot-walk-row-64.png` | finite entrance after verified read activity appears |
| Read | `mascot-read-row-64.png` | verified current Atlas read-like operation |
| Success | `mascot-success-row-64.png` | terminal completion of that observed read sequence |

`src/features/agent-activity/model/mascot-state.ts` is the state boundary.
Planning text alone cannot claim READ; an exact read-like tool must be present.
SUCCESS requires a timestamped terminal projection. Visual state,
`data-mascot-state`, and localized `role=status` text share that source.

This verified work sequence is finite. There is no idle loop, random map traversal, inferred work,
particle cloud, glow, or separate mascot event bus. Under reduced motion, travel
and frame stepping stop while the static pose and status text preserve the fact.
At desktop widths the 64×64 stage stays in a measured clear lane at the map's
right edge. Six poses share five 120ms frame transitions with continuous travel; WALK's terminal
frame equals READ's first frame, and READ's terminal frame equals SUCCESS's first,
so a truthful state change does not teleport the character.

Pending operations use a separate `BrandWaitingMark`: a native 64px character
steps and hops using the first four existing WALK poses while the operation is
actually pending. It does not claim a read, progress percentage, or success.
The awaiting surface retains its status and cancel control. The first answer,
Stop, permission request, error, or silence warning removes the pre-answer mark.
Offscreen and hidden-document instances pause; reduced motion keeps one still
pose. Route loading shares the status's existing delayed appearance. Small
save/configuration controls use the native static 16px micro art in their
existing glyph slots, without shrinking the 64px character. Beneath the app's
zoomed chrome, these pending marks cancel that inherited zoom so the rasters
stay 64px and 16px. Unzoomed loading surfaces and portals keep their native size.

## Retired game artwork

The companion game and related record screens are retired at the owner's request.
Game scenery and the combined game sprite strip are no longer packaged or generated.
The owner-selected traveler source art and `scripts/build-traveler-sprites.mjs`
remain because they generate the shared identity, tray, waiting, read and completion
artwork. Existing personal/game save bytes remain untouched.
