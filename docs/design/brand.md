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

The mascot is a curious planet traveler: a cream parchment hood and coat, a dark navy face with two cyan eyes, a blue scarf, brown traveling boots, and a floating ringed blue planet. Compact and micro forms retain the hood and eyes while simplifying the planet and removing the body. The owner supplied the reference pack on 2026-10-02.

The owner's additional 2026-10-03 references refine the static art to a rounded
hood, broad face, short body, brown traveling boots, lantern, map, and backpack.
The full figure and separately drawn compact/micro portraits live in the
`source/traveler-{master,small}-v2.png` inputs. Each tier trims transparent
presentation padding, preserves the drawing's aspect ratio, and registers a
clear integer-pixel margin. The work-state rows now share the rounded hood,
gold planet ring, brown boots, lantern, map, and backpack of that static art.
Their activity meanings and timing remain unchanged.

This is a character, not an ontology kind, an assistant persona, or a claim that
work is happening. Static brand surfaces are state-free.

## Canonical Pixel Grids

The source masters live under `assets/brand/mascot/`.

| Tier | Source | Native use |
|---|---|---|
| Full | `mascot-full-64.png` | 64px and larger; full traveler and ringed planet |
| Compact | `mascot-compact-32.png` | 20–48px; hood, eyes, scarf, and planet |
| Micro | `mascot-micro-16.png` | 16–18px; hood, paired cyan eyes, and simplified planet |
| Presentation | `mascot-presentation-128.png` | 128–1024px static desktop/PWA icons and Open Graph; detailed face, lantern, map, and backpack with an 8px clear margin |
| Portraits | `mascot-{welcome,curious}-32.png` | 32px static expressions in the folder entry and missing-page icon slots |
| macOS template | `mascot-tray-template-{16,32}.png` | black/clear menu-bar mask at 1×/2× |

Each tier is authored separately. Do not downscale the full body to make a
favicon. Scale a tier only by whole-number nearest-neighbour steps; fractional
scaling makes individual pixel widths inconsistent.

Large desktop/PWA icons use the 128px presentation art at 1×, 2×, 4×, and
8×. Open Graph uses it at 3×. Native 64px work poses, small runtime marks,
compact/micro portraits, and their density partners keep their own drawings.
The presentation source adds detail without enlarging the character into the
platform mask or reducing the body into a tiny face icon.

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
The activity status lane contains a 32×32 mark made from the 64px work cells
at half scale. Pending marks retain their separate native 64px stage.
Six poses share five 120ms frame transitions; WALK's terminal
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

## Generated Assets

| Surface | Asset |
|---|---|
| In-app mark | `public/brand/mascot-{full,compact,micro}.png` through `<BrandMark>` |
| Gateway chrome | compact `<BrandMark>` tier in the header; static and state-free |
| Browser favicon | `app/icon.png` |
| Apple Touch | `app/apple-icon.png` |
| PWA | `public/brand-icon-512.png` |
| Open Graph | `public/og-image.png` (1200×630) |
| README / presentations | `public/brand/lockup*.png` |
| macOS / Windows / mobile package trees | `src-tauri/icons/**` |
| macOS menu bar | `src-tauri/icons/tray-template.png` (static template image) |

`BrandPortrait` places a static welcome expression beside the existing Atlas
wordmark in the first-run/folder chooser, and a curious map-search expression
in the existing 404 icon tile. Both are decorative and carry no work-status
or acceptance claim. Labels and recovery actions retain their existing roles.
Like busy micro marks, these portraits compensate only actual workbench UI
zoom ancestors, so their authored 32px grid stays native.

Work sources are three six-cell, 3×2 sheets. Each cell uses one common scale,
binary alpha, the shared raster palette, and a 61px foot baseline. The boundary
frames are shared exactly between WALK/READ and READ/SUCCESS. Completion is a
quiet expression and wave with no spell, particles, or confetti.

The OS plate is a neutral dark squircle. The character remains native pixel art
inside that smoothly masked platform shape.

## Build Pipeline

```bash
node scripts/build-traveler-sprites.mjs
node scripts/build-brand-assets.mjs
node scripts/build-brand-raster.mjs
# Open the printed loopback URL once so the browser canvas bakes the PNG family.
node scripts/install-brand-icons.mjs
```

`build-brand-assets.mjs` validates dimensions and alpha for the three masters and
motion rows. `build-brand-raster.mjs` disables canvas image smoothing and creates
every physical output. `install-brand-icons.mjs` owns all committed destinations,
including `.icns` and `.ico` assembly. No build-time server or image service is
required by the product.

## Do Not

- Do not restore the nested-hex drawing as a logo or brand echo.
- Do not remove project hexagons from topology data visualization.
- Do not recolour the mascot through CSS or turn mascot colors into a UI palette.
- Do not use the full master at 16px or fractional-scale a native grid.
- Do not ship unregistered presentation boards as sprite sheets; normalize scale, alpha, cell bounds, and foot contact first.
- Do not animate without verified state or add ambient looping travel.
- Do not bake slogans, progress values, or English-only product copy into the art.
- Do not infer Windows notification-area approval from a macOS capture; Windows
  owns tray visibility and overflow and requires its own observed need and proof.

## Gates

| Property | Gate |
|---|---|
| Source masters and motion rows are exact RGBA grids | `brand-asset-parity.contract.test.ts` |
| Runtime detail ladder matches source tiers | same contract plus `brand-mark.test.tsx` |
| Every generated/public/platform output is planned | `brand-assets-present.contract.test.ts` |
| Reduced motion preserves static state and text | `reduced-motion-equivalent.contract.test.ts` |
| Motion claims only verified work | `mascot-state.test.ts` and `AgentMascotPresence.test.tsx` |
| Palette stays raster-only; motion clocks, status-lane placement, and pose boundaries stay aligned | `mascot-palette-boundary.contract.test.ts` and `mascot-motion.contract.test.ts` |
| macOS tray template is exact RGBA 1×/2× art | brand parity/presence contracts plus native Rust test |
