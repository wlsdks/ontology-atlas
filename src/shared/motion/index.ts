/**
 * **JS mirror** of the motion tokens — a verbatim copy of the `--motion-*` ramp in
 * `app/globals.css`.
 *
 * **Why a copy.** framer-motion cannot read a CSS `var()` from a numeric `transition`
 * field, so the values have to be transcribed — and a transcribed value **will** drift
 * without a gate. That gate is
 * `tests/contract/motion-token-mirror.contract.test.ts`: it parses the CSS, compares it
 * against this file, and fails when a name appears that is not on the ramp.
 *
 * **What had gone wrong** (measured 2026-07-28 by the design council's system /
 * design-systems seat). This file carried four steps
 * (`instant/fast/medium/slow` = 0.12/0.18/**0.28/0.42**), and **0.28 and 0.42 existed
 * nowhere in the CSS ramp**. Of 22 usages, **15 were rendering with an off-ramp
 * duration**.
 *
 * No gate caught it because the lint selector (`duration-<number>`) only reads Tailwind
 * class strings. framer's `transition={{ duration: 0.28 }}` and this constant object
 * were **outside every gate's reach** — the values drifted precisely because they lived
 * where nothing was looking.
 *
 * **The names describe use, not size.** Same three-step ramp as
 * `.claude/rules/design.md`; you pick by what the motion does, not by its value:
 *
 * - `fast` (120ms) = **acknowledge** a state that already changed (hover, focus, colour,
 *   chip transitions).
 * - `base` (180ms) = **move** a surface into or out of place (panels, sheets, cards,
 *   drawers).
 * - `settle` (240ms) = **confirm** that something finished (FLIP re-layout, commit
 *   convergence).
 *
 * Every old `medium`/`slow` call site was "a surface appears", so all of them moved to
 * `base` — a 0.42 card entrance was neither an acknowledgement nor a confirmation, just
 * slow.
 */

/** Value copy of `--motion-ease` (cubic-bezier(0.25, 0.1, 0.25, 1)). */
export const MOTION_EASE = [0.25, 0.1, 0.25, 1] as const;

export const MOTION = {
  /** Acknowledge — hover, focus, colour. `--motion-fast`. */
  fast: { duration: 0.12, ease: MOTION_EASE },
  /** Move — a surface changes place. `--motion-base`. */
  base: { duration: 0.18, ease: MOTION_EASE },
  /** Confirm — the signature that something finished. `--motion-settle`. */
  settle: { duration: 0.24, ease: MOTION_EASE },
} as const;

/**
 * List entrance stagger — cumulative delay per item, in seconds.
 *
 * Differing from `--git-row-stagger` (14ms) is deliberate: that one is for dense rows on
 * the history surface, this one is for cards. Snapping them together would give both
 * surfaces the same rhythm and make them read as the same thing (design-systems seat: do
 * not snap values whose contexts genuinely differ).
 */
export const STAGGER = 0.035;

/**
 * Critically damped spring for the three DOM overlays (GlobalSearch, SearchPalette,
 * NewDocKindDialog) — zero overshoot, zero bounce. A JS copy matching the
 * `--overlay-spring-response` (0.30) / `--overlay-spring-damping` (1.0) tokens in
 * `app/globals.css`, since framer cannot read a CSS `var()` from a numeric transition
 * field. Tuned separately from the canvas two-parameter physics model — it does **not**
 * inherit the same spring; the conversion is documented in the globals.css comment.
 * `duration` is the response in seconds, and `bounce: 0` is framer's expression of
 * damping 1.0.
 *
 * **This is the only spring in the DOM.** The old `SPRING.sheet` (stiffness 280 /
 * damping 30 — underdamped, so it overshot) had exactly one consumer (ProjectDrawer) and
 * was an unregistered exception with no gate. In an app whose identity is restraint,
 * overshoot needs explicit approval, so that one call site moved here and the spring was
 * deleted. If something genuinely must bounce, register a `bounce > 0` token then, with
 * the product reason.
 */
export const OVERLAY_SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

/**
 * Overlay transition for reduced-motion users — opacity cross-fade only, no translate or
 * transform, 120ms. Same duration as `.overlay-fade-only` and
 * `--topology-v2-tip-fade-ms` (120) in globals.css; that token is scoped to topology-v2,
 * so it cannot be referenced via var() here — only the value is matched.
 */
export const OVERLAY_SPRING_REDUCED = { duration: 0.12, ease: "linear" } as const;

/**
 * The modal scrim fade — the single transition where an overlay covers what is behind it.
 *
 * Why a constant: this value was duplicated across four sites as the literal
 * `transition={{ duration: reducedMotion ? 0.12 : 0.18 }}`. The values were on the ramp,
 * but they sat **outside the reach of the `motion-token-mirror` contract**, so no gate
 * covered them, and the easing fell back to framer's default — leaving only half of "an
 * element taking a ramp duration takes the matching easing family".
 *
 * This is the **same setup** as the 2026-07-28 incident where JS durations drifted two
 * steps off the CSS ramp (0.28, 0.42): duplicate a literal and eventually only one copy
 * changes. Hoisting it to a constant puts it under that contract automatically.
 *
 * A scrim is a surface changing place, so it takes `base`.
 */
export const SCRIM_FADE = MOTION.base;

/** The reduced-motion equivalent — the same 120ms linear as the overlay rule. */
export const SCRIM_FADE_REDUCED = OVERLAY_SPRING_REDUCED;
