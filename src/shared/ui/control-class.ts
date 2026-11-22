import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/cn';

/**
 * Single source of class strings for pressable controls: values live here, while behaviour
 * (`type`, accessible name) is a component or lint concern.
 */

/**
 * Exported so hand-rolled controls compose the whole set; `disabledAffordanceSelectors` in
 * `eslint.config.mjs` blocks other opacities.
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
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

/**
 * Raises a control to 44px under `pointer: coarse` only. Real height rather than
 * `touch-hit-expand`, which would let hit areas overlap. The rule sits outside the cascade layers
 * in `app/globals.css`, since inside a layer `min-h-8` from utilities wins.
 */
const TOUCH_FLOOR = 'atlas-touch-floor';

const control = cva(`${DISABLED} ${FOCUS}`, {
  variants: {
    /** A new shape needs a fresh control inventory: it means the classification missed a population. */
    shape: {
      /* The size compounds emit the radius, so one output never carries two radii. */
      chip: `${TOUCH_FLOOR} inline-flex items-center gap-1.5 border ${CONTROL_TRANSITION} ${CONTROL_PRESS_TRAVEL}`,
      /**
       * Square icon control, so an accessible name is required. `touch-hit-expand` widens the hit area
       * under `pointer: coarse` through a pseudo-element without changing the visible box.
       */
      icon: `touch-hit-expand inline-flex shrink-0 items-center justify-center rounded-chip ${CONTROL_TRANSITION} ${CONTROL_PRESS_TRAVEL}`,
      row: `${TOUCH_FLOOR} flex w-full items-center text-left ${CONTROL_TRANSITION}`,
      pill: `${TOUCH_FLOOR} inline-flex items-center rounded-full border ${CONTROL_TRANSITION} ${CONTROL_PRESS_TRAVEL}`,
      card: `flex items-center rounded-card border ${CONTROL_TRANSITION}`,
      /**
       * Floor is WCAG 2.5.8 (AA) 24px (`min-h-6`); the 44 for coarse pointers comes from
       * `.touch-hit-expand` (zero layout shift), not from height.
       */
      link: `inline-flex min-h-6 items-center gap-1 rounded-chip ${CONTROL_TRANSITION}`,
      tile: `flex flex-col items-center justify-start rounded-card border text-center ${CONTROL_TRANSITION} ${CONTROL_PRESS_TRAVEL}`,
      /**
       * Borderless inset for segments, tabs and ghost buttons: bordered shapes draw a box in a box
       * inside a bordered container, and `link` has no inset, so a segment would lose its hit area.
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
      /** Differs from `sm` on chips only (inset and micro radius); elsewhere an alias the contract asserts. */
      xs: '',
      sm: '',
      md: '',
      lg: '',
    },
    /** Colour is hierarchy, not decoration: neutrals plus the one indigo. */
    tone: {
      default: 'text-[color:var(--color-text-tertiary)]',
      muted: 'text-[color:var(--color-text-quaternary)]',
      secondary: 'text-[color:var(--color-text-secondary)]',
      /** Several on one screen means no hierarchy. */
      strong: 'text-[color:var(--color-text-primary)]',
      /**
       * The one accent ink, AA on every base and every tint the app lays under it. Gate:
       * `tests/contract/design-tokens/accent-ink-contrast.contract.test.ts`.
       */
      accent: 'text-[color:var(--color-indigo-accent)]',
      /** The three signals the charter allows; do not extend. */
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
      app: '',
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
    /** Picks only the brightness step; `scope` decides the value. */
    hoverInk: { none: '', strong: '', secondary: '' },
    /**
     * One neutral step up; `shape` and `scope` pick the value. A stronger indigo tint is a
     * hierarchy judgement, not an axis.
     */
    hoverSurface: { none: '', lift: '' },
    /** One option: neighbouring indigo border steps are indistinguishable (1.0–1.2:1). */
    hoverBorder: { none: '', strong: '' },
  },
  compoundVariants: [
    /* `active: false` is half of every key: what is selected takes no hover. */
    { hoverInk: 'strong', scope: 'app', active: false, class: 'hover:text-[color:var(--color-text-primary)]' },
    { hoverInk: 'secondary', scope: 'app', active: false, class: 'hover:text-[color:var(--color-text-secondary)]' },
    { hoverInk: 'strong', scope: 'panel', active: false, class: 'hover:text-[color:var(--map-panel-text-primary)]' },
    { hoverInk: 'secondary', scope: 'panel', active: false, class: 'hover:text-[color:var(--map-panel-text-secondary)]' },

    /* A row rests transparent and lifts to `overlay-1`; a part rests one step up and lifts to `overlay-2`. */
    { hoverSurface: 'lift', shape: 'row', scope: 'app', active: false, class: 'hover:bg-[color:var(--color-overlay-1)]' },
    { hoverSurface: 'lift', shape: 'chip', scope: 'app', active: false, class: 'hover:bg-[color:var(--color-overlay-2)]' },
    { hoverSurface: 'lift', shape: 'pill', scope: 'app', active: false, class: 'hover:bg-[color:var(--color-overlay-2)]' },
    { hoverSurface: 'lift', shape: 'icon', scope: 'app', active: false, class: 'hover:bg-[color:var(--color-overlay-2)]' },
    { hoverSurface: 'lift', shape: 'segment', scope: 'app', active: false, class: 'hover:bg-[color:var(--color-overlay-2)]' },
    { hoverSurface: 'lift', scope: 'panel', active: false, class: 'hover:bg-[color:var(--map-panel-row-hover)]' },

    { hoverBorder: 'strong', active: false, class: 'hover:border-[color:var(--color-border-strong)]' },

    /*
     * A free-standing row owns its corners; a cell stacked inside a rounded container does not, or
     * hover backgrounds round piecewise and open gaps.
     */
    { shape: 'row', stacked: false, class: 'rounded-chip' },
    /*
     * The height picks the type: `label` at 24, `body` from 28 to 36, `body-lg` from 40. `min-h`
     * only raises, so the padding keeps each natural height under its floor.
     */
    { shape: 'chip', size: 'xs', class: 'rounded-micro min-h-6 gap-1 px-1.5 py-0.5 text-label' },
    { shape: 'chip', size: ['sm', 'md', 'lg'], class: 'rounded-chip' },
    { shape: 'chip', size: 'sm', class: 'min-h-6 px-2 py-0.5 text-label' },
    { shape: 'chip', size: 'md', class: 'min-h-8 px-2.5 py-1 text-body' },
    { shape: 'chip', size: 'lg', class: 'min-h-8 px-3 py-1 text-body' },
    { shape: 'icon', size: ['xs', 'sm'], class: 'h-6 w-6' },
    { shape: 'icon', size: 'md', class: 'h-7 w-7' },
    { shape: 'icon', size: 'lg', class: 'h-8 w-8' },
    { shape: 'row', size: ['xs', 'sm'], class: 'min-h-7 gap-1.5 px-2 py-1 text-body' },
    { shape: 'row', size: 'md', class: 'min-h-9 gap-2 px-2.5 py-2 text-body' },
    { shape: 'row', size: 'lg', class: 'min-h-11 gap-2.5 px-3 py-2.5 text-body-lg' },
    { shape: 'pill', size: ['xs', 'sm'], class: 'min-h-6 px-2 py-0.5 text-label' },
    { shape: 'pill', size: 'md', class: 'min-h-8 px-2.5 py-0.5 text-body' },
    { shape: 'pill', size: 'lg', class: 'min-h-8 px-3 py-1 text-body' },
    { shape: 'card', size: ['xs', 'sm'], class: 'min-h-8 gap-1.5 px-2.5 py-1 text-body' },
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
    { shape: 'segment', size: 'lg', class: 'min-h-7 px-3 py-1 text-body' },

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

    { shape: 'chip', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'pill', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'card', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'row', active: true, class: 'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]' },
    { shape: 'icon', active: true, class: 'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]' },
    { shape: 'link', active: true, class: 'text-[color:var(--color-text-primary)]' },
    { shape: 'segment', active: true, class: 'bg-[color:var(--color-indigo-a24)] text-[color:var(--color-text-primary)]' },

    /* The panel ground's neutral ramp; signal and indigo tones do not depend on the ground. */
    { scope: 'panel', tone: 'default', class: 'text-[color:var(--map-panel-text-tertiary)]' },
    /*
     * No panel compound for `muted`: both ramps' quaternary are one value. If they diverge, the
     * contract test's convergence assertion fails and says to restore this compound.
     */
    { scope: 'panel', tone: 'secondary', class: 'text-[color:var(--map-panel-text-secondary)]' },
    { scope: 'panel', tone: 'strong', class: 'text-[color:var(--map-panel-text-primary)]' },
    // Pressed inside a panel also uses panel ink — otherwise the ramp jumps for
    // exactly the pressed moment.
    { scope: 'panel', shape: 'segment', active: true, class: 'text-[color:var(--map-panel-text-primary)]' },
    { scope: 'panel', shape: 'row', active: true, class: 'text-[color:var(--map-panel-text-primary)]' },
    { scope: 'panel', shape: 'link', active: true, class: 'text-[color:var(--map-panel-text-primary)]' },

    /* Must follow the border compounds above so the filled tone's clear border wins in tailwind-merge. */
    { tone: 'onAccent', class: 'border-transparent focus-visible:ring-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-indigo-focus-ring)] active:bg-[color:var(--color-indigo-brand)] active:text-[color:var(--color-text-on-accent)] active:shadow-[var(--shadow-control-press)]' },
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
  /** Only what is true of this one site: placement, width, order. Shape, size or colour go on the ramp. */
  className?: string;
}

export function controlClass({ className, ...variants }: ControlClassOptions = {}): string {
  return cn(control(variants), className);
}

/*
 * Form fields are a second cva, not another `shape`: they are a different population on different
 * axes (frame, size, multiline) and most tones mean nothing for them. Heights are 1:1 with
 * `--control-h-{sm,md,lg}`.
 */
/**
 * Type pairs with size, not the base: the user's typed value must outrank the 11px label, yet a
 * tight 28px step has no vertical room for 14px.
 */
const fieldBase =
  'text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] transition-colors';

const field = cva(`${fieldBase} ${DISABLED}`, {
  variants: {
    /** `bare` must not emit dimensions, border, radius or a touch floor: the parent draws the box. */
    frame: {
      /* Emits no width: some consumers take their width from a parent grid. */
      boxed:
        'atlas-touch-floor border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] focus-visible:border-[color:var(--color-indigo-focus-ring)] focus-visible:outline-hidden',
      bare: 'bg-transparent text-body focus:outline-hidden',
    },
    /** Not a separate shape: only the dimension grammar differs. */
    multiline: { false: '', true: 'resize-none' },
    size: { xs: '', sm: '', md: '', lg: '' },
  },
  compoundVariants: [
    /* `xs` is not a height step: it only drops the radius one level, as `chip`'s `xs` does. */
    { frame: 'boxed', multiline: false, size: 'xs', class: 'h-7 rounded-micro px-2 text-body' },
    { frame: 'boxed', multiline: false, size: 'sm', class: 'h-7 rounded-chip px-2 text-body' },
    { frame: 'boxed', multiline: false, size: 'md', class: 'h-8 rounded-chip px-2.5 text-body' },
    { frame: 'boxed', multiline: false, size: 'lg', class: 'h-10 rounded-chip px-3 text-body-lg' },
    { frame: 'boxed', multiline: true, size: 'xs', class: 'min-h-7 rounded-micro px-2 py-1.5 text-body' },
    { frame: 'boxed', multiline: true, size: 'sm', class: 'min-h-7 rounded-chip px-2 py-1.5 text-body' },
    { frame: 'boxed', multiline: true, size: 'md', class: 'min-h-8 rounded-chip px-2.5 py-1.5 text-body' },
    { frame: 'boxed', multiline: true, size: 'lg', class: 'min-h-10 rounded-chip px-3 py-2 text-body-lg' },
    { frame: 'bare', size: 'lg', class: 'text-body-lg leading-body-lg' },
  ],
  defaultVariants: { frame: 'boxed', multiline: false, size: 'md' },
});

export type FieldFrame = NonNullable<VariantProps<typeof field>['frame']>;
export type FieldSize = NonNullable<VariantProps<typeof field>['size']>;

export interface FieldClassOptions extends VariantProps<typeof field> {
  /** Only what is true of this one field: width (`w-full`, `flex-1`) and placement. */
  className?: string;
}

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
    /** Wrapping a checkbox makes the label the target (WCAG 2.5.8), so it carries both floors. */
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

export function fieldLabel({ className, ...variants }: FieldLabelOptions = {}): string {
  return cn(fieldLabelVariants(variants), className);
}
