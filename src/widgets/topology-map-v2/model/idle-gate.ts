/**
 * The idle-frame skip condition — pure predicates, no timers or canvas.
 *
 * It exists because rAF repainted the entire canvas every frame even with zero
 * input. The design is deliberately conservative: **rAF is never stopped.**
 * Once idle has lasted longer than the grace window, only the physics step and
 * the paint are skipped. Every predicate is re-evaluated from refs each frame,
 * so any state change resumes drawing on the next frame — there is no wake
 * wiring, and therefore no failure mode where a missed wake freezes the canvas.
 * A no-op frame costs microseconds.
 */

export interface CanvasActivityFlags {
  /** The pointer state machine is not idle (dragging, pressing, hover-moving). */
  pointerActive: boolean;
  /** Simulation heat or a pin — a drag, or settling after release. */
  simWarm: boolean;
  /** Homing: auto-arrange, or the first-map reveal. */
  homing: boolean;
  /** The selection-commit pulse is playing. */
  selectionPulseActive: boolean;
  /** Focus plus an advancing ego tail (speed > 0) — the only always-on motion. */
  egoTailAnimating: boolean;
  /** A growth replay is driving the appear ramps (`model/growth-replay.ts`). */
  growthReplaying?: boolean;
  /** A hover/panel emphasis target exists, so the ripple may be ramping. */
  emphasisTarget: boolean;
  /**
   * A deselect fade is running: no live focus (node or edge) remains, but the
   * retained colorFocus — the color target of the selection ring and background
   * dim — is still there while the focus ramp decays to 0. This counts as
   * activity independently of every other flag, because both the ramp decay and
   * the colorFocus clear happen only inside the frame body: skip a frame here
   * and the ring freezes at full opacity. Under reduced motion the ramp snaps
   * and clears in one frame, so one awake frame is enough.
   */
  focusFadeSettling: boolean;
  /** Fresh-node breathing (pass false under reduced motion). */
  breathing: boolean;
  /** The camera is still moving — its spring has not settled. */
  cameraMoving: boolean;
  /**
   * The recent-change spotlight ramp has not reached its target (1 on, 0 off),
   * so the transition is still in flight. Counted explicitly for the same reason
   * as `focusFadeSettling`: the ramp steps only inside the frame body, so a skip
   * mid-transition freezes it.
   */
  spotlightSettling: boolean;
  /**
   * The trail lens was toggled but no frame has been drawn in the new state.
   * The lens arrives through a ref rather than React state (so toggling does not
   * re-render the page tree), which means no effect can wake the loop — instead
   * "current ref ≠ last drawn state" counts as activity and buys one frame.
   */
  trailLensSettling: boolean;
}

/**
 * The three branches behind `egoTailAnimating` — pure predicate.
 *
 * Why it is a function at all: the flag is three ORs, and **ambient sleep was
 * applied to only two of them.** The depends comets and the fresh breathing
 * slept; the focused-contains comet branch stayed outside the condition, so
 * **leaving one node selected and taking your hands off meant the app never
 * slept** — which is exactly this workbench's most common idle state: a
 * datasheet left open while you switch to the terminal.
 *
 * The point is that the screen had already stopped moving. The physics step
 * multiplies every comet speed by `ambientFactor` (`topology-physics-step.ts`),
 * so at factor 0 no phase advances at all — a picture that cannot change was
 * being fully re-rasterised every frame.
 *
 * The pulse branch is deliberately left outside the condition. It is a one-shot
 * signal born from hover that expires after 420 ms, and hover is input, so the
 * factor is already back at 1 the moment it fires. Gating it could never be
 * true, and would only add a "fired but never drawn" failure mode.
 */
export interface EgoTailActivityInput {
  reducedMotion: boolean;
  /** `isAmbientAsleep(ambientSleepFactor(...))` — has the factor reached 0? */
  ambientAsleep: boolean;
  hasDependsEdges: boolean;
  edgePulseSpeed: number;
  /** Is a node selected — the incident-contains comet case. */
  focused: boolean;
  hasContainsEdges: boolean;
  /** Number of live hover pulses. */
  livePulseCount: number;
}

export function isEgoTailAnimating(input: EgoTailActivityInput): boolean {
  if (input.livePulseCount > 0) return true;
  if (input.reducedMotion || input.ambientAsleep) return false;
  if (input.hasDependsEdges && input.edgePulseSpeed > 0) return true;
  return input.focused && input.hasContainsEdges;
}

/**
 * Whether the 3D dome's autonomous spin should be running — pure predicate.
 *
 * Measured 2026-08-19: the autonomous spin is ambient motion of exactly the same
 * class as the always-on comets and the fresh breathing, yet it alone lived
 * outside the `ambient-sleep.ts` contract. The result was literally the same
 * shape of failure the `isEgoTailAnimating` doc-block describes — after 45 s
 * with no input the 3D view still would not sleep, burning 520 ms per second
 * (half a core) at 2,000 nodes, where the same state in 2D cost 3 ms/s: 170×.
 *
 * Given that this app's typical scenario is a workbench parked next to an agent
 * terminal, that is its most common state. Hence the same prescription: do not
 * turn the motion off, put it to sleep. The predicate is extracted for the same
 * reason too — with the ORs and ANDs spread across two places (the activity
 * flag and the spin application), the accident of applying a condition to only
 * one of them recurs exactly.
 *
 * The terms those two places do not share (`orbiting`, `yawVel`) stay out of
 * here: they answer "is a hand or its momentum already turning it", which is not
 * a condition on the autonomous spin.
 */
export interface DomeSpinInput {
  /** The 3D view is on and no realm transition is in flight. */
  domeOn: boolean;
  reducedMotion: boolean;
  /** `isAmbientAsleep(ambientSleepFactor(...))` — has the factor reached 0? */
  ambientAsleep: boolean;
  /** Armed state, lowered by any intervention: orbit, zoom, node drag, select. */
  spinArmed: boolean;
  /** Cursor over the canvas — hold still so the aimed node cannot slide away under it. */
  pointerOverCanvas: boolean;
  /** Has the assembly ramp finished? */
  assembled: boolean;
}

export function isDomeSpinAnimating(input: DomeSpinInput): boolean {
  return (
    input.domeOn &&
    !input.reducedMotion &&
    !input.ambientAsleep &&
    input.spinArmed &&
    !input.pointerOverCanvas &&
    input.assembled
  );
}

export function isCanvasActive(flags: CanvasActivityFlags): boolean {
  return (
    flags.pointerActive ||
    flags.simWarm ||
    flags.homing ||
    flags.selectionPulseActive ||
    flags.egoTailAnimating ||
    flags.growthReplaying === true ||
    flags.emphasisTarget ||
    flags.breathing ||
    flags.cameraMoving ||
    flags.focusFadeSettling ||
    flags.spotlightSettling ||
    flags.trailLensSettling
  );
}

/** Skipping is allowed only `graceMs` after the last activity, which protects the tail of a decaying ramp. */
export function shouldSkipFrame(nowMs: number, lastActiveMs: number, graceMs: number): boolean {
  return nowMs - lastActiveMs > graceMs;
}

/**
 * An unsettled camera spring (target ≠ value) is activity.
 *
 * Counting only *moving* values deadlocks: while frames are skipped the physics
 * step does not run, so the value cannot move, and a wheel zoom changes only the
 * target — so nothing ever wakes the loop and wheel zoom dies 1.2 s into idle.
 * Compare target against value directly instead.
 */
export function isCameraUnsettled(
  camera: { x: number; y: number; scale: number },
  target: { tx: number; ty: number; tscale: number },
  positionEps = 0.01,
  scaleEps = 0.0001,
): boolean {
  return (
    Math.abs(camera.x - target.tx) > positionEps ||
    Math.abs(camera.y - target.ty) > positionEps ||
    Math.abs(camera.scale - target.tscale) > scaleEps
  );
}
