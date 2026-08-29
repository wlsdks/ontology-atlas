---
paths:
  - "src/**/*.tsx"
  - "src/**/ui/**"
  - "src/shared/motion/**"
  - "src/widgets/topology-map-v2/**"
  - "app/**/*.css"
  - "app/**/*.tsx"
  - "eslint.config.mjs"
  - "docs/DESIGN-SYSTEM.md"
---

# Design system rules for building screens

> Conditionally loaded for UI source. This file owns decisions needed while
> building; it does not duplicate the design system's values.

## Four design documents, one system

| File | Question | Loaded | Size role |
|---|---|---|---|
| `forbidden.md`, Design | What must never be done? | always | smallest pre-file subset |
| this file | What must a screen obey now? | UI source | working rules |
| `design-gates.md` | Why is each gate shaped that way? | gate source only | failure history and probes |
| `docs/DESIGN-SYSTEM.md` | What are the canonical values and evidence? | never automatically | 258 KB authority |

`docs/DESIGN-SYSTEM.md` is the single source of truth for values. Use its table
of contents and open only the relevant section; reading all 258 KB costs about
60k tokens. This file contains decisions, not a second value catalog.

## Fixed scale contract (owner decision, 2026-07-24)

**Chrome** means the frame around content: headers, toolbars, tab bars, and side
panels. These values are fixed; divergence is a defect, not taste.

- Chrome pills and tiles are **36px** through `--chrome-tile-size`; chrome labels
  use **`text-label` (11px)**.
- Rail icons are one **20px** step through `--app-nav-rail-icon-size`. The rail
  starts with destinations and carries no separate brand mark or wordmark.
- Do not scale at widths of 1920px or above. At 2400px and above, 1.1× is allowed;
  fractional text scaling below that blurs rasterization.
- Body type is self-hosted **Pretendard Variable**. Inter was removed after its
  Latin-only subset mixed badly with Korean glyphs.
- Register every type-ramp addition in `TYPE_RAMP_STEPS` in
  `src/shared/lib/cn.ts`. An unregistered class was silently treated as colour
  and discarded by tailwind-merge, rendering 16px chrome in 2026-07-23.
- Type and line height are paired. Use the matching `--leading-*` step for UI,
  `prose` for authored text, and `display-tight` for names/numbers of at most two
  lines. Register new steps in `LEADING_RAMP_STEPS` too.
- Responsive type changes must keep their line-height pair. Raw `text-[Npx]` and
  length references such as `text-[var(--text-body)]` lose that pairing. Named
  ramp utilities keep it. `--leading-hero` is live through `text-hero` even when
  it has no direct consumer.
- Text inheriting the 16px root size has escaped the ramp.
- The fixed 36px/20px chrome contract applies to the workbench. Gateway chrome
  is a first impression, not a map toolbar; `GatewayNav` uses existing
  `min-h-14`/`md:min-h-16` steps. Create a gateway token only after a second real
  consumer exists.
- Modal settings sheets are also outside workbench chrome, but not outside a
  specification. Their interactive text and row labels use `text-body`,
  descriptions and values use `text-label`, and `text-caption` is reserved for
  one uppercase eyebrow. LNB rows use `px-3 py-2` and `text-body-lg`.
- Settings drill-ins follow the same hierarchy. A 2026-08-09 inventory found one
  panel with 10 of 24 visible strings at 9.5px while six peers had none; keys were
  smaller than values and JSON users had to inspect was also 9.5px. The gate
  narrows exemptions to the uppercase eyebrow instead of excluding drill-ins:
  `tests/contract/settings-sheet-type-dialect.contract.test.ts`.

Full values: `docs/DESIGN-SYSTEM.md`, “Fixed scale contract” and “Line-height
ramp.”

## Design charter

- Use an achromatic palette plus one indigo family. This restraint prevents the
  generic AI-generated SaaS look.
- The pixel mascot is the one bounded identity exception: its committed raster
  pixels may contain near-black, ivory, chartreuse `#C6F000`, and one gray.
  Chartreuse never becomes a CSS token, control/status/data colour, or a second
  application palette. See `docs/BRAND.md` and the 2026-08-28 decision.
- Signal tones are warning amber, error red, and success emerald, each with one
  solid dot and three translucent surface/edge/text steps. Success means a real
  successful state such as connected, confirmed, or complete—not decoration.
- Hub nodes and Layer 0 containers may use hub amber `#d4b478`; a spine view may
  show one hub ring and one Layer 0 container. Documented, mode-bounded exceptions
  are the single agent-focus ring and recent-change spotlight.
- Amber has three distinct roles: hub, kind data, and footprint trail. The rail
  begins with destinations and carries no brand mark; chartreuse mascot pixels
  therefore do not spend the rail or data-colour budget.
  Footprints use `--color-footprint-trail` (`#e8c47a`), never the hub value, and
  appear only while the trail popover is open. The footprint trail may use yellow
  or indigo, not an arbitrary colour picker. Gate:
  `tests/contract/footprint-bloom-exception.contract.test.ts`.
- Bars use neutrals plus one indigo protagonist. A 1px track gap separates
  adjacent segments when colour contrast is insufficient. Kind colours remain
  only where colour is the sole carrier of kind: unlabeled kind totals, map dots,
  and tree chips. A prior amber/eucalyptus pair measured 1.14:1 and relied on a
  red-green distinction, so it was not information-safe.
- Kind colour is data, not a card decoration. Use neutral surfaces with a small
  marker and label; never a full-height coloured rail.
- Distinguish workflow categories through shape—indigo underline for active,
  dashed for planned—not colour alone.
- Selection stays within one indigo family: node selection uses the base indigo;
  edge selection uses `--topology-v2-edge-selected` on both endpoints.
### One word per thing (owner, 2026-08-25 — overturns the earlier “avoid ontology” rule)

The old rule said to use “ontology” only in the brand and in sentences defining
it, and to say map, concept or workspace elsewhere. Avoiding the word did not
produce plain language; it produced **four names for one thing**. A measured
inventory of the Korean catalogue found the person's own folder called by four
different names across 41 strings, and the word for “map” doing duty for both the
graph and the screen that draws it — which is why the empty state described the
node count as a count of *projects*, building a newcomer's first sentence out of a
schema kind.

The owner lifted the ban, then corrected the over-correction the same day: *“make
these terms consistent and not strange. You may use the word ontology.”* and
*“proper domain terms are fine — do not mangle them into something odd for the
sake of non-developers. The universal technical term is what matters.”* A first
pass had flattened every folder word to a plainer one and replaced the word for
validation with a vaguer verb; that mangling is as wrong as the split it replaced.

One word per thing, and the word is the accurate one. The canonical spellings are
data, so they live in the gate rather than here:
`tests/contract/user-facing-vocabulary.contract.test.ts`. In prose:

| Thing | Rule |
|---|---|
| The Markdown folder the person chose | the ontology-folder term; never a second synonym, and never another product's coinage |
| The meaning graph inside it | the ontology; never the renderer's name |
| The screen that draws it | the map — the view, never the data |
| One node | the concept term; never “node” |
| A node's kind | the kind's real name, only where the kind is the point |

The split that matters most: **the ontology is the thing, the map is the view of
it.** Using one word for both is what produced sentences describing data as if it
were drawing.

`vault` was considered for the folder and rejected on the owner's own test: it is
Obsidian's coinage, not a universal term — Logseq says graph, Foam and Zettlr say
workspace, and knowledge engineering does not use the word. Nothing forbids it; it
is simply not the standard asked for. Inside code, CLI, MCP and docs `vault`
stays: there it is a filesystem and API name, and renaming a public contract is a
separate decision. Identifiers keep their spelling wherever they appear, including
inside copy — `pnpm vault:validate` and `validate_vault` are names, not synonyms.

The guided tour and help glossary still own the definitions; this permits the
word, it does not licence a second teaching screen.

## Topology focus and scale

Authority and sources: `docs/TOPOLOGY-FOCUS-AND-SCALE.md`, grounded in
Shneiderman's “overview first, zoom and filter, details on demand” (1996).

- Clicking a node keeps its ego graph opaque, dims or hides everything else, and
  anchors a compact popover beside it. Do not mutate the source graph. Full detail
  is an explicit action inside that popover, never the default click result.
- Start with project, domain, and hub nodes. Expand lower tiers on interaction;
  do not dump thousands of nodes into the first frame.
- Use plain labels such as “used by N” and “depends on N.” Do not repeat a generic
  heading several times.
- Scale in this order: cache layout, reduce labels/edges during movement, keep
  offscreen-edge culling, then cluster by domain beyond 5,000 nodes.

## Node specification points to one authority

Shape, radius, magnitude, and embedded-count rules live only in
`docs/DESIGN-SYSTEM.md`, “Node Spec.” Keep
`render/node-shapes.ts` and `shared/ui/topology-v2-kind-glyph.tsx` aligned;
`tests/contract/node-kind-shape-parity.contract.test.ts` catches drift.

Do not invent a visual for bridge nodes before `design-infoviz` decides it. The
radius values 30/17/11/7 and constants such as `DOMAIN_HALF_EXTENT_RATIO` encode
the outcome of the map research and require that work to be reopened before
change.

## Retired studio game exception

The old studio-only glow, gradient, aura, particle, rarity, and shimmer exception
was revoked on 2026-07-24. “Make it addictive like a game” was a metaphor, not a
specification; game aesthetics weakened trust in decision material. Studio later
retired. Contextual map editing and ACP proposal cards follow the same neutral
plus indigo system as the rest of the product.

## Label decoration

- Do not put decorative arrows after labels. A trailing `ArrowRight` or
  `ArrowUpRight` is not hierarchy.
- Arrows are allowed when they carry path, order, causality, or the prefix for an
  external destination (`↗`).
- `tests/contract/label-decoration.contract.test.ts` owns the exact syntax.

## Dimensional regularity

Repeated cards in one row have equal height despite copy length. Repeated icon
buttons, chips, and fields use one size step per role. Variation must encode a
real hierarchy or state, not the accident of which file introduced the control.
Measure repeated rectangles in `/design-audit`; do not approve by sight.

## Absolute rules point to one source

The fifteen canonical Don'ts live in `docs/DESIGN-SYSTEM.md`, section
"Absolute rules (Don'ts)". Do not copy them here. `forbidden.md` carries an always-loaded subset,
and `tests/contract/design-donts-parity.contract.test.ts` reconciles `dont:`
markers. Sentences may be rewritten or translated; marker slugs may not drift.

## Changing the specification requires `design-system`

Changes to any file below convene the `design-system` seat. This list is both the
human rule and the machine input read by `scripts/lib/design-spec-census.mjs`:

- `src/shared/ui/control-class.ts` — cva axes, options, defaults, and field/control value layers
- `src/shared/ui/controls.tsx` — interactive primitives
- `src/shared/ui/surface.tsx` — appearing/disappearing surface primitive
- `src/shared/ui/dialog.tsx` — blocking modal authority: scrim, focus trap, Escape, restoration, scroll lock, widths
- `src/shared/ui/input.tsx` · `src/shared/ui/checkbox.tsx` — form behaviour authority
- `src/shared/ui/badge-class.ts` — static badge geometry
- `src/shared/ui/segmented-control.tsx` — exclusive single-selection containers and fill
- `src/shared/lib/use-roving-radio-group.ts` — radiogroup behaviour
- `src/shared/ui/page-frame.ts` — page inset, top spacing, width, and title layout
- `app/globals.css` — type, leading, radius, shadow, control-height, icon, and palette ramps
- `.claude/rules/design.md` — this file's “Fixed scale contract” section

Adding a path here immediately extends `pnpm decisions:check`; no duplicate list
exists in code. Contract:
`tests/contract/design-spec-ledger.contract.test.ts`.

This rule exists because 244 controls were normalized without convening this
seat. The author alone grew eight tones, seven shapes, three axes, and their
ramps. Although chip sizes fell from 50 to 3, one screen still carried 8–9
control heights because every difficult case added another option.

> A specification decided by one author is taste, not a specification.

Machines cannot prove who reviewed a change. They can prove that vocabulary or
values changed without a new decision record. The census watches axes, options,
defaults, ramp tokens, exported primitives, and this section's numbers—not
whether a frequently touched file merely appears in a diff. That precision
avoided 63 false positives across 79 of the last 300 commits.

## The specification is enforced by lint

Document a new rule and its `eslint.config.mjs` enforcement in the same PR. A
document-only shadow ramp once left five raw rgba shadows alive.

`no-restricted-syntax` currently enforces:

| Rule | Enforcement |
|---|---|
| Type ramp | no raw `text-[Npx]`; zero exemptions |
| Radius ramp | no raw `rounded-[Npx]`, including directional forms |
| Shadow ramp | every comma-separated layer must match an elevation, docking, press, surface, or inset form |
| Hex colour | no hex inside arbitrary-value syntax |
| Motion duration | no numeric `duration-*`; use tokens |
| Leading ramp | no raw or named Tailwind leading steps; use `--leading-*`, `display-tight`, or `prose` |
| Ramp bypass | do not reference type-ramp tokens as arbitrary lengths |
| Inline shadow | JSX `boxShadow` must reference an approved token |
| Inline type/radius | literals, ternaries, and templates are forbidden; `var()` only, with type-ramp bypass still forbidden |
| Tracking | use named tracking tokens, never raw em values |
| Weight | only signature 510, emphasis 560, strong 650, plus normal 400 reset |
| Tailwind palette | use `--color-*`, not `text-white` or `bg-slate-*` |
| z-index ≥20 | use `--z-*`; local stacking below 20 is free |
| Cursor | do not repeat `cursor-pointer` on buttons or summaries; the base rule owns it |
| Disabled state | opacity 55 and `CONTROL_DISABLED_CLASS` own the full state |
| Gradient ban | `scaleGradientSelectors` |
| Accent/tint pairing | `accentTintPairingSelectors`, including ternary branches |

A **ramp** is the allowed value list; a **selector** describes syntax lint finds;
a **level** decides error versus warning; a **ratchet** allows a measured count to
fall but never rise.

### Contract tests cover layers lint cannot see

Use a contract when correctness requires another file's values, composed output,
absence of a class, or rendered geometry. Current owners include:

- type/leading existence and pairing:
  `type-ramp-step-defined` and `type-ramp-leading-pair`;
- shell content compression and scroll-end reserve: `AppShell.test.tsx` and
  `scroll-end-gap.spec.ts`;
- composed control values and neutral scope separation: `control-class`;
- repo-wide hand-written control count: `control-adoption-ratchet`;
- numeric Lucide icon props: `icon-size-ramp`;
- inline prose-link display and target semantics: `prose-link` plus
  `touch-target-contract`;
- Korean mid-word wrapping: `korean-word-break.spec.ts`;
- rendered pointer affordance: `cursor-affordance.spec.ts`;
- topology-panel ink hierarchy: `topology-panel-ink-ladder`;
- quaternary text by composited surface: `quaternary-ink-surface` plus
  `a11y-open-surfaces`;
- filled-brand contrast: `brand-fill-ink-license`.

An unknown utility such as `text-large` produces no CSS and silently falls back
to 16px, so hardcoded-value lint sees nothing. Spacing is deliberately not
enforced: only 27 raw-pixel uses (1.1%) were measured, mostly one-off optical
corrections. Unused `--pad-card`/`--pad-panel` tokens were removed instead;
unused tokens are misinformation, not specification.

Gate rationale, notation failures, exemptions, and pre-enable inventory belong
in `@.claude/rules/design-gates.md`, loaded only while changing gates. This file
once reached 63.4 KB, 43% gate archaeology. Keep rules here and history there.

## Token use

- Route all colours through CSS variables. Do not write raw hex in product code.
- Use canvas, panel, elevated, and secondary surfaces; text-primary through
  quaternary; overlay-1/2/3 and soft/strong borders.
- Use `--topology-*` tokens for topology dimensions, surfaces, shadows, radii,
  insets, camera, focus, panel, and drag motion. A new clamp, shadow, easing, or
  duration requires a token name, product reason, and WebView/test marker.
- Coarse-pointer targets come only from `@media (pointer: coarse)` and
  `--touch-target-min` (44px), never viewport guesses. A scrollable page below
  `lg` reserves `--topology-mobile-bottom-tab-reserve`; full-bleed map/docs
  surfaces do not. `scroll-end-gap.spec.ts` measures 17 routes at 1280, 768, and
  390px.
- Never ship stacked floating panels, popup soup, tokenless positioning,
  non-blocking modals, or drag-only discovery. New transient surfaces dismiss or
  recede unrelated ones.
- Meaningful UI needs Design Guardian evidence: attention winner, typed fact,
  token contract, motion state, screenshot/WebView evidence, and whether an
  installed-app proof is required.

## Motion

- Prefer colour and opacity transitions; minimize transform.
- Use three semantic durations: `--motion-fast` 120ms for feedback,
  `--motion-base` 180ms for moving a surface, and `--motion-settle` 240ms for a
  completed change. Default Tailwind transitions already use fast; omit a class.
  Camera/drag values 420/720ms are canvas-only.
- Duration and easing move as one family. Respect the global reduced-motion rule.
- The attention winner moves first. A protagonist hard-cut while the background
  eases is a defect; a measured popover once completed 88.8% in its first frame
  while the map received 100ms.
- One input is one event. Related transitions start in the same frame; more than
  `--motion-fast` separation reads as another event unless causality requires a
  deliberate stagger.
- Exits use their own animation name. Reversing an entrance does not restart when
  only direction changes; `exit-motion-restart.contract.test.ts` guards this.
- Reduced-motion alternatives live in the same cascade layer as the global
  override; `reduced-motion-equivalent.contract.test.ts` owns the roster.
- Surface swaps keep both frames briefly with `usePanelPresence`,
  `useSurfaceSwap`, or `useSwapHeight`; exiting content is inert and
  pointer-disabled for one `EXIT_WINDOW_MS`.
- Frequent hover/focus motion ends by `--motion-fast`; move/settle values are for
  infrequent events. User-initiated zoom, pan, and scroll retain time under WCAG
  2.2 §2.3.3; only programmatic travel becomes immediate.
- Measure the element that actually owns the animation. A 2026-07-28 audit
  measured a non-animating positioner and falsely reported a hard cut; the inner
  panel was already healthy at 16.3% first-frame change.

## Dark only

The product has one dark appearance. Do not restore a light switch,
`data-theme`, light-only tokens, or light contrast branches. `app/layout.tsx`
fixes `viewport.colorScheme` to `dark` even when the OS prefers light.

## Token definition location

Tokens live in the `@theme` and `:root` blocks of `app/globals.css`. Tailwind v4
may create utilities for translucent tokens without emitting root variables, so
declare translucent values explicitly in `:root` as well.
