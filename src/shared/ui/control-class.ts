import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/cn';

/**
 * Single source of class strings for pressable controls: values live here, while behaviour
 * (`type`, accessible name) is a component or lint concern. New controls are held by
 * `tests/contract/control-adoption-ratchet.contract.test.ts`.
 */

/**
 * What cannot be pressed must not look pressable. Exported so hand-rolled controls compose the
 * whole set. `disabledAffordanceSelectors` in `eslint.config.mjs` blocks other opacities.
 */
export const CONTROL_DISABLED_CLASS =
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:border-inherit disabled:hover:bg-inherit disabled:hover:text-inherit';
const DISABLED = CONTROL_DISABLED_CLASS;

export const CONTROL_TRANSITION = 'transition-[color,background-color,border-color,box-shadow,translate]';

export const CONTROL_PRESS_TRAVEL =
  'active:translate-y-px motion-reduce:active:translate-none disabled:active:translate-none';

/**
 * Keyboard focus ring. `ring-inset` because an outer ring overlaps neighbours in dense rows, and
 * an inset ring changes the box by zero pixels.
 */
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

/**
 * Raises a control to 44px under `pointer: coarse` only. Real height rather than
 * `touch-hit-expand`, which would let hit areas overlap. The rule sits outside the cascade layers
 * in `app/globals.css`, since inside a layer `min-h-8` from utilities wins.
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
      chip: `${TOUCH_FLOOR} inline-flex items-center gap-1.5 border ${CONTROL_TRANSITION} ${CONTROL_PRESS_TRAVEL}`,
      /**
       * Square icon control, so an accessible name is required. `touch-hit-expand` widens the hit area
       * under `pointer: coarse` through a pseudo-element without changing the visible box.
       */
      icon: `touch-hit-expand inline-flex shrink-0 items-center justify-center rounded-chip ${CONTROL_TRANSITION} ${CONTROL_PRESS_TRAVEL}`,
      /**
       * A whole list row that is pressable; left alignment is its identity (39).
       *
       * ⚠️ `rounded-chip` was **missing at first**, so normalised list rows drew
       * a square hover background (radius 6 → 0). Defining a shape without
       * giving it a radius caused it; measurement caught it.
       */
      row: `${TOUCH_FLOOR} flex w-full items-center text-left ${CONTROL_TRANSITION}`,
      /** Fully rounded control carrying a state or a count (32). */
      pill: `${TOUCH_FLOOR} inline-flex items-center rounded-full border ${CONTROL_TRANSITION} ${CONTROL_PRESS_TRAVEL}`,
      /** A whole card as one large pressable surface (18). */
      card: `flex items-center rounded-card border ${CONTROL_TRANSITION}`,
      /**
       * Text-only, no border and no background (85). Floor is WCAG 2.5.8 (AA)
       * 24 (`min-h-6`) — the 44 for coarse pointers comes from
       * `.touch-hit-expand` (zero layout shift), not from height. See the
       * removed `inline` axis below.
       */
      link: `inline-flex min-h-6 items-center gap-1 rounded-chip ${CONTROL_TRANSITION}`,
      tile: `flex flex-col items-center justify-start rounded-card border text-center ${CONTROL_TRANSITION} ${CONTROL_PRESS_TRAVEL}`,
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
      // Segments use `TOUCH_FLOOR`: their gap-px packing rules out `touch-hit-expand`, so real height is
      // the only option.
      segment: `${TOUCH_FLOOR} atlas-touch-floor-wide inline-flex items-center justify-center rounded-chip text-center ${CONTROL_TRANSITION}`,
    },
    /**
     * The ramp decides the height; padding is chosen within it. Heights stay on the control height
     * vocabulary (24, 28, 32, 36, 40, 44; `docs/DESIGN-SYSTEM.md` "Control Height Ramp"). `min-h-*`
     * rather than hard `h-*` so wrapped content grows instead of clipping.
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
      secondary: 'text-[color:var(--color-text-secondary)]',
      /** What must win right now — primary. Several on one screen means no hierarchy. */
      strong: 'text-[color:var(--color-text-primary)]',
      /**
       * Indigo accent for bare ground only: `--color-indigo-accent` falls below AA 4.5 over an indigo
       * tint or amber hint. Controls carrying a tint use `accentOnTint`. Gate:
       * `tests/contract/accent-ink-contrast.contract.test.ts`.
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
      /* `success` is a text-role token, like `danger`, so it reads on the pale success tint. */
      success: 'text-[color:var(--color-success-text-a94)]',
      /**
       * Foreground on a filled indigo, emitted with its ground and hover so consumers do not pass shape
       * through `className`. Only filled buttons darken on hover (`.claude/rules/design-gates.md`);
       * `--color-indigo-hover` lightens ink and would drop white ink below AA.
       */
      onAccent:
        'bg-[color:var(--color-indigo-brand)] font-[var(--font-weight-emphasis)] text-[color:var(--color-text-on-accent)] hover:bg-[color:var(--color-indigo-brand-hover)]',
    },
    /**
     * Which neutral ink ramp the control stands on: `--color-text-*` over the app ground,
     * `--map-panel-text-*` over the panel ground. Signal colours ignore `scope`; the contract locks
     * this.
     */
    scope: {
      /** Over the app-wide ground (`--color-canvas` family). The default. */
      app: '',
      /** Over the map panel (`--map-panel-surface`, `#17171c`). */
      panel: '',
    },
    /**
     * Needs ellipsis: the shapes are flex, where `text-overflow: ellipsis` does not apply and text
     * hard-clips. When on, the control becomes `block` so it shrinks alongside `min-w-0`/`flex-1`.
     */
    truncate: { true: 'block truncate', false: '' },
    /**
     * True when the control sits inside an already-rounded container stacked with dividers; it must
     * not emit its own radius, or hover backgrounds round piecewise and open gaps.
     */
    stacked: { false: '', true: '' },
    /** Pressed state — must be **paired** with `aria-pressed` / `aria-selected`. */
    active: { true: '', false: '' },
    /*
     * The three hover axes are opt-in and never emit under `active`, so selected and about-to-be-
     * selected do not look alike. Values come from existing ramps.
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
  },
  compoundVariants: [
    /* `active: false` is half of every key: what is selected takes no hover. */
    { hoverInk: 'strong', scope: 'app', active: false, class: 'hover:text-[color:var(--color-text-primary)]' },
    { hoverInk: 'secondary', scope: 'app', active: false, class: 'hover:text-[color:var(--color-text-secondary)]' },
    { hoverInk: 'strong', scope: 'panel', active: false, class: 'hover:text-[color:var(--map-panel-text-primary)]' },
    { hoverInk: 'secondary', scope: 'panel', active: false, class: 'hover:text-[color:var(--map-panel-text-secondary)]' },

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
    { hoverSurface: 'lift', scope: 'panel', active: false, class: 'hover:bg-[color:var(--map-panel-row-hover)]' },

    // Border — the edge sharpens. Exactly one option (see "13 steps are noise" above).
    { hoverBorder: 'strong', active: false, class: 'hover:border-[color:var(--color-border-strong)]' },

    /*
     * A free-standing row owns its corners; a cell stacked inside a rounded container does not, or
     * hover backgrounds round piecewise and open gaps.
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
     * (44, `--touch-target-min`). With 0 consumers that move
     * is also 0 — the step was put on the ramp before anything could adopt 42.
     */
    { shape: 'row', size: ['xs', 'sm'], class: 'min-h-7 gap-1.5 px-2 py-1.5 text-label' },
    { shape: 'row', size: 'md', class: 'min-h-9 gap-2 px-2.5 py-2 text-body' },
    { shape: 'row', size: 'lg', class: 'min-h-11 gap-2.5 px-3 py-2.5 text-body-lg' },
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
    // Without a border the natural height can fall through the floor; `min-h-6` stands it on the WCAG
    // 2.5.8 floor (24).
    { shape: 'segment', size: ['xs', 'sm'], class: 'min-h-6 gap-1 px-1 py-0.5 text-label' },
    { shape: 'segment', size: 'md', class: 'min-h-6 px-2 py-1 text-label' },
    { shape: 'segment', size: 'lg', class: 'min-h-8 px-3 py-1.5 text-body' },

    { shape: 'chip', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'pill', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'card', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'tile', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'tile', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },

    { shape: ['chip', 'pill', 'icon'], active: false, class: 'active:bg-[color:var(--color-overlay-3)]' },
    { shape: 'tile', active: false, class: 'active:bg-[color:var(--color-overlay-2)]' },
    { shape: 'row', scope: 'app', active: false, class: 'active:bg-[color:var(--color-overlay-2)]' },
    { shape: 'row', scope: 'panel', active: false, class: 'active:bg-[color:var(--map-panel-row-hover)]' },
    { shape: 'segment', active: false, class: 'active:bg-[color:var(--color-overlay-3)]' },
    { shape: 'card', active: false, class: 'active:bg-[color:var(--color-overlay-2)]' },
    { shape: 'link', scope: 'app', active: false, class: 'active:text-[color:var(--color-text-primary)]' },
    { shape: 'link', scope: 'panel', active: false, class: 'active:text-[color:var(--map-panel-text-primary)]' },

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
    { scope: 'panel', tone: 'default', class: 'text-[color:var(--map-panel-text-tertiary)]' },
    /*
     * No panel compound for `muted`: both ramps' quaternary are `#82828a`. If they diverge, the
     * contract test's convergence assertion fails and says to restore this compound.
     */
    { scope: 'panel', tone: 'secondary', class: 'text-[color:var(--map-panel-text-secondary)]' },
    { scope: 'panel', tone: 'strong', class: 'text-[color:var(--map-panel-text-primary)]' },
    // Pressed inside a panel also uses panel ink — otherwise the ramp jumps for
    // exactly the pressed moment.
    { scope: 'panel', shape: 'segment', active: true, class: 'text-[color:var(--map-panel-text-primary)]' },
    { scope: 'panel', shape: 'row', active: true, class: 'text-[color:var(--map-panel-text-primary)]' },
    { scope: 'panel', shape: 'link', active: true, class: 'text-[color:var(--map-panel-text-primary)]' },

    /*
     * ── A filled tone clears the border. It must sit here for ordering reasons:
     * **after** the `border-[…divider]` compounds above, so it wins in
     * tailwind-merge.
     */
    { tone: 'onAccent', class: 'border-transparent active:bg-[color:var(--color-indigo-brand)] active:text-[color:var(--color-text-on-accent)] active:shadow-[var(--shadow-control-press)]' },
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
 * The primitives forward the three hover axes; a value they cannot reach would be hand-written
 * through `className`.
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

/*
 * Form fields are a second cva, not another `shape`: they are a different population on different
 * axes (frame, size, multiline) and most tones mean nothing for them. Heights are 1:1 with
 * `--control-h-{sm,md,lg}`.
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
    { frame: 'bare', size: 'lg', class: 'text-body-lg leading-body-lg' },
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
 * Field label spec: name text and whole pressable rows are specs; layout-only wrappers are not,
 * since type on them would compete with the real name text. Ink is secondary and size `text-label`
 * or larger, so the name outranks the footnote.
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
