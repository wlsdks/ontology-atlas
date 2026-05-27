---
title: Design System
tags: [design, ux, linear, overview]
---

# Design System

> This document is maintained based on Section 3 of the design spec. For the original Linear specification, see [`design-references/DESIGN-linear.md`](design-references/DESIGN-linear.md).

## Why this direction

`oh-my-ontology` should feel like a compact graph workbench, not a documentation
portal with a graph attached. The visual direction is still restrained: dark or
light neutral surfaces, one indigo accent, dense but readable controls, and no
decorative gradients. The product value comes from moving between three modes
over the same local markdown graph:

- **Browse** — hierarchy, node detail, reachability, and ego graph.
- **Write** — builder canvas edits that write back to vault frontmatter.
- **Query** — graph DB-style scans, health checks, domain matrix, and path
  evidence.

The tree is therefore a browse mode, not the whole product identity. Headers,
cards, and navigation should point users from tree inspection into Builder and
Insights whenever the next action is writing or graph-level verification.

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

## Product Surface Hierarchy

Operational pages should expose intent before visual flourish:

1. **Primary task** — what the user can do on this screen now.
2. **Graph evidence** — node count, relation count, warnings, health, or query
   packet readiness.
3. **Next graph action** — Builder for writes, Insights for graph DB-style
   queries, Topology for spatial/path inspection.

Avoid making large explanatory panels the first thing users read. Prefer compact
action strips with labels that name the mode (`Browse`, `Write`, `Query`) and a
short reason to click.

Tree surfaces should explain their boundary instead of pretending to be the
whole ontology. Use a compact role strip (`Tree role` / `Graph refs` /
`Evidence`) to show that the tree is the hierarchy index, relation counts come
from frontmatter refs, and document nodes remain evidence outside the concept
tree. Node-detail handoffs should always keep the three workbench exits visible:
Topology for visual focus, Builder for frontmatter-backed edits, and Insights
for graph DB-style validation. The selected-node panel should repeat that as a
small Browse / Write / Query rail before longer review content, so choosing a
tree node immediately offers visual focus, builder focus, and node proof without
requiring the user to parse the whole collaborator brief.
When no node is selected yet, the tree area should still expose a small
selection hint that names the same Browse / Write / Query outcome. This makes
row selection feel like the entrance to the workbench loop, not just a file-tree
click.
The `/ontology` Browse / Write / Query cards should also carry a compact proof
chip (`tree projection`, `frontmatter write`, `dogfood:graph-db`) so the first
viewport states which runtime contract closes each mode instead of reading like
three generic navigation cards. Treat them as an ordered workbench loop: show
`01` / `02` / `03` execution markers and one short loop-action line per card so
Browse reads as selecting the slug, Write as editing that same slug, and Query
as proving the graph after the change.

Tree projection warnings should be named as projection notes, not generic data
errors. The tree can only show one readable hierarchy, while the same
frontmatter graph may contain valid multi-parent or cyclic semantic relations.
When projection notes exist, the card should expand into a concrete warning
list and hand off to Insights for graph scans or Builder for relation review.

Builder write surfaces should make the persistence contract visible before the
canvas. Use compact `Source` / `Draft` / `Guard` / `Proof` status cells to
distinguish local writable vaults from sample read-only data, unsaved canvas
work from persisted graph data, preview/preflight checks from direct
frontmatter writes, and the MCP/CLI proof packets that close a graph mutation
after it lands. The `Proof` cell should hand off to the query cockpit so a
builder write naturally flows into graph DB-style verification instead of
ending as a canvas-only action. Each cell should also expose a compact proof
chip (`local markdown`, `canvas draft`, `relation guard`, `graph db proof`) so
the builder first viewport reads as a write/verify loop rather than a generic
diagram toolbar. Number those cells as a visible execution order and add one
short loop-action line per cell, so users can read the builder as source check
→ draft → guard → proof without opening the help popover.

Query surfaces should expose the executable query pack before deeper charts.
Use a compact cockpit with readiness, pack size, MCP call count, CLI fallback
count, representative `MATCH ...` intents, first-operation badges, per-intent
payload/fallback counts, scan/path result contracts, and the self-check gate.
Deeper panels can explain contracts, but the first viewport should make it
clear that the local markdown graph can be scanned like a small graph database
without treating raw rows or partial paths as proof.

Source/setup surfaces should expose the vault execution contract before setup
actions. Use compact `Files` / `Graph` / `Agent` cells to show that local
markdown remains the source of truth, frontmatter compiles into graph/query
surfaces, and MCP agents read the same vault. Action cards can follow, but the
first native-app entry must make the ontology workbench contract clearer than
the document-editor mechanics.

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

The header on each operations page (currently `/ontology/edit` and `/ontology/insights`) follows a **two-line pattern**. The user-facing Korean title is the primary heading, and the English category caption serves as a micro identifier that yields one step in the visual hierarchy.

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

- Page categories: `Ontology`, `Workspace`, `Manual node`, `Get started`.
- System metadata: `ID 추천`, `Beta`, etc. — only intentional English identifiers. Sentence-style English is forbidden (translate to Korean).

### Consistency rules

- Caption font size stays in the `9px ~ 10px` range. Tracking ranges from `0.10em ~ 0.18em`.
- Within a single page, keep caption tokens consistent (mono / uppercase / tracking / color). System tokens will eventually be unified under a CSS var like `--font-caption-mono`.
- Use the English caption only once per page (top header). Don't repeat English category labels in the body — avoid duplicating the visual hierarchy.

### Surfaces where this applies (current)

`/ontology/edit`, `/ontology/insights` — all follow the same pattern.

The public surfaces `/`, `/topology`, `/docs`, `/projects`, `/project/[slug]` use the standalone Korean h1 pattern (without an English eyebrow caption) — these are the browse surfaces, not the operations surfaces.

## Changelog

- 2026-04-13: Removed the consulting category
- 2026-04-12: Initial draft (Phase 0)
