---
title: Design System
tags: [design, ux, linear, overview]
---

# Design System

> This document is maintained based on Section 3 of the design spec. For the original Linear specification, see [`design-references/DESIGN-linear.md`](design-references/DESIGN-linear.md).

## Why this direction

Linear's "starlight rising from darkness" aesthetic aligns precisely with the constellation metaphor of the topology. The extreme constraint of black-and-white plus a single indigo accent is **the strongest defense against AI-generated UI clichés**. Rendering hub nodes (IAM/Reactor) in indigo makes them the only colored elements in the system, naturally forming the visual focal point.

## Design tokens

Defined via Tailwind 4's CSS-based `@theme`. See `app/globals.css` for the actual implementation.

### Backgrounds

- `--color-canvas`: `#08090a`
- `--color-panel`: `#0f1011`
- `--color-elevated`: `#191a1b`
- `--color-secondary-surface`: `#28282c`

### Text

- `--color-text-primary`: `#f7f8f8`
- `--color-text-secondary`: `#d0d6e0`
- `--color-text-tertiary`: `#8a8f98`
- `--color-text-quaternary`: `#62666d`

### Accent (the only color)

- `--color-indigo-brand`: `#5e6ad2`
- `--color-indigo-accent`: `#7170ff`
- `--color-indigo-hover`: `#828fff`

### Borders

- `rgba(255,255,255,0.05)` — subtle
- `rgba(255,255,255,0.08)` — default
- `rgba(255,255,255,0.12)` — strong

### Typography

- Primary: `Inter Variable` (OpenType `"cv01", "ss03"` applied globally)
- Signature weight: `510` (Linear's signature)
- Mono: `JetBrains Mono`

## Category differentiation strategy

Differentiate by **border style**, not color — the only color (indigo) is reserved for hub nodes:

| Category           | Marker                                    |
| ------------------ | ----------------------------------------- |
| In progress        | Indigo underline                          |
| Planned            | Dashed border                             |
| Hub (IAM/Reactor)  | Indigo background and border (only color) |

## Absolute rules (Don'ts)

- ❌ Purple → pink gradients
- ❌ Glassmorphism (`backdrop-blur`)
- ❌ Glow pulse / neon effects
- ❌ Animated gradient backgrounds / aurora
- ❌ Scale-based hover effects
- ❌ More than one color system

## Motion principles

- Initial load: `opacity 0 → 1` + `translateY 8px → 0` (spring)
- Hover: border opacity rises, connected edges brighten — no scale or glow
- Drawer: right-side `x: 100% → 0` spring
- Filter toggle: deselected categories fade to `opacity 0.15`
- Background: fully static
- Respect `prefers-reduced-motion`

## Page header — English caption + Korean h1

The header on each operations page (ontology / knowledge / review / settings, etc.) follows a **two-line pattern**. The user-facing Korean title is the primary heading, and the English category caption serves as a micro identifier that yields one step in the visual hierarchy.

### Pattern

```
[English category caption — 9~10px / mono / uppercase / tracking 0.14em / quaternary color]
[Korean h1 — text-2xl / signature weight / primary color]
[Subtitle — Korean / sm / secondary color (optional)]
```

Example: `/ontology` page

```tsx
<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
  Ontology
</p>
<h1 className="text-2xl font-[var(--font-weight-signature)]">
  온톨로지 트리
</h1>
<p className="text-sm leading-7 text-[color:var(--color-text-secondary)]">
  승인된 노드와 관계를 …
</p>
```

### Intent

- **English caption** — A category-area identifier for the page. The mono + uppercase + spacing combo enables fast visual recognition of "where you are," but stays weaker than the main heading so the Korean h1 reads first.
- **Korean h1** — The name users actually call it. Korean is the primary heading, so all body copy / descriptions / CTAs maintain a consistent Korean tone.
- **Two-line separation** — Mixing English and Korean on a single line (e.g. "온톨로지 Ontology") is forbidden. Each line stays in a single language with a single tone.

### Legitimate English caption examples

- Page categories: `Ontology`, `Knowledge`, `Review`, `Settings`, `Diagnostics`, `Account`, `Workspace`, `Manual node`, `Get started`.
- System metadata: `ID 추천`, `Beta`, etc. — only intentional English identifiers. Sentence-style English is forbidden (translate to Korean).

### Consistency rules

- Caption font size stays in the `9px ~ 10px` range. Tracking ranges from `0.10em ~ 0.18em`.
- Within a single page, keep caption tokens consistent (mono / uppercase / tracking / color). System tokens will eventually be unified under a CSS var like `--font-caption-mono`.
- Use the English caption only once per page (top header). Don't repeat English category labels in the body — avoid duplicating the visual hierarchy.

### Surfaces where this applies (current)

`/ontology/edit`, `/ontology/insights`, `/ontology/relations`, `/settings/*`, `/account` — all follow the same pattern.

The public surfaces `/`, `/topology`, `/docs`, `/projects`, `/project/[slug]` use the standalone Korean h1 pattern (without an English eyebrow caption) — these are the browse surfaces, not the operations surfaces.

## Changelog

- 2026-04-13: Removed the consulting category
- 2026-04-12: Initial draft (Phase 0)
