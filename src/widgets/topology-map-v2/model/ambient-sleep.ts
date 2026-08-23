/**
 * Ambient sleep — "alive in your hand, asleep when you put it down".
 *
 * **Why it exists.** Measured 2026-07-28 (design council, "Workbench Seat" — the macOS
 * workbench seat): across a 6 s window with no input, main-thread task time was
 * **6,027 ms / 6,000 ms (~100%)**. Scripting was 36 ms of that — the cost is not
 * JS but a full-canvas repaint raster every frame. Ten seconds after load, with no
 * input, canvas bitmaps sampled 400 ms apart still differed, and there were zero
 * infinite CSS animations.
 *
 * The idle gate (`idle-gate.ts`, a per-frame runtime condition) was not at fault —
 * it is built so that a missing wake path cannot freeze the screen. **Two activity
 * flags held its door permanently open:**
 *
 * - `egoTailAnimating` — one `depends` edge is enough to keep the comets flowing.
 * - `breathing` — `nodes.some(n => n.fresh)`. In this product's **normal** state,
 *   where an agent edits the vault daily, a fresh node almost always exists.
 *
 * This app defines itself as a workbench someone **keeps open** for a long time,
 * typically parked beside an agent terminal. rAF is not throttled while the window
 * is visible, so a core burns during the hours nobody is looking, and raster cost
 * scales with viewport area — a wide external monitor pays more.
 *
 * **Why sleep and not switch off.** The always-on comets came from an owner
 * instruction ("Permanence" — permanence; the R6 comment in `use-topology-loop.ts`),
 * and the motion is not decoration: the comet is the only channel carrying a
 * `depends` edge's **direction**, since a dashed line alone cannot. Removing it
 * removes a typed fact. By the council's test — *does turning this motion off lose
 * information?* — it does. (Apple HIG: motion needs a purpose, and an idle app
 * should not spend energy.)
 *
 * So it sleeps instead. While input is recent every comet is fully alive; long
 * after the hand leaves, speed ramps down to 0 and `isCanvasActive` closes on its
 * own. Any input restores it on the next frame — `idle-gate` re-reads its refs
 * every frame, so no wake wiring exists to go missing.
 *
 * **Why a ramp and not a step.** Cutting speed to 0 in one frame strands a comet
 * mid-orbit, and a frozen particle reads as breakage. Decelerating to 0 across the
 * ramp lets particles flow, slow, and stop, so falling asleep reads as an event.
 */

/** The ramp starts this long after the last input. */
export const AMBIENT_SLEEP_DELAY_MS = 30_000;

/** Ramp length — the speed factor travels 1 → 0 across this span. */
export const AMBIENT_SLEEP_RAMP_MS = 2_000;

/**
 * Speed factor [0,1] for ambient motion (the always-on comets, the fresh breathe).
 *
 * - input .. `delayMs`: **1** — fully awake, not one pixel differs from before
 * - `delayMs` .. `+rampMs`: linear deceleration 1 → 0
 * - after that: **0**, and the caller drops its activity flag so the idle gate closes
 *
 * Pure — the same (now, lastInput) gives the same value. Time is a parameter so a
 * test can walk the whole range without timers.
 */
export function ambientSleepFactor(
  nowMs: number,
  lastInputMs: number,
  delayMs: number = AMBIENT_SLEEP_DELAY_MS,
  rampMs: number = AMBIENT_SLEEP_RAMP_MS,
): number {
  const since = nowMs - lastInputMs;
  if (!Number.isFinite(since) || since <= delayMs) return 1;
  if (rampMs <= 0) return 0;
  const t = (since - delayMs) / rampMs;
  if (t >= 1) return 0;
  return 1 - t;
}

/**
 * Has ambient motion fully stopped — the moment to drop the activity flag.
 *
 * True only at exactly 0. Mid-ramp (above 0) it still has to be drawn, so it stays
 * active: closing the condition mid-ramp freezes the comets at partial speed, which
 * manufactures the "looks broken" this whole mechanism exists to avoid.
 */
export function isAmbientAsleep(factor: number): boolean {
  return factor <= 0;
}
