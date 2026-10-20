/**
 * JS mirror of the `--motion-*` ramp in `app/globals.css`. framer-motion cannot read a
 * CSS `var()` in a numeric `transition`, so the values are copied, and the contract in
 * tests/contract (`motion-token-mirror.contract.test.ts`) fails when they drift or a name
 * leaves the ramp. Every JS duration goes through this file, because the Tailwind lint only
 * reads class strings.
 *
 * Names describe use (`docs/DESIGN-SYSTEM.md`, "Ramp and defaults"): `fast` acknowledges, `base`
 * moves a surface, `settle` confirms, `slow` travels far, `expressive` stages an entrance, and
 * `choreography` bounds a rare multi-part entrance.
 */

/** Value copy of `--motion-ease` (cubic-bezier(0.25, 0.1, 0.25, 1)) — the entry family. */
export const MOTION_EASE = [0.25, 0.1, 0.25, 1] as const;

/**
 * Value copy of `--motion-ease-exit` (cubic-bezier(0.4, 0, 1, 1)) — the exit family.
 *
 * Surfaces reach it only through {@link EXIT_TRANSITION}; `motion-token-mirror.contract.test.ts`
 * fails any file outside `src/shared/motion` that names it, so an entrance cannot borrow it.
 */
export const MOTION_EASE_EXIT = [0.4, 0, 1, 1] as const;

export const MOTION = {
  fast: { duration: 0.12, ease: MOTION_EASE },
  base: { duration: 0.18, ease: MOTION_EASE },
  settle: { duration: 0.24, ease: MOTION_EASE },
  slow: { duration: 0.36, ease: MOTION_EASE },
  expressive: { duration: 0.6, ease: MOTION_EASE },
  choreography: { duration: 1.2, ease: MOTION_EASE },
} as const;

/**
 * List entrance stagger per item, in seconds. It differs from `--git-row-stagger` (14ms) on
 * purpose: dense history rows and cards should not share one rhythm.
 */
export const STAGGER = 0.035;

/**
 * Critically damped spring for the DOM overlays, mirroring `--overlay-spring-response` (0.30)
 * and `--overlay-spring-damping` (1.0) in `app/globals.css`: `duration` is the response in
 * seconds and `bounce: 0` is damping 1.0.
 */
export const OVERLAY_SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

/**
 * Reduced-motion overlay transition: a 120ms opacity cross-fade, the value of both the
 * class `.overlay-fade-only` and `--map-tip-fade-ms`; the token is scoped to ontology-map, so it
 * cannot be read through var() here.
 */
export const OVERLAY_SPRING_REDUCED = { duration: 0.12, ease: "linear" } as const;

/**
 * The modal scrim fade. A constant rather than a literal per site, so the mirror contract
 * covers it and the easing is the ramp's; a scrim is a surface changing place, so `base`.
 */
export const SCRIM_FADE = MOTION.base;

/** The reduced-motion equivalent — the same 120ms linear as the overlay rule. */
export const SCRIM_FADE_REDUCED = OVERLAY_SPRING_REDUCED;

/**
 * Where a surface starts, as a name, so entrance distances cannot drift between copies.
 *
 * Two grammars: the overlay grammar (`dialog.tsx`) is opacity plus an 8px rise; hand-built
 * modal sheets arrive from 12px with a hair of scale. `framer-entrance-grammar.contract.test.ts`
 * refuses a third. Each resting state is exported beside its start so `scale` returns to 1.
 */
export const OVERLAY_RISE = { opacity: 0, y: 8 } as const;

/** Keep the overlay fade without snapping its position when motion is reduced. */
export const OVERLAY_RISE_REDUCED = { opacity: 0, y: 0 } as const;

/** The rest state `OVERLAY_RISE` travels to. */
export const OVERLAY_SETTLED = { opacity: 1, y: 0 } as const;

/** A sheet arriving: further below, and a hair small on the way in. */
export const SHEET_RISE = { opacity: 0, y: 12, scale: 0.985 } as const;

/** The rest state `SHEET_RISE` travels to — `scale` included, or the sheet stays small. */
export const SHEET_SETTLED = { opacity: 1, y: 0, scale: 1 } as const;

/**
 * The reduced-motion equivalent of `SHEET_RISE`: the same axes with zero travel, so the sheet
 * fades in place instead of teleporting when geometry animation is cut.
 */
export const SHEET_RISE_REDUCED = { opacity: 0, y: 0, scale: 1 } as const;

/**
 * Leaving is not arriving rewound: framer's `exit` otherwise reuses the entry `transition`
 * backwards. CSS exits run at `calc(var(--motion-base) * 0.67)` = 120ms, the ramp's fast
 * step. The curve accelerates away instead of slowing on screen, as the inspector's movement
 * exit (topologyChromeOut) does; CSS fades stay on --motion-ease. The exit contract
 * (`framer-exit-asymmetry.contract.test.ts`) requires this name at every exit; the input
 * lockout lives in `useExitLockout`, so this stays a numeric `{ duration, ease }`.
 */
export const EXIT_TRANSITION = {
  duration: MOTION.fast.duration,
  ease: MOTION_EASE_EXIT,
} as const;
