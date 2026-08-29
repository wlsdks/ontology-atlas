# Brand — Ontology Atlas

> The meaning, source contract, and usage rules for the pixel mascot identity.
> The 2026-08-28 record in [`DECISIONS.md`](./DECISIONS.md) owns the replacement
> decision; the committed PNG masters own the pixels.

## Identity Status

The pixel mascot is the primary and only shipping brand mark. It replaces the
nested-hex compatibility mark in browser, PWA, Open Graph, README, macOS,
Windows, mobile packaging trees, loading, and evidence-bound mascot presence.
The app rail intentionally starts with destinations and repeats no mark or
wordmark. Hexagons remain valid topology data marks for project kinds; they are
no longer brand marks.

## One Sentence

> **Understand what your codebase builds, why it is structured that way, and
> what a change will affect.**

Category — **A local-first codebase ontology workbench.**

Asset shorthand — **Understand your codebase.** Localized product copy belongs
in the message catalogs rather than raster assets.

## Character

The mascot is quiet, curious, reliable, precise, and collaborative. Its warm
ivory face sits inside a compact near-black work suit. One chartreuse antenna
pixel and one chest pixel make the identity recognizable without turning the UI
into a second colour system. The raised-hand full mark carries one small graph
node; the compact and micro marks remove that detail before it becomes noise.

This is a character, not an ontology kind, an assistant persona, or a claim that
work is happening. Static brand surfaces are state-free.

## Canonical Pixel Grids

The source masters live under `assets/brand/mascot/`.

| Tier | Source | Native use |
|---|---|---|
| Full | `mascot-full-64.png` | 64px and larger; raised hand and graph-node spark |
| Compact | `mascot-compact-32.png` | 20–48px; resting arms and readable body |
| Micro | `mascot-micro-16.png` | 16–18px; helmet, face, eyes, and antenna only |
| macOS template | `mascot-tray-template-{16,32}.png` | black/clear menu-bar mask at 1×/2× |

Each tier is authored separately. Do not downscale the full body to make a
favicon. Scale a tier only by whole-number nearest-neighbour steps; fractional
scaling makes individual pixel widths inconsistent.

## Palette Boundary

| Role | Value |
|---|---|
| Suit / outline | `#0B0B0D` family |
| Face | `#F7F5E6` |
| Identity signal | `#C6F000` |
| Suit highlight | `#5B5B66` |

These colours are licensed only inside committed mascot raster pixels and their
brand compositions. `#C6F000` is not an application token, status colour, data
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

Motion is finite. There is no idle loop, random map traversal, inferred work,
particle cloud, glow, or separate mascot event bus. Under reduced motion, travel
and frame stepping stop while the static pose and status text preserve the fact.
At desktop widths the 64×64 stage stays in a measured clear lane at the map's
right edge. Six poses share five 120ms frame/travel transitions; WALK's terminal
frame equals READ's first frame, and READ's terminal frame equals SUCCESS's first,
so a truthful state change does not teleport the character.

## Generated Assets

| Surface | Asset |
|---|---|
| In-app mark | `public/brand/mascot-{full,compact,micro}.png` through `<BrandMark>` |
| Gateway chrome and download hero | compact and full `<BrandMark>` tiers; static and state-free |
| Browser favicon | `app/icon.png` |
| Apple Touch | `app/apple-icon.png` |
| PWA | `public/brand-icon-512.png` |
| Open Graph | `public/og-image.png` (1200×630) |
| README / presentations | `public/brand/lockup*.png` |
| macOS / Windows / mobile package trees | `src-tauri/icons/**` |
| macOS menu bar | `src-tauri/icons/tray-template.png` (static template image) |

The OS plate is a neutral dark squircle. The character remains native pixel art
inside that smoothly masked platform shape.

## Build Pipeline

```bash
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
- Do not recolour the mascot through CSS or turn chartreuse into a UI palette.
- Do not use the full master at 16px or fractional-scale a native grid.
- Do not crop presentation boards into production assets.
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
| Palette stays raster-only; motion clocks, safe corner, and pose boundaries stay aligned | `mascot-palette-boundary.contract.test.ts` and `mascot-motion.contract.test.ts` |
| macOS tray template is exact RGBA 1×/2× art | brand parity/presence contracts plus native Rust test |
