---
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "src/**/ui/**"
  - "src/shared/motion/**"
  - "src/widgets/ontology-map/**"
  - "app/**/*.css"
  - "app/**/*.tsx"
  - "eslint.config.mjs"
  - "docs/DESIGN-SYSTEM.md"
---

# Design rules for building screens

Working decisions for UI source. Values live only in `docs/DESIGN-SYSTEM.md`
(about 350 KB): open the section you need from its table of contents, never the
whole file. Why each gate is shaped as it is: `.claude/rules/design-gates.md`.

Build rendered work in slices and look at each one: baseline, one coherent
slice, then a fresh accessibility tree and screenshot in the actual browser,
WebView or app, correct, and repeat (`docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md`
scopes it per change class; `/design-build` has the steps). DOM geometry
complements the capture. Motion needs the real recording in `/motion-verify`.

## Fixed scale contract

Workbench chrome (headers, toolbars, tab bars, side panels) is fixed; divergence
is a defect. Source: `docs/DESIGN-SYSTEM.md`, "Scale fixed contract" and
"Line-height ramp".

- Chrome pills and tiles are 36px (`--chrome-tile-size`); chrome labels use
  `text-label` (11px).
- Rail icons are one 20px step (`--app-nav-rail-icon-size`). The rail has no
  brand mark; above the destinations it carries only the open folder's identity
  and switcher (`features/vault-switch`). Below `lg` no chrome names the folder;
  a `BottomTabBar` folder seat is a separate decision.
- Do not scale UI at 1920px and wider; only 2400px and wider may use 1.1×.
- Body type is self-hosted Pretendard Variable.
- Register every new type step in `TYPE_RAMP_STEPS` and every leading step in
  `LEADING_RAMP_STEPS` (`src/shared/lib/cn.ts`); tailwind-merge silently drops
  unregistered steps.
- Size and line height are a pair. Use named ramp utilities: a `--leading-*`
  step for UI, `prose` for authored text, `display-tight` for names or numbers
  of at most two lines. Raw `text-[Npx]` and `text-[var(--text-body)]` lose the
  pair. `--leading-hero` is live through `text-hero`.
- Text that inherits the 16px root has escaped the ramp.
- Gateway chrome (`GatewayNav`) is outside the 36px/20px workbench contract;
  create a gateway token only once a second real consumer exists.
- Settings sheets and their drill-ins: row labels and interactive text use
  `text-body`, descriptions and values `text-label`, and `text-caption` (9.5px)
  only for one uppercase eyebrow. LNB rows use `px-3 py-2` and `text-body-lg`.
  Gate: `tests/contract/settings-sheet-type-dialect.contract.test.ts`.

## Design charter

Before arranging workbench UI, read `docs/DESIGN-SYSTEM.md`, "Workbench
composition and motion": choose the fact or action that owns the screen and draw
its real object or causal relationship. Equal cards with correct tokens are not
a composition.

- Achromatic base, indigo protagonist. Gradients, glass, glow, scale hover,
  overshoot and extra hues are allowed (2026-09-08), each through a ramp token
  and naming the fact or state it carries.
- The pixel mascot's raster colours, including chartreuse `#C6F000`, never
  become CSS tokens or UI colours (`docs/design/brand.md`).
- Signal tones are warning amber, error red and success emerald; success marks
  a real success state only.
- Hub amber `#d4b478` belongs to hub nodes and Layer 0 containers. The walked
  trail uses one of three named tones (star ink by default, yellow, indigo) and
  shows only while its popover is open. Gate:
  `tests/contract/footprint-trail-ink.contract.test.ts`.
- Kind colour is data: a small marker plus a label on a neutral surface. Colour
  alone may carry kind only in unlabeled totals, map dots and tree chips. Bars
  use neutrals plus one indigo, separated by a 1px track gap.
- No coloured left-edge stripe on a new card or row ("No left-edge selection
  stripe" in `docs/DESIGN-SYSTEM.md`).
- Galaxy paints a circular core, corona and sparse glint only: no polygon,
  outline or default edge mesh. Twinkle is atmosphere, never data; reduced
  motion freezes it. Flat and Dome keep canonical shapes. Details:
  `docs/DESIGN-SYSTEM.md`, "v2 Language Definition" and "Galaxy reference
  translation".
- Workflow categories differ by shape (active underline, planned dashed), not
  colour alone. Selection stays in one indigo family; edge selection uses
  `--map-edge-selected` on both endpoints.

## One word per thing

One accurate word per thing. Canonical spellings live in
`tests/contract/user-facing-vocabulary.contract.test.ts`; history is in
`docs/DECISIONS.md` (2026-08-25).

| Thing | Word in copy |
|---|---|
| The Markdown folder the person chose | the ontology-folder term; no synonym and no other product's coinage |
| The meaning graph inside it | the ontology; never the renderer's name |
| The screen that draws it | the map: the view, never the data |
| One node | the concept term; never "node" |
| A node's kind | its real name, only where kind is the point |

`vault` stays in code, CLI, MCP and docs identifiers; a name such as
`validate_vault` is never reworded inside copy.

## Map and canvas

- Node click behaviour: `forbidden.md`. Focus, overview-first and scale rules:
  `docs/DESIGN-SYSTEM.md`, "Topology node focus & scale".
- Shape, radius, magnitude and count rules live only in "Node Spec". Keep
  `render/node-shapes.ts` and `shared/ui/map-kind-glyph.tsx` aligned
  (`node-kind-shape-parity` contract). Radii 30/17/11/7,
  `DOMAIN_HALF_EXTENT_RATIO`, and any bridge-node visual require reopening the
  map research with `design-infoviz`.
- Canvas paint composites `source-over`. `globalCompositeOperation = "lighter"`
  is licensed only where the mark is light: the gateway hero, the walked-path
  star (`shared/lib/star-emission.ts`) inside an opened lens, and Galaxy
  star/meteor atmosphere. Restore the previous operation in the same function;
  a node carries at most one diffraction cross per frame. Gate:
  `tests/contract/canvas-composite-license.contract.test.ts`.

## Absolute rules point to one source

The canonical Don'ts live in `docs/DESIGN-SYSTEM.md`, section "Absolute rules (Don'ts)".
`forbidden.md` carries the always-loaded subset. Do not copy them here;
`design-donts-parity.contract.test.ts` reconciles the `dont:` markers.

## Dimensional regularity

Cards in one row share a height. Repeated icon buttons, chips and fields use one
size step per role; a size difference must encode hierarchy or state.

## Changing the specification requires `design-contract`

When a change alters the specification in a file below, declare
`design-contract` to `pnpm design:route`; the router convenes `design-system`
plus a contrasting seat, a system audit, and a gate probe.
`scripts/lib/design-spec-census.mjs` reads this list (only rows shaped
`` - `path` — description ``), and `pnpm decisions:check` requires a decision
record when a listed file's vocabulary or values change. Contract:
`tests/contract/design-spec-ledger.contract.test.ts`.

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

## Lint owns the value ramps

`eslint.config.mjs` (`no-restricted-syntax`) is the authority; document a new
rule and its lint enforcement in the same PR. In product code it blocks raw
`text-[Npx]`, `rounded-[Npx]`, leading and tracking values; hex and colour
functions outside tokens; shadows not built from elevation, docking, press,
surface or inset tokens; numeric `duration-*`; inline type, radius or shadow
literals; weights other than 400/510/560/650; Tailwind palette classes; z-index
20 and above without `--z-*`; repeated `cursor-pointer`; hand-built disabled
states (`CONTROL_DISABLED_CLASS`); and unpaired accent/tint.

Lint cannot see an unknown utility: `text-large` emits no CSS and silently
renders 16px. Spacing is deliberately unenforced; do not add unused spacing
tokens. Contract tests cover cross-file values and rendered geometry, and
`pnpm checks:changed` names the ones a change reaches.

## Tokens and surfaces

- All colours go through CSS variables, defined in the `@theme` and `:root`
  blocks of `app/globals.css`. Declare translucent values in `:root` as well:
  Tailwind v4 may emit the utility without the root variable.
- Topology dimensions, surfaces, shadows, radii, insets, camera, focus, panel
  and drag motion use `--topology-*`. A new clamp, shadow, easing or duration
  needs a token name, a product reason, and a WebView/test marker.
- Coarse-pointer targets come only from `@media (pointer: coarse)` and
  `--touch-target-min`, never viewport guesses. Scrollable pages below `lg`
  reserve `--topology-mobile-bottom-tab-reserve`; full-bleed map and docs
  surfaces do not.
- Never ship stacked floating panels, popup soup, tokenless positioning,
  non-blocking modals, or drag-only discovery. A new transient surface dismisses
  or recedes unrelated ones.
- Dark only: no light switch, `data-theme`, light-only tokens or light contrast
  branches; `app/layout.tsx` fixes `viewport.colorScheme` to `dark`.

## Motion

- Prefer colour and opacity transitions over transform.
- Durations: `--motion-fast` 120ms for feedback (the Tailwind default; omit the
  class), `--motion-base` 180ms to move a surface, `--motion-settle` 240ms for a
  completed change. Camera and drag values of 420/720ms are canvas-only.
  Duration and easing move as one family.
- Overshoot, bounce and spring settle need a named token and a stated meaning.
- Exits accelerate on `--motion-ease-exit` (JS `EXIT_TRANSITION`) under their own
  animation name; entries keep `--motion-ease`. Only `-out` /
  `[data-state="closed"]` rules on a `*Out` keyframe may use the exit token,
  never a `transition:`, and only `src/shared/motion` imports
  `MOTION_EASE_EXIT` (`motion-token-mirror`, `exit-motion-restart` contracts).
- The attention winner moves first; never hard-cut the protagonist while the
  background eases.
- One input is one event: related transitions start in the same frame; a gap
  longer than `--motion-fast` reads as a second event unless causality needs it.
- Reduced-motion alternatives live in the global override's cascade layer
  (`reduced-motion-equivalent` contract).
- Surface swaps keep both frames briefly (`usePanelPresence`, `useSurfaceSwap`,
  `useSwapHeight`); exiting content is inert and pointer-disabled for one
  `EXIT_WINDOW_MS`.
- Frequent hover and focus motion ends by `--motion-fast`. User-initiated zoom,
  pan and scroll keep their duration (WCAG 2.2 §2.3.3); only programmatic travel
  becomes immediate.
