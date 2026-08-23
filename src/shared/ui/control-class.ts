import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/cn';

/**
 * The **single source of class strings** for anything that gets pressed.
 *
 * **Why the value layer is a function.** This is not a claim that components
 * are wrong here — the first reading said that and was corrected the same day.
 * Three primitives with zero call sites (`Card`, `Badge`, `DetailCard`) looked
 * like proof. The owner pushed back — *"Maybe they just have not been
 * adopted yet — doesn't every design system ship components?"* (maybe they just have not been
 * adopted yet — doesn't every design system ship components?) — and opening them
 * gave a different answer: created 2026-04-30, so "not yet" was out, and
 * `CardTitle` used **`text-lg`**, a step that does not exist in this repo's type
 * ramp (caption · label · body · body-lg · title · display · hero · hero-lg). A
 * primitive that violates the system it is meant to encode is one nobody adopts.
 * What failed was not components but **components without a gate**; all three
 * were deleted. Carbon, Fluent, Material, Polaris and shadcn all ship components.
 *
 * So what this file argues is a **split of layers**:
 *
 * | Layer | Form | Why |
 * |---|---|---|
 * | **Values** (shape · size · colour) | this function | A string suffices, and a contract test can stop off-ramp values from ever being emitted |
 * | **Behaviour** (default `type="button"`, required accessible name, disabled affordance, focus) | a component | A string cannot carry it |
 *
 * Layering a component on top is expected — **but it must be born with a gate**.
 * That is why `Card` sat dead for three months, and why this file shipped with
 * its contract test in the same PR.
 *
 * **Why six shapes.** A full inventory of the 419 raw production `<button>`s
 * (2026-08-03):
 *
 * | Shape | Count | Covered by `<Button>` |
 * |---|---:|---|
 * | `chip` | 128 | ✗ |
 * | `link` | 85 | ✗ |
 * | `row` | 39 | ✗ |
 * | `icon` | 36 | ✗ |
 * | `pill` | 32 | ✗ |
 * | `card` | 18 | ✗ |
 * | standard button (h-10/11) | **1** | ✓ |
 *
 * 5% adoption was a **coverage hole**, not laziness — the system had one control
 * class and the app used six. The job here is to supply the missing classes, not
 * to push people toward `Button`.
 *
 * **The values came from measurement, but the measurement had no spec.** Each
 * shape's *shape* classes are today's modal values (chip: `rounded-chip` ×126,
 * `transition-colors` ×121 …), which is lossless. **Sizes were not**: across 143
 * chips the (height, `px`, `py`, type) combination had **50 distinct values**
 * with the top three covering only **23%** — effectively arbitrary rather than a
 * ramp, the exact defect `.claude/rules/design.md` dimensional regularity names. So the size ramp below is **the spec to converge on, not a
 * summary of today**:
 *
 * > **Moving an existing control onto this function is normalisation, not a
 * > refactor — pixels change.**
 *
 * A bulk migration is therefore the design gate's call (`/design-council`
 * system, the design-systems seat), not this file's. What this file guarantees
 * today is narrower — **a newly written control does not turn 50 combinations
 * into 51** — enforced by
 * `tests/contract/control-adoption-ratchet.contract.test.ts`.
 *
 * **What this function does not do.** It does not replace the standard
 * `<Button>`: that already carries a variant/shadow system, only 1 of the 419
 * had its shape, and overlapping would blur which one is the spec. And it emits
 * no accessibility defaults — a function returns only a string, so
 * `type="button"` and the accessible name are enforced by separate lint rules.
 * That was the stated cost of this approach.
 */

/**
 * Disabled — **what cannot be pressed must not look pressable.**
 *
 * It lives in the value layer because per-component handling misses one: on
 * 2026-08-03 both `ChromeChip` and `ChromeTile` were missing it, found by the
 * owner as *"'recent changes' pressing does nothing"* (pressing "recent
 * changes" does nothing). The values match what `Button` already uses;
 * `tests/contract/disabled-affordance.contract.test.ts` keeps the primitives
 * from drifting apart.
 *
 * **Why it is exported** (2026-08-06, design-systems seat). After the value
 * layer settled on 55, nine call sites still emitted 60/50/45 — six overrode the
 * base of `controlClass()`/`fieldClass()` through `className`, three were
 * hand-rolled controls that had copied the values and drifted. Without a name to
 * compose, the next hand-rolled control copies them too. The four classes are
 * one set (opacity · cursor · shadow removal · hover neutralisation); taking only
 * the opacity leaves a half state that is disabled but still hovers.
 *
 * Gate: `disabledAffordanceSelectors` in `eslint.config.mjs` blocks any
 * `disabled:opacity-*` literal other than 55 repo-wide, and the contract test
 * checks this constant against the value lint allows.
 */
export const CONTROL_DISABLED_CLASS =
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:border-inherit disabled:hover:bg-inherit disabled:hover:text-inherit';
const DISABLED = CONTROL_DISABLED_CLASS;

/**
 * Keyboard focus — in the value layer for the same reason as `DISABLED`.
 *
 * **Why it was missing, and why that reasoning was wrong** (measured
 * 2026-08-05). This file used to state that hover and focus were not emitted
 * here, citing the motion budget in `.claude/rules/design.md` (hover/focus must
 * finish inside `--motion-fast`). That citation was a category error: the rule
 * governs how *long* a focus transition takes, not *whether* focus is drawn.
 *
 * The consequence: the string `focus` appeared **0 times** in `controlClass` and
 * `controls.tsx`, so `Chip` (52 sites), `IconButton` (35) and `RowButton` (19)
 * all drew the browser default focus ring — the **OS accent colour, usually
 * light blue**. That is outside the single-colour-system rule in
 * `.claude/rules/forbidden.md`. The same defect had been caught once on the
 * first-run sheet, producing `tests/e2e/dialog-focus-ring.spec.ts`, but that
 * check looked at one container and not the buttons inside it.
 *
 * The older primitives (`Button`, `ChromeChip`, `ChromeTile`, `TabBar`,
 * `Select`, `InfoHint`) all had rings — **the new source of truth was the one
 * that lost it**, exactly as `DISABLED` was lost on 2026-08-03.
 *
 * `ring-inset` because an outer ring overlaps neighbours in dense rows and chip
 * clusters. An inset ring changes the box by zero pixels, so adding this
 * constant causes no layout shift.
 */
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

/**
 * Touch floor marker — raises a control to 44px under `pointer: coarse` only.
 *
 * **Why the value layer emits this.** Heights here are **Tailwind literals**
 * (`min-h-6`=24, `min-h-8`=32, `min-h-9`=36), not `--control-h-*`. So raising
 * those tokens to 44 inside `@media (pointer: coarse)` reached **no chip, row or
 * pill at all** — 38 sites measured under 44px.
 *
 * Converting the literals to token references is blocked: the 5 literals are not
 * 1:1 with the 3 token steps, so the swap would move desktop pixels too. Hence a
 * marker class that lays a floor **on touch only**. The rule sits at the end of
 * `app/globals.css`, **outside the cascade layers** — inside a layer, `min-h-8`
 * from `@layer utilities` wins regardless of specificity (we hit this).
 *
 * **Why real height rather than `touch-hit-expand`.** Both were measured. Hit
 * area alone lets controls **overlap**: of the 38 sites under 44px, **21 sat
 * within 12px of a neighbour** (the EN/KO toggle within 1px), and overlapping
 * invisible areas are mis-taps. `min-height` grows the control, which **pushes
 * neighbours away**, so overlap is impossible. The cost is density (the mobile
 * `/docs` header grows to ~50px tall) and we accepted it.
 *
 * `icon` is excluded because its square-surface contract cannot be held by
 * `min-h`, and `link` because raising it would tear text lines (WCAG 2.5.8
 * inline exemption). Gate: `tests/contract/touch-floor-layer.contract.test.ts`.
 */
const TOUCH_FLOOR = 'atlas-touch-floor';

const control = cva(`${DISABLED} ${FOCUS}`, {
  variants: {
    /**
     * What it presses like. The six above are all of them, and **adding a
     * seventh requires re-running the inventory** — a new shape means the
     * classification missed a population.
     */
    shape: {
      /*
       * A small pill-shaped control with a label; the most common in this app
       * (128).
       *
       * The only shape whose radius is not here — the size compounds emit it
       * (`xs`=micro, `sm`~`lg`=chip). The micro tier (one step below chip, not
       * below 24px) also drops a radius step: 96 inventoried sites carried 4px
       * (`rounded-micro`). Keeping radius out of the base stops two radii from
       * coexisting in one output; `cn`'s radius group merge
       * (`RADIUS_RAMP_STEPS`) would resolve it, but a single class is honest.
       */
      chip: `${TOUCH_FLOOR} inline-flex items-center gap-1.5 border transition-colors`,
      /**
       * Square icon control. No label, so an accessible name is **required**
       * (36).
       *
       * **Why `touch-hit-expand` is attached here** (2026-08-05). This shape
       * emits **hard dimensions** — `h-6` (24), `h-7` (28), `h-8` (32) — because
       * a square cannot be held by `min-h`. That part is right; the consequence
       * is not. The 44px promotion under `@media (pointer: coarse)` applies to
       * **9 CSS tokens** (`--chrome-tile-size`, `--overlay-close-size`, …) and
       * this shape reads none of them: measured **51 sites** (`shape: 'icon'` 17
       * + `IconButton` 34) at 24–32px under a finger, **0** with
       * `touch-hit-expand`. "The promotion was landing in an empty room", the
       * sentence `touch-target-contract.spec.ts` wrote in its own header, had
       * become true again — this time because the value layer emits literals.
       *
       * It lives in the value layer for the `DISABLED`/`FOCUS` reason (per
       * component, one gets missed). The class exists **only inside
       * `pointer: coarse`**, so no rule is generated for mice, and it widens the
       * hit area through a pseudo-element while leaving the visible box alone —
       * zero layout shift.
       */
      icon: 'touch-hit-expand inline-flex shrink-0 items-center justify-center rounded-chip transition-colors',
      /**
       * A whole list row that is pressable; left alignment is its identity (39).
       *
       * ⚠️ `rounded-chip` was **missing at first**, so normalised list rows drew
       * a square hover background (radius 6 → 0). Defining a shape without
       * giving it a radius caused it; measurement caught it.
       */
      row: `${TOUCH_FLOOR} flex w-full items-center text-left transition-colors`,
      /** Fully rounded control carrying a state or a count (32). */
      pill: `${TOUCH_FLOOR} inline-flex items-center rounded-full border transition-colors`,
      /** A whole card as one large pressable surface (18). */
      card: 'flex items-center rounded-card border transition-colors',
      /**
       * Text-only, no border and no background (85). Floor is WCAG 2.5.8 (AA)
       * 24 (`min-h-6`) — the 44 for coarse pointers comes from
       * `.touch-hit-expand` (zero layout shift), not from height. See the
       * removed `inline` axis below.
       */
      link: 'inline-flex min-h-6 items-center gap-1 rounded-chip transition-colors',
      /**
       * **Vertical** tile: icon above, label below.
       *
       * The third hole the 2026-08-03 normalisation found — all six shapes were
       * **horizontal**, leaving 5 vertical action tiles outside the system. The
       * inventory had counted "shape" along one axis only.
       */
      tile: 'flex flex-col items-center justify-start rounded-card border text-center transition-colors',
      /**
       * **Borderless inset** — segmented items, tabs, ghost buttons.
       *
       * **Why an eighth shape.** The rule against adding a seventh on instinct
       * demands **repeat count**, and the adoption ratchet ledger reported the
       * same hole four rounds running:
       *
       * | Round | What the ledger called it | Unmigrated |
       * |---|---|---:|
       * | settings sheet | borderless control inside a bordered container | 1 file · 3 repeats |
       * | two map widgets | segmented tabs | 3 |
       * | features | no borderless inset (ghost) shape | 9 |
       * | widgets | borderless segments/tabs | 6 |
       *
       * Four identical conclusions are evidence the shape **exists**, not a
       * preference. `chip`/`pill`/`card`/`tile` all require a border, so inside
       * an already-bordered container they become a box in a box; `link` has
       * zero inset, so a segment loses its hit area. This shape is the gap
       * between them.
       *
       * **Radius — `--chrome-radius-inner` is not a new value.** Five consumers
       * use `rounded-[var(--chrome-radius-inner)]`, and in `app/globals.css`
       * that token is an **alias of `var(--radius-chip)`** (6px). Moving to
       * `rounded-chip` therefore changes bytes and not pixels — no off-ramp
       * radius needed.
       *
       * **Size — `md` is the measured mode.** Inset distribution across the
       * remaining 12 segment/ghost controls: `px-2 py-1`/`text-label` 6 ·
       * `px-2.5 py-1`/`text-label` 2 · `px-2.5` + fixed 28px 5 · `px-3` family 3.
       * The single mode was placed exactly on `md`.
       */
      // TOUCH_FLOOR (2026-08-15, prescribed by the interaction seat, co-signed by
      // the design-systems seat): segments alone had no coarse 44 promotion, so
      // "one sheet, two specs" was reproducing. Their gap-px packing disqualifies
      // a phantom hit area (touch-hit-expand); real height is the only option.
      segment: `${TOUCH_FLOOR} atlas-touch-floor-wide inline-flex items-center justify-center rounded-chip text-center transition-colors`,
    },
    /**
     * Size — **the ramp decides the height; padding is chosen within it.**
     *
     * **2026-08-03 correction: a by-product of padding is not a ramp.** The
     * first version of this ramp emitted heights **nobody had chosen** — the sum
     * of padding, leading and border *was* the height, which measured out as
     * chip 24/30/34 and pill 20/22/30. **30, 34, 22 and 20 appear nowhere in
     * this app's height vocabulary** (24 · 28 · 32 · 36 · 40 · 44), and
     * `app/globals.css` **already had** `--control-h-{sm,md,lg}` (28/32/40) as
     * the single source. A value invented instead of found is not a system, it
     * is a second system.
     *
     * What followed was worse: when the new values collided with the 32px
     * contract, an exception axis (`fixedHeight`) was added instead of fixing
     * the values. The axis was a **symptom** of wrong values, not a needed axis
     * — fixing the values killed it (owner decision 2026-08-03,
     * `docs/DECISIONS.md`).
     *
     * **Second correction, same day: the restoration had stopped at chip and
     * pill.** A second inventory found the same class of defect in the other
     * shapes — segment/sm **22px** (below the WCAG 2.5.8 floor, 0 consumers),
     * row/lg **42px** (outside the vocabulary, 0 consumers), card/sm **30px**
     * (outside the vocabulary, 15 sites), card/md **34px** (accidentally
     * occupying the chrome-locked `--docs-header-tile-size`, 5 sites). All four
     * were "padding decided the height" by-products.
     *
     * Today's spec: **every combination of a single-row horizontal shape stands
     * on the ramp through an explicit floor (`min-h-*`)**. Where the floor
     * equals the natural height nothing moves, and the spec becomes a
     * declaration rather than an arithmetic residue:
     *
     * | Shape | xs | sm | md | lg |
     * |---|---:|---:|---:|---:|
     * | `chip`/`pill` | 24 | 24 | 32 | 32 — what `lg` grows is **type and horizontal inset**, not height (owner call 2026-08-03, 26 consumers) |
     * | `segment` | 24 | 24 | 24 | 32 |
     * | `row` | 28 | 28 | 36 | 44 |
     * | `card` | 32 | 32 | 36 | 40 |
     * | `icon` | 24 | 24 | 28 | 32 — square, so hard `h-*` |
     *
     * `xs` is **not a height step** — the 24 floor stays and only inset, type
     * and radius drop to the micro tier (it differs from `sm` on chips alone and
     * aliases `sm` elsewhere). No step below 24 exists because of the first row
     * of the ramp table: below the WCAG 2.5.8 floor is not a "smaller step", it
     * is out of spec.
     *
     * `link` floors at 24 (`min-h-6`, on the shape base) — reset 2026-08-04. The
     * former 44 (`min-h-11`) was a **factual error**: it cited WCAG 2.5.8 (AA,
     * 24×24) while carrying 2.5.5 (AAA)/HIG touch values, and 44 is
     * `--touch-target-min`, which the touch contract pins as the single source
     * for coarse pointers. Under coarse, 44 comes from `.touch-hit-expand`, and
     * eligibility to attach it (≥12px clearance to neighbouring targets) is the
     * consumer's — attaching it unconditionally in a dense row lets a later DOM
     * element steal the earlier one's tap. Per-site table:
     * `docs/DECISIONS.md` 2026-08-04 "link floor 24" (the 24px floor for links).
     * `tile` is a two-axis vertical surface whose content decides the height —
     * a different axis, not a ramp escape.
     *
     * `min-h-8` rather than a hard `h-8`: a hard height clips a wrapped chip and
     * hides content, while `min-h` stands a single-line chip at 32 and lets
     * overflowing content grow.
     *
     * The full ramp (24 · 28 · 32 · 34 · 36 · 40 · 44) and each step's owner
     * live in `docs/DESIGN-SYSTEM.md` "Control Height Ramp" (the control-height
     * ramp).
     *
     * **Type rides on size; separating them was rejected** (2026-08-04,
     * design-systems seat). Reference research (Carbon: size controls height
     * only; shadcn: type in the base) predicted that pulling type out of `size`
     * would free ≈56 sites, and the owner approved the direction — but opening
     * the 155 debt items **site by site** showed separation frees only **2–3**
     * on its own: most coupled sites also carry a rest-colour dialect (tint
     * fill, panel border, overlay background), a weight, a mono voice, an
     * off-ramp height or a permanent underline **stacked on top of each other**,
     * so unlocking type alone opens nothing. An axis with 2–3 consumers does not
     * get built — the same bar that killed `fixedHeight`. The Carbon shape (one
     * type across all sizes) also collides with the owner's call above that `lg`
     * grows type and inset, and would raise every chip/pill `sm` (caption)
     * without cause. Ledger: `docs/DECISIONS.md` 2026-08-04
     * "Type/Size Separation Rejected".
     */
    size: {
      /**
       * Micro tier — command tags, micro badges, kbd-class controls. **Differs
       * from `sm` on chips only** (inset `px-1.5`, caption, micro radius).
       * Height stays on the 24 floor (`min-h-6`): the ramp says below 24 is out
       * of spec, so this step opens inset, type and radius rather than height.
       * On other shapes it is an alias of `sm` (no inventing values with zero
       * consumers — the contract asserts the aliasing).
       *
       * Justification: "there is no step below sm" appears in the ratchet ledger
       * for **three consecutive rounds** (features 4 · remainder re-measurement
       * 14 · primitive round re-confirmation). Repeat count, not instinct.
       */
      xs: '',
      /** Ramp floor 24px — the WCAG 2.5.8 minimum target. `text-caption`/`px-2`. */
      sm: '',
      /** `--control-h-md` 32px — the measured mode. `px-2.5`/`text-label`. */
      md: '',
      /** The same 32px with type and inset one step up. `px-3`/`text-body`. */
      lg: '',
    },
    /**
     * Colour is **hierarchy**, not decoration. The charter fixes neutrals plus a
     * single indigo, so that is the whole range available here.
     */
    tone: {
      /** Default — tertiary text. The most common on screen. */
      default: 'text-[color:var(--color-text-tertiary)]',
      /** Further back — quaternary. The mode for icon controls. */
      muted: 'text-[color:var(--color-text-quaternary)]',
      /**
       * Between tertiary and primary — **a hole the 2026-08-03 normalisation
       * found.** Tones shipped as three steps while the settings sheet alone had
       * 7 `text-secondary` controls: shapes were inventoried, **tones were not**,
       * so those 7 stayed outside the system.
       */
      secondary: 'text-[color:var(--color-text-secondary)]',
      /** What must win right now — primary. Several on one screen means no hierarchy. */
      strong: 'text-[color:var(--color-text-primary)]',
      /**
       * Indigo accent — "the primary action on this screen". The second hole the
       * same normalisation found: with no matching tone, 15 controls sat outside
       * the system. This is the charter's **single indigo**, not a new hue.
       *
       * **Range — bare ground only** (2026-08-03, design-systems seat).
       * `--color-indigo-accent` (#7170ff) is the link/label indigo idiom used on
       * 99 lines app-wide, **but its licence ends at the darkest ground**:
       * measured composite contrast is canvas 5.18, panel 4.96, elevated 4.53,
       * while an indigo tint fill (`--color-indigo-a14`+, `line-a13`) or an
       * amber hint drops it to 3.5–4.4 and breaks WCAG 1.4.3 AA (4.5) — hover
       * (`a24`) is 4.13 even on canvas. Controls that carry a tint use
       * `accentOnTint` below. Gates:
       * `tests/contract/accent-ink-contrast.contract.test.ts` plus the eslint
       * pairing selector.
       */
      accent: 'text-[color:var(--color-indigo-accent)]',
      /**
       * **Indigo accent on a tint** — the ink for a "primary action" that
       * carries a fill or hover fill (indigo a08–a24, `line-a13`, amber hint).
       *
       * **Why it was split in two**: indigo ink has two solutions in this app,
       * the same grammar as the `scope` axis — one indigo, two grounds, two
       * answers. The marker indigo (#7170ff) breaks AA the moment a tint is laid
       * under it (26 of 29 inventoried sites measured below AA), while the text
       * token `--color-indigo-text-soft` (rgba 188,195,255,.92) stays at 6.46:1
       * or better on every surface composite in this app. The value is not new —
       * the studio and map panels already used it by hand; this registers it on
       * the ramp.
       *
       * The hue is the same single indigo, so the "primary action" meaning
       * survives; what is lost is saturation. In exchange no consumer has to
       * redo the contrast homework for its own ground.
       */
      accentOnTint: 'text-[color:var(--color-indigo-text-soft)]',
      /** The three signals the charter allows — warning · error · success. Do not extend. */
      warning: 'text-[color:var(--color-status-warning)]',
      danger: 'text-[color:var(--color-danger-text)]',
      /*
       * ⚠️ success alone is a **text-role token**, not a signal token
       * (2026-08-03, design-systems seat correction). The three had drifted
       * apart: danger used a text role (`--color-danger-text`) while success
       * emitted the signal colour (#32b97d), so any consumer wanting text on a
       * success tint (the pale mint a94) chose to stay off-ramp — measured
       * consumers **0**, the same bar that killed `fixedHeight`. Aligning the
       * value with the app's real idiom (a94) brought consumers back. With 0
       * prior consumers, this re-pointing changed 0 pixels and 0 colours.
       * warning keeps the signal token: its sole consumer (DependencyPicker) is
       * already correct on that value, and whether it should converge with the
       * amber text idiom (amber-source-a90) was deferred to the next verdict
       * together with an inventory (see the ratchet ledger).
       */
      success: 'text-[color:var(--color-success-text-a94)]',
      /**
       * **Foreground on a filled indigo** — the one primary action on a screen.
       *
       * **Why a tone emits a ground too.** Two rounds reported the same hole
       * independently (features 5 · widgets 6): *"when indigo is the background
       * the text is `text-white`, and none of the eight tones covers that."*
       * Ink alone forces consumers to keep writing `bg-…` and a weight through
       * `className` — passing shape through className, which makes the layer
       * pointless. Like "pressed" (`active: true`, which already emits
       * background + border + ink together), a fill is a state ink alone cannot
       * express, so the pair is emitted together.
       *
       * The weight is measured too: of the controls with an explicit weight over
       * a `--color-indigo-brand` ground, **15 were semibold 13 / medium 2**
       * (2026-08-03 inventory), so weight is part of this tone's identity and
       * the 2 exceptions were drift — normalised to semibold while migrating
       * (padding and leading decide the box, so height moved 0). **2026-08-05:
       * that semibold moved onto the ramp** — `font-semibold` (600) is a
       * Tailwind default step outside the `--font-weight-*` ramp, and this slot
       * is a button label rather than a heading, so `emphasis` (560), which is
       * also nearest to 600 (560 is −40, 650 is +50).
       *
       * **Hover: the prescription written here was wrong, and the right value is
       * now emitted** (2026-08-15, ledger entry 11). This slot used to tell
       * consumers to write `hover:bg-[color:var(--color-indigo-hover)]`, but
       * `--color-indigo-hover` (#828fff) lightens *ink and borders*. As a surface
       * under white ink it measures **2.87:1** — about half the 4.71 rest state,
       * far under AA (4.5) — and it is the exact pair
       * `tests/e2e/hover-contrast.spec.ts` plants as its known-failing case. No
       * consumer had followed it, so the next person would have been the first.
       *
       * `.claude/rules/design-gates.md` "Hover State Contrast"
       * had already settled the rule — **only filled buttons darken on hover**,
       * measured from four primary CTAs sitting at 3.17–4.41 while hovered — but
       * it was absent from the value layer, so **all 12 consumers hand-wrote the
       * same string** while `button.tsx`'s primary variant already had it: a
       * value mismatch between two value layers, not a question of pushing a
       * rule down. Unlike the three hover axes below this one is **not opt-in**,
       * because once white ink sits on an indigo surface, how that surface
       * hovers is a contrast contract the tone must keep
       * (`--color-indigo-brand` 4.70 → `-hover` 5.38).
       *
       * New hues: 0. Ground is the charter's single indigo, ink is neutral
       * (#fff), measured 4.71:1 — above WCAG AA.
       */
      onAccent:
        'bg-[color:var(--color-indigo-brand)] font-[var(--font-weight-emphasis)] text-[color:var(--color-text-on-accent)] hover:bg-[color:var(--color-indigo-brand-hover)]',
    },
    /**
     * **Which ink ramp it stands on.**
     *
     * **Why this axis exists** — two rounds reached the same conclusion
     * independently. This repo has **two** neutral text ramps with different
     * values:
     *
     * | Step | `--color-text-*` | `--topology-v2-panel-text-*` |
     * |---|---|---|
     * | primary | `#f7f8f8` | `#ececf0` |
     * | secondary | `#d0d6e0` | `#a3a3ac` |
     * | tertiary | `#8a8f98` | `#868690` |
     * | quaternary | `#82828a` | `#82828a` |
     *
     * Not a coincidence: the panel ramp's tertiary/quaternary were nudged by
     * **measuring contrast over the panel ground `#17171c`** (globals.css
     * comment: 4.02:1 → ≈4.9:1, ~2.5:1 → ~4.7:1). The two ramps are not two
     * colour systems but **one neutral ramp with two solutions over two
     * grounds**. (quaternary converged when the design-systems verdict of
     * 2026-08-03 raised the global from `#787c84` to `#82828a` — the same answer
     * to the same constraint, AA over a raised surface. Ledger:
     * `docs/DECISIONS.md`.) The ledger counted 11 sites in the features round
     * plus 8 in the widgets round = **19** structurally outside the value layer
     * for this reason.
     *
     * **Why not "let the consumer add the ink".** That puts colour in
     * `className`, the exact thing this file forbids, so migrating the 19 would
     * be the same as migrating nothing.
     *
     * **Why not redefine the CSS variables.** Overriding `--color-text-*` inside
     * the panel frees all 19 with no axis at all, but that panel holds far more
     * non-control consumers (headings, statistics, hint sentences) whose output
     * would change too — an unmeasured regression bought for free. An axis is
     * explicit, changes only the sites that opt in, and can be locked by contract.
     *
     * **What this axis cannot open.** The panel ramp has **no signal colours and
     * no indigo**, so `accent`/`warning`/`danger`/`success` emit the global
     * tokens regardless of `scope` — signals are decided by meaning, not ground.
     * The contract locks this.
     */
    scope: {
      /** Over the app-wide ground (`--color-canvas` family). The default. */
      app: '',
      /** Over the map panel (`--topology-v2-panel-surface`, `#17171c`). */
      panel: '',
    },
    /**
     * **Does it need to ellipsise.**
     *
     * **Why this axis exists** (measured 2026-08-03). All seven shapes are flex
     * (`inline-flex`/`flex`), so `text-overflow: ellipsis` does not apply. At
     * identical text and width, `inline-block` draws `…` while `inline-flex`
     * **hard-clips** (the glyph simply stops). Controls that must stay fully
     * legible when the width runs out — breadcrumbs, footprint rows, segmented
     * tab labels — were therefore left outside the value layer (map-view round 3
     * plus 5 segments).
     *
     * Adding the `truncate` utility does not fix it. **The display has to
     * change**, and that is the shape's job, not the consumer's.
     *
     * When on it becomes `block`, not `inline-block`: every measured consumer
     * sits as a flex child that must shrink alongside `min-w-0`/`flex-1`.
     */
    truncate: { true: 'block truncate', false: '' },
    /**
     * **Is it a stacked cell.** True when the control sits inside an
     * already-rounded container (`overflow-hidden rounded-*`) stacked
     * vertically and separated by dividers — it must not emit its own radius.
     *
     * **Why an axis and not a ninth shape** (2026-08-06). Using `row` as is
     * brings `rounded-chip` along, so **the hover background rounds piecewise
     * and gaps appear between cells** — the container already owns the corners
     * and the inside claims them again. A ninth shape, meanwhile, would be a
     * twin of `row` with **identical inset, alignment and touch floor**: the
     * eight shapes are justified by a measured population, whereas this is a
     * **placement condition** within the same population.
     *
     * Inventory, **9 sites**: `DesktopVaultWelcome` ×4 · `ProjectForm` ·
     * `DocsSidebarBody` · `CommitDetail` · `SearchPalette` ·
     * `TopologyIndexTreeRow`.
     */
    stacked: { false: '', true: '' },
    /** Pressed state — must be **paired** with `aria-pressed` / `aria-selected`. */
    active: { true: '', false: '' },
    /*
     * ── **The three hover axes** (2026-08-15, ledger entry 11 — added after an
     * inventory of 752 declarations)
     *
     * This file long stated that hover belonged to the consumer. What that
     * discipline produced: **752 hover declarations across 511 sites and 129
     * files**, with three sites using **three different inks** for the single
     * role "hovered inactive segment". It was a missing piece, not a discipline
     * — `DISABLED` (2026-08-03) and `FOCUS` (08-05) made the same discovery
     * twice already; this is the third.
     *
     * **Why three axes rather than one.** Of the 309 calls with hover: **text
     * only 117 · background only 90 · text+border 61 · text+background 31 ·
     * border only 6 · all three 4**. **96** sites need two properties together,
     * which a single enum cannot express. These are three independent CSS
     * properties, not axis proliferation, and each carries only the measured
     * majority (four options in total).
     *
     * **All three are opt-in.** Defaulting them on would silently change sites
     * with no hover today — **30 sites** counting borders alone — which is a
     * global visual change, not an axis addition.
     *
     * **None of the three emit under `active`.** If "about to be selected" and
     * "already selected" speak the same language, the user cannot tell what they
     * picked; measured, the selection border weakened from **2.09 to 1.48** under
     * hover where they overlapped (ledger entry 10 fixed two such sites by hand,
     * this axis absorbs that guard structurally). On the disabled side
     * `CONTROL_DISABLED_CLASS` already neutralises it.
     *
     * Values come **entirely from existing ramps** — 0 new tokens, 0 changes to
     * `globals.css`.
     */
    /**
     * Hover ink. Of 331 measured declarations the top 4 (app·panel ×
     * primary·secondary) account for **95.2%**, and those 4 are two steps of the
     * two ramps `scope` already carries. So this axis picks **only the
     * brightness step** and `scope` decides the value.
     */
    hoverInk: { none: '', strong: '', secondary: '' },
    /**
     * Hover surface — raising "what is under the cursor" by one step. Counting
     * the 216 measured declarations by role, this neutral lift is **57%**, and
     * the branching (row vs part, app vs panel) is already carried by `shape`
     * and `scope`. Intensifying an indigo tint is **not an axis**: 16 variants
     * with no majority, and a tint step is a hierarchy judgement rather than a
     * value.
     */
    hoverSurface: { none: '', lift: '' },
    /**
     * Hover border — the edge becoming crisper. There is one option because of
     * measurement: the indigo family is more common at 70%, but it is **spread
     * over 13 steps whose neighbours are indistinguishable** (composite contrast
     * 1.0–1.2:1 — this repo has already rejected 1.14 as "not separable by
     * brightness"). Thirteen steps nobody can tell apart are noise, not
     * information, so the value layer has nothing to choose from.
     */
    hoverBorder: { none: '', strong: '' },
    /*
     * ── **Removed axis: `fixedHeight`** (owner decision, 2026-08-03)
     *
     * An axis here used to pin the height. Its justification was that the chip
     * ramp emitted 30/34 while the contract demanded 32, so "no combination
     * avoids a leftover 2px". That diagnosis was one level too shallow — the
     * leftover 2px was **a signal that the ramp values were wrong**, not that an
     * axis was needed. Converging the values on 32 left the axis with nothing to
     * do, and 18 of its 19 consumers were absorbed by the defaults with **zero
     * pixel movement**.
     *
     * Before standing a height axis here again, ask: **is the value already on
     * the ramp?** If it is, that is `size`, not an axis.
     */
    /*
     * ── **Removed axis: `inline`** (2026-08-04, design-systems seat —
     * `docs/DECISIONS.md`)
     *
     * A boolean exempted "inside a sentence" from `min-h-11`. It was wrong twice
     * over: ① the value it exempted (44) was never the 2.5.8 value (see the
     * correction above); ② the three things that decide "inside a sentence" —
     * where the sibling text comes from (markdown, i18n), the used display
     * (decided by a parent in another file), and reflow — all live outside the
     * opening tag, so it is **not statically decidable**. Measured: of 14
     * consumers only 3 were genuinely inside a sentence or caption row, while
     * the other 11 used it as a general "do not grow my box" escape hatch, and
     * no check could see the 16–17px sites among them. Once the floor stood at
     * 24 the escape hatch had nothing to do — the same death as `fixedHeight`.
     *
     * The inline exemption (WCAG 2.5.8 "in a sentence") is now decided by a
     * runtime instrument: the fine-pointer audit in
     * `tests/e2e/touch-target-contract.spec.ts` judges by computed display and
     * sibling text. Prose links are not controls in the first place — that is
     * the `.prose-link` contract's territory (`prose-link.contract.test.ts`).
     */
  },
  compoundVariants: [
    /*
     * ── **Hover emission** (2026-08-15, ledger entry 11). The axes pick only
     * which step; the actual value is decided here where they meet `scope` and
     * `shape`. `active: false` is half of every key — what is selected takes no
     * hover (the 2.09 → 1.48 measurement in the axis comment above).
     */
    { hoverInk: 'strong', scope: 'app', active: false, class: 'hover:text-[color:var(--color-text-primary)]' },
    { hoverInk: 'secondary', scope: 'app', active: false, class: 'hover:text-[color:var(--color-text-secondary)]' },
    { hoverInk: 'strong', scope: 'panel', active: false, class: 'hover:text-[color:var(--topology-v2-panel-text-primary)]' },
    { hoverInk: 'secondary', scope: 'panel', active: false, class: 'hover:text-[color:var(--topology-v2-panel-text-secondary)]' },

    /*
     * Surface — "one step brighter". Measurement decided the branching: a **row**
     * whose rest state is transparent gets `overlay-1`; a **part** whose rest
     * state already sits one step up gets `overlay-2` (the next slot on the
     * ramp); panel scope gets that scope's row-hover token.
     */
    { hoverSurface: 'lift', shape: 'row', scope: 'app', active: false, class: 'hover:bg-[color:var(--color-overlay-1)]' },
    { hoverSurface: 'lift', shape: 'chip', scope: 'app', active: false, class: 'hover:bg-[color:var(--color-overlay-2)]' },
    { hoverSurface: 'lift', shape: 'pill', scope: 'app', active: false, class: 'hover:bg-[color:var(--color-overlay-2)]' },
    { hoverSurface: 'lift', shape: 'icon', scope: 'app', active: false, class: 'hover:bg-[color:var(--color-overlay-2)]' },
    { hoverSurface: 'lift', shape: 'segment', scope: 'app', active: false, class: 'hover:bg-[color:var(--color-overlay-2)]' },
    { hoverSurface: 'lift', scope: 'panel', active: false, class: 'hover:bg-[color:var(--topology-v2-panel-row-hover)]' },

    // Border — the edge sharpens. Exactly one option (see "13 steps are noise" above).
    { hoverBorder: 'strong', active: false, class: 'hover:border-[color:var(--color-border-strong)]' },

    /*
     * ── A row's radius is **decided by its placement** (2026-08-06). A
     * free-standing row owns its corners (`rounded-chip`); a cell stacked inside
     * an already-rounded container does not — rounding the inside makes the
     * hover background round piecewise and opens gaps between cells.
     */
    { shape: 'row', stacked: false, class: 'rounded-chip' },
    // ── Size: "large" means something different per shape. Give a square `px` and it stops being square.
    /*
     * Chip — 24 / 32 / 32. `md` has a natural height of 30 that `min-h-8` lifts
     * to 32; `lg` drops `py` one step (1.5 → 1) to reach a natural 30 and stands
     * on the same 32. `min-h` only ever raises, so keeping `py-1.5` would leave 34.
     *
     * Chip radius — micro (4px) on `xs`, chip (6px) elsewhere. Consumer bytes are
     * the evidence: every inventoried micro tag wore `rounded` (4px), and no site
     * moved a radius during the migration.
     */
    { shape: 'chip', size: 'xs', class: 'rounded-micro min-h-6 gap-1 px-1.5 py-0.5 text-caption' },
    { shape: 'chip', size: ['sm', 'md', 'lg'], class: 'rounded-chip' },
    { shape: 'chip', size: 'sm', class: 'min-h-6 px-2 py-1 text-caption' },
    { shape: 'chip', size: 'md', class: 'min-h-8 px-2.5 py-1.5 text-label' },
    { shape: 'chip', size: 'lg', class: 'min-h-8 px-3 py-1 text-body' },
    { shape: 'icon', size: ['xs', 'sm'], class: 'h-6 w-6' },
    { shape: 'icon', size: 'md', class: 'h-7 w-7' },
    { shape: 'icon', size: 'lg', class: 'h-8 w-8' },
    /*
     * Row — 28 / 36 / 44. All three already had that natural height (leading +
     * padding), so the floors move 0 pixels. `lg` is the exception: its natural
     * 42 is not in the vocabulary, so it is lifted to `min-h-11`
     * (`--touch-target-min` = `--control-row-h` 44). With 0 consumers that move
     * is also 0 — the step was put on the ramp before anything could adopt 42.
     */
    { shape: 'row', size: ['xs', 'sm'], class: 'min-h-7 gap-1.5 px-2 py-1.5 text-label' },
    { shape: 'row', size: 'md', class: 'min-h-9 gap-2 px-2.5 py-2 text-body' },
    { shape: 'row', size: 'lg', class: 'min-h-11 gap-2.5 px-3 py-2.5 text-body-lg' },
    /*
     * Pill — the same 24 / 32 / 32. **This is where measurement diverged from
     * the owner's hypothesis.** A pill's old natural heights were not the chip's
     * 24/30/34 but **20 / 22 / 30** (because of `py-0.5`). So `sm` has to be
     * raised 20 → 24 to reach the ramp floor and the WCAG 2.5.8 minimum target
     * (24×24), and `md` moves 22 → 32, a 10px shift. The real movement for the 9
     * `sm` and 3 `md` consumers is tabulated in the PR body — it contradicted the
     * "within ±2px" expectation, so it is not hidden.
     */
    { shape: 'pill', size: ['xs', 'sm'], class: 'min-h-6 px-2 py-1 text-caption' },
    { shape: 'pill', size: 'md', class: 'min-h-8 px-2.5 py-0.5 text-label' },
    { shape: 'pill', size: 'lg', class: 'min-h-8 px-3 py-1 text-body' },
    /*
     * Card — 32 / 36 / 40 (+4 steps, all inside the height vocabulary). Found by
     * the second inventory: natural heights were sm 30 and md 34, where 30 is
     * outside the vocabulary and 34 was an accidental occupation of the
     * chrome-locked `--docs-header-tile-size`. Floors stand them at 32/36 — only
     * single-line cards move (+2px, table in the PR); multi-line cards already
     * exceed the floor, so they move 0. `lg` keeps its natural 40 =
     * `--control-h-lg`.
     */
    { shape: 'card', size: ['xs', 'sm'], class: 'min-h-8 gap-1.5 px-2.5 py-1.5 text-label' },
    { shape: 'card', size: 'md', class: 'min-h-9 gap-1.5 px-3 py-1.5 text-body' },
    { shape: 'card', size: 'lg', class: 'min-h-10 gap-2 px-3.5 py-2 text-body-lg' },
    { shape: 'tile', size: ['xs', 'sm'], class: 'gap-1.5 px-2 py-2 text-caption' },
    { shape: 'tile', size: 'md', class: 'gap-2 px-2 py-2.5 text-label' },
    { shape: 'tile', size: 'lg', class: 'gap-2 px-3 py-3 text-body' },
    { shape: 'link', size: ['xs', 'sm'], class: 'text-caption' },
    { shape: 'link', size: 'md', class: 'text-label' },
    { shape: 'link', size: 'lg', class: 'text-body' },
    // Segment: `md` is the measured mode (`px-2 py-1`/`text-label`, 24px), so 6
    // consumers arrive with zero pixel change. `lg` is 32px. Without a border the
    // natural height can fall through the floor — `min-h-6` stands it on the
    // WCAG 2.5.8 floor (24).
    //
    // `sm` was redefined 2026-08-03. The old value (px-2 py-1 caption) went a
    // whole round with 0 consumers, while the measured consumers — micro toggles
    // with a `px-1` inset (the footprint trail, the notification bell, panel
    // export; 4 in total) — had a mode of `px-1 py-0.5`/`text-label` (the same
    // type as md, one inset step tighter). Keeping the old caption `sm` would put
    // `sm` below `xs`. A value with 0 consumers gets fixed, not preserved — the
    // same bar as the correction above.
    { shape: 'segment', size: ['xs', 'sm'], class: 'min-h-6 gap-1 px-1 py-0.5 text-label' },
    { shape: 'segment', size: 'md', class: 'min-h-6 px-2 py-1 text-label' },
    { shape: 'segment', size: 'lg', class: 'min-h-8 px-3 py-1.5 text-body' },

    // ── Default border colour for the bordered shapes. `link`/`row`/`icon` have none.
    //
    // Why chip/pill moved from `--color-divider` (0.08) to `--color-border-soft`
    // (0.06) (2026-08-03, design-systems seat): across the inventory of
    // hand-written borders on chip-radius elements it was **border-soft /
    // chrome-border 74 vs divider 18** (4:1). The ramp default was the minority
    // (0.08), so every chip migration silently darkened its border one step —
    // this corrects a default that was set without finding the majority.
    // card/tile were border-soft from the start, so all four shapes now share
    // one default.
    { shape: 'chip', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'pill', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'card', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'tile', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'tile', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },

    // ── Pressed: expressed with **the single indigo** only. A new hue violates the charter.
    { shape: 'chip', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'pill', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'card', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'row', active: true, class: 'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]' },
    { shape: 'icon', active: true, class: 'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]' },
    { shape: 'link', active: true, class: 'text-[color:var(--color-text-primary)]' },
    // Pressed borderless inset — inside a box, "this one, now" is said with an
    // indigo tint alone. All 12 measured consumers used the `--color-indigo-a16`
    // or `a26` tint, and 0 used a border.
    { shape: 'segment', active: true, class: 'bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },

    /*
     * ── The second neutral ramp. Its values were nudged by measuring contrast
     * over the panel ground (#17171c), so it is not a new colour system but **the
     * same neutral ramp's second solution**. The three signals and indigo are not
     * here — colours decided by meaning do not depend on the ground.
     */
    { scope: 'panel', tone: 'default', class: 'text-[color:var(--topology-v2-panel-text-tertiary)]' },
    /*
     * The panel compound for `muted` is **deliberately absent** (removed
     * 2026-08-03). Both ramps' quaternary converged on `#82828a` (global raise,
     * `docs/DECISIONS.md`), which made the remap a no-op branch emitting the same
     * value — as the contract test prescribed, one tone is enough for that step.
     * Consumers may keep writing `tone: 'muted', scope: 'panel'` (the default
     * muted emits the same value, 0 pixel movement). If the two values ever
     * diverge again, the contract test's convergence assertion turns red and
     * tells you to restore this compound.
     */
    { scope: 'panel', tone: 'secondary', class: 'text-[color:var(--topology-v2-panel-text-secondary)]' },
    { scope: 'panel', tone: 'strong', class: 'text-[color:var(--topology-v2-panel-text-primary)]' },
    // Pressed inside a panel also uses panel ink — otherwise the ramp jumps for
    // exactly the pressed moment.
    { scope: 'panel', shape: 'segment', active: true, class: 'text-[color:var(--topology-v2-panel-text-primary)]' },
    { scope: 'panel', shape: 'row', active: true, class: 'text-[color:var(--topology-v2-panel-text-primary)]' },
    { scope: 'panel', shape: 'link', active: true, class: 'text-[color:var(--topology-v2-panel-text-primary)]' },

    /*
     * ── A filled tone clears the border. It must sit here for ordering reasons:
     * **after** the `border-[…divider]` compounds above, so it wins in
     * tailwind-merge.
     */
    { tone: 'onAccent', class: 'border-transparent' },
  ],
  defaultVariants: {
    shape: 'chip',
    size: 'md',
    tone: 'default',
    scope: 'app',
    stacked: false,
    active: false,
    truncate: false,
    hoverInk: 'none',
    hoverSurface: 'none',
    hoverBorder: 'none',
  },
});

export type ControlShape = NonNullable<VariantProps<typeof control>['shape']>;
export type ControlSize = NonNullable<VariantProps<typeof control>['size']>;
export type ControlTone = NonNullable<VariantProps<typeof control>['tone']>;
/**
 * The three hover axes — **the primitive layer passes them straight through**
 * (2026-08-16).
 *
 * They had been in the value layer since 2026-08-15, but `Chip`, `IconButton`
 * and `RowButton` had no prop to receive them. So every site needing hover
 * hand-wrote it through `className` (measured: 17 of `RowButton`'s 29
 * consumers), which is exactly the shape the ratchet exists to stop —
 * **a value the primitives cannot reach is a value that is not there.**
 */
export type ControlHoverInk = NonNullable<VariantProps<typeof control>['hoverInk']>;
export type ControlHoverSurface = NonNullable<VariantProps<typeof control>['hoverSurface']>;
export type ControlHoverBorder = NonNullable<VariantProps<typeof control>['hoverBorder']>;

export interface ControlClassOptions extends VariantProps<typeof control> {
  /**
   * Only what is true of **this one site** — placement, width, order. Putting
   * shape, size or colour here makes this function pointless; the answer then is
   * to add a step to the ramp.
   */
  className?: string;
}

/**
 * Returns the className for a pressable element.
 *
 * ```tsx
 * <button type="button" className={controlClass({ shape: 'chip' })}>Domain</button>
 * <button type="button" aria-label="Close" className={controlClass({ shape: 'icon', size: 'sm' })}>
 * ```
 */
export function controlClass({ className, ...variants }: ControlClassOptions = {}): string {
  return cn(control(variants), className);
}

/* ════════════════════════════════════════════════════════════════════
 * ## Form fields — **the second cva** (2026-08-06, design council: the
 * design-systems and hierarchy seats)
 * ════════════════════════════════════════════════════════════════════
 *
 * ### Why not a ninth `shape`
 *
 * All three reasons are this file's own rules:
 *
 * 1. **The eight shapes rest on an inventory of 419 `<button>`s.** The header
 *    pins that adding a seventh requires re-running the inventory, and fields
 *    are a **different population** (63 form controls) on different axes.
 * 2. **Dead combinations are a second system.** Effectively none of the 10
 *    tones mean anything for a field: field ink is fixed at primary and a
 *    quaternary placeholder is the identity, so `accent`, `onAccent` and
 *    `success` fields have no consumers. The shared base's `FOCUS`
 *    (`ring-inset`) is likewise the idiom of a *pressable* thing, not of a field
 *    (which swaps its border).
 * 3. **Combination arithmetic.** The inventory in
 *    `control-class.contract.test.ts` is currently 2,560 cases. A ninth shape
 *    adds **+320**, mostly dead. A separate cva totals **16** (frame 2 × size 4
 *    × multiline 2).
 *
 * ### Why three axes — the hierarchy seat drew the same line independently
 *
 * That seat opened the real screens and split forms into three: **recording**
 * (the value lands on disk — the eye goes to the input), **look-up** (arriving
 * at something that exists — the eye goes to the result), and **staging**
 * (writing, in place, the text that will appear on a card).
 *
 * The first two are the `frame` axis, and they must not be merged: make
 * recording transparent and the form disappears; make look-up heavy and **the
 * input beats the result** (all 10 look-up sites are places where a tree, map or
 * list is the attention winner).
 *
 * **Staging is outside this spec** — the studio's name input (23px) carries the
 * type of the **card being created**, not of the form, so its size carries
 * information rather than decoration (Mackinlay expressiveness), and boxing it
 * erases that. Recorded here so **the next person does not fold it in**.
 *
 * ### Zero new tokens
 *
 * Everything reuses existing ramps. Heights are **1:1** with
 * `--control-h-{sm,md,lg}` (28/32/40), and the contract reads that 1:1 out of
 * the CSS rather than asking "is it in the vocabulary" — a probe proved why:
 * "single-line md as `h-9` (36)" passed a vocabulary check **green**, because 36
 * is also in the height vocabulary.
 */
/**
 * ⚠️ **Type is paired with size, not fixed in the base** — corrected by looking
 * at the screen.
 *
 * The first version emitted a single `text-body` (12.5px). Placing `/project/new`
 * before and after side by side showed a **regression in the primary form**: its
 * inputs had been 14px, and dropping to 12.5px put **the value the user typed at
 * nearly the same rank as the label the app wrote** (11px). In a form, the user's
 * own value must be the most legible thing.
 *
 * So it follows the ramp's own rule that a size step carries its own leading:
 * **wide steps (md·lg) get `text-body-lg` (14), tight steps (xs·sm) get
 * `text-body` (12.5).** A tight step is a 28px box, where 14px would leave no
 * vertical room.
 */
const fieldBase =
  'text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] transition-colors';

const field = cva(`${fieldBase} ${DISABLED}`, {
  variants: {
    /**
     * **Who draws the box.**
     *
     * `bare` **must not** emit dimensions, border, radius or a touch floor — the
     * parent already drew the box, and emitting one here pushes against it from
     * the inside.
     */
    frame: {
      /*
       * **Emits no width.** `w-full` was tried and removed: consumers differ
       * (`ProjectQuickEditPanel` and `WebManualConnectPanel` want `w-full`,
       * while `CreateNodeForm` gets its width from a parent grid). A base that
       * emits width makes the latter **not a 0px migration**.
       */
      boxed:
        'atlas-touch-floor border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] focus-visible:border-[color:var(--color-indigo-a46)] focus-visible:outline-none',
      bare: 'bg-transparent text-body focus:outline-none',
    },
    /** Single line or growing. **Not a separate shape** — border, background, radius, focus and placeholder are identical; only the dimension grammar differs. */
    multiline: { false: '', true: 'resize-none' },
    size: { xs: '', sm: '', md: '', lg: '' },
  },
  compoundVariants: [
    /*
     * Heights are 1:1 with `--control-h-*`: sm=28 · md=32 · lg=40. `xs` is not a
     * height step but a tier that **only drops the radius one level** — the same
     * grammar `chip`'s `xs` uses. Consumers: 3 sites in `DocFrontmatterBlock`.
     */
    { frame: 'boxed', multiline: false, size: 'xs', class: 'h-7 rounded-micro px-2 text-body' },
    { frame: 'boxed', multiline: false, size: 'sm', class: 'h-7 rounded-chip px-2 text-body' },
    { frame: 'boxed', multiline: false, size: 'md', class: 'h-8 rounded-chip px-2.5 text-body-lg' },
    { frame: 'boxed', multiline: false, size: 'lg', class: 'h-10 rounded-chip px-3 text-body-lg' },
    { frame: 'boxed', multiline: true, size: 'xs', class: 'min-h-7 rounded-micro px-2 py-1.5 text-body' },
    { frame: 'boxed', multiline: true, size: 'sm', class: 'min-h-7 rounded-chip px-2 py-1.5 text-body' },
    { frame: 'boxed', multiline: true, size: 'md', class: 'min-h-8 rounded-chip px-2.5 py-1.5 text-body-lg' },
    { frame: 'boxed', multiline: true, size: 'lg', class: 'min-h-10 rounded-chip px-3 py-2 text-body-lg' },
  ],
  defaultVariants: { frame: 'boxed', multiline: false, size: 'md' },
});

export type FieldFrame = NonNullable<VariantProps<typeof field>['frame']>;
export type FieldSize = NonNullable<VariantProps<typeof field>['size']>;

export interface FieldClassOptions extends VariantProps<typeof field> {
  /** Only what is true of **this one field** — width (`w-full`, `flex-1`) and placement. Spec values do not go here. */
  className?: string;
}

/**
 * Returns the className for a form field.
 *
 * ```tsx
 * <input className={fieldClass({ size: 'lg' })} />                       // recording
 * <input className={fieldClass({ frame: 'bare', className: 'flex-1' })} /> // look-up
 * <textarea className={fieldClass({ multiline: true, size: 'lg' })} />
 * ```
 *
 * **Emits no width** — only `boxed` emits `w-full`; `bare` rides its parent's
 * flex layout, so `flex-1`/`min-w-0` belong to the site. Same boundary
 * `controlClass` above draws between spec and placement.
 */
export function fieldClass({ className, ...variants }: FieldClassOptions = {}): string {
  return cn(field(variants), className);
}

/**
 * The spec for a field's name (label) — **migrating the whole form inventory
 * revealed three kinds** (2026-08-06).
 *
 * | Kind | What | Has a spec |
 * |---|---|---|
 * | **Name text** | the words that call the field ("Name", "Category") | ✅ this function |
 * | **Whole pressable row** | a row wrapping a checkbox, where clicking the label toggles it | ✅ this function (`row`) |
 * | **Layout-only wrapper** | `block`, `flex flex-col gap-1` — placement only | ❌ not a spec |
 *
 * The third kind stays out: putting type and colour on a `<label>` that only
 * positions things makes it **compete with the real name text inside it**.
 *
 * **Why the ink is `secondary`** — a value the hierarchy seat's measurement
 * overturned. The field labels on `/project/new` were `text-caption` (9.5px) and
 * quaternary while **the footnote right below them was 11px**: the field's name
 * was one step smaller than its own footnote. So the user reads the 14px
 * placeholder before the label, and that guidance disappears the moment they
 * start typing — the exact failure NN/g's placeholder research describes.
 *
 * The same class of defect as the settings sheet on 2026-08-02: dimensions from
 * a subordinate slot carried up into a primary role. Spec: **the name is
 * `text-label` (11) or larger, and its ink is brighter than the footnote's
 * (quaternary).**
 */
const fieldLabelVariants = cva('text-label text-[color:var(--color-text-secondary)]', {
  variants: {
    /**
     * Is the whole row pressable. Wrapping a checkbox makes **the label itself
     * the target** (WCAG 2.5.8), so it carries both the 24px floor and the touch
     * floor.
     */
    row: {
      false: '',
      true: `${TOUCH_FLOOR} flex min-h-6 cursor-pointer items-center gap-2`,
    },
  },
  defaultVariants: { row: false },
});

export interface FieldLabelOptions extends VariantProps<typeof fieldLabelVariants> {
  /** Only what is true of this one label — placement and width. Type and colour do not go here. */
  className?: string;
}

/**
 * Returns the className for a field's name.
 *
 * ```tsx
 * <label htmlFor={id} className={fieldLabel()}>Name</label>
 * <label className={fieldLabel({ row: true })}><input type="checkbox" />Mark as hub</label>
 * ```
 */
export function fieldLabel({ className, ...variants }: FieldLabelOptions = {}): string {
  return cn(fieldLabelVariants(variants), className);
}
