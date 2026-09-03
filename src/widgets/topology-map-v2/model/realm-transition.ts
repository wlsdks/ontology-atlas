/**
 * Realm transition — state machine plus motion math.
 *
 * Pure: no DOM, canvas, or timer knowledge. `ui/use-topology-loop.ts` drives the
 * phase through this reducer and, every frame, calls the evaluate functions
 * below for node positions, warding-draw progress, and the parallax factor, then
 * applies them to the world.
 *
 * Inside nodes FLIP to their new positions; outside nodes leave along an
 * accelerating radial-plus-tangential curve — gravity re-forming — and unmount
 * off screen; the warding ring draws itself with a stroke dash; the background
 * dot grid falls once, at the moment of transition, and stops. Nothing here is a
 * continuous animation, and `prefers-reduced-motion` switches instantly instead.
 *
 * These constants are documented module constants rather than tokens, following
 * the same "no token yet" precedent as the min/max durations in
 * `model/camera-easing.ts`: they govern feel (timing), not theme surface.
 */

/**
 * Total transition envelope (ms).
 *
 * The original 600 ms design ran fling, FLIP, and warding all at once and a
 * 5 fps recording caught **zero** intermediate frames — it read as a hard cut
 * (owner report, confirmed by frame review). The phases were separated along the
 * time axis so each motion is legible: fling 0–420 → FLIP (per-depth delays of
 * 240/380/520, each lasting 660, deepest settling at 1180) → warding draw
 * 700–1000. Depth-sequenced assembly then pushed the envelope from 1000 to 1180,
 * which is when the deepest element ring (depth 3+, delay 520) finishes its
 * 660 ms FLIP.
 */
export const REALM_ENVELOPE_MS = 1180;
/** FLIP duration (ms) for nodes inside the realm — ease-out, the same at every depth. */
export const REALM_INSIDE_FLIP_MS = 660;
/**
 * FLIP start delay (ms) for depth 1, the domain ring — the outside world is seen
 * to empty first, then the re-layout begins. Root (depth 0) and domains (depth 1)
 * land first; deeper rings step later via `realmInsideFlipDelayFor`.
 */
export const REALM_INSIDE_FLIP_DELAY_MS = 240;
/**
 * Per-depth delay step (ms): depth 2 is +1 step, depth 3+ is +2. Layers then read
 * as assembling outward from the root. Each ring keeps the 660 ms FLIP duration;
 * only the start point moves.
 */
export const REALM_INSIDE_FLIP_DELAY_STEP_MS = 140;

/**
 * Member depth → that ring's FLIP start delay (ms). Root and domain (depth ≤ 1)
 * take the base delay, capability (depth 2) +1 step, element (depth 3+) stops at
 * +2 — anything deeper shares the element ring and so shares its delay. Pure.
 */
export function realmInsideFlipDelayFor(depth: number): number {
  if (depth <= 1) return REALM_INSIDE_FLIP_DELAY_MS;
  if (depth === 2) return REALM_INSIDE_FLIP_DELAY_MS + REALM_INSIDE_FLIP_DELAY_STEP_MS;
  return REALM_INSIDE_FLIP_DELAY_MS + REALM_INSIDE_FLIP_DELAY_STEP_MS * 2;
}

/**
 * Member depth → alpha multiplier while a realm is active: depth 1 → 1.0,
 * depth 2 → 0.98, depth 3+ → 0.96. Alpha alone carries "the nearer layer is
 * crisper", with no tint or blur. Hovered and ego members are restored to 1.0 by
 * the caller. Pure.
 *
 * **Why these were raised from 0.92/0.84** (infoviz measurement, 2026-08-18).
 * The multiplier **composites** onto the node's stroke ink. The darkest depth
 * ink, `--topology-v2-ink-depth-leaf` (#7a7a86, 4.7:1 on the canvas), times
 * 0.84 gives a composited contrast of **2.58:1** — below the WCAG 1.4.11
 * non-text floor of 3:1. The lowest alpha that keeps leaf ink at 3:1 is 0.955,
 * so the multipliers move above it (0.96) and the ink ramp keeps its order
 * (leaf < mid < top). Brightening the ink instead would squash the whole ramp
 * into a 0.1 band below top (3.93) and erase the depth axis itself. Gate: the
 * composited-floor check in `tests/contract/topology-ink-contrast.contract.test.ts`.
 * The rest of the depth signal is carried by the scale multipliers below and by
 * layer position.
 */
export function realmDepthClarityAlpha(depth: number): number {
  if (depth <= 1) return 1;
  if (depth === 2) return 0.98;
  return 0.96;
}

/**
 * Member depth → size multiplier while a realm is active: depth 1 → 1.0,
 * depth 2 → 0.97, depth 3+ → 0.94. Drawing deeper layers very slightly smaller
 * adds perspective, mirroring the alpha multipliers. Pure.
 */
export function realmDepthClarityScale(depth: number): number {
  if (depth <= 1) return 1;
  if (depth === 2) return 0.97;
  return 0.94;
}
/** Fling duration (ms) for nodes leaving the realm — ease-in acceleration. */
export const REALM_OUTSIDE_FLING_MS = 420;
/** Warding-ring self-drawing duration (ms). */
const REALM_WARDING_DRAW_MS = 300;
/** Warding-draw start delay (ms) — the seal is drawn once the world has roughly settled. */
export const REALM_WARDING_DRAW_DELAY_MS = 700;
/** Dot-grid parallax fall, rise→settle duration (ms). */
const REALM_DUST_SETTLE_MS = 1000;

/** Extra distance (world units) a leaving node is pushed from the centre — enough to clear the screen. */
export const REALM_FLING_REACH = 4200;
/** Tangential curl (radians) of the fling path — it bends slightly instead of flying straight, which reads as re-forming. */
const REALM_FLING_CURL = 0.5;

/**
 * Exit choreography constants.
 *
 * Entry is a three-phase piece (fling → depth-sequenced assembly → warding), but
 * the first exit was only a home spring on every node plus a camera fit, so there
 * was no closing *event* — an asymmetry. Exit is therefore the **reverse
 * playback** of entry: the warding erases while the inside world reverse-FLIPs
 * home deepest-layer-first, then outside nodes return under reverse gravity, with
 * the camera's overview fit tweening in sync (750 ms, following entry's 860 ms
 * pattern). Documented module constants, on the entry constants' precedent.
 */
export const REALM_EXIT_ENVELOPE_MS = 800;
/** Warding-ring reverse-erase duration (ms) — draw progress 1→0. */
export const REALM_EXIT_WARDING_ERASE_MS = 250;
/** Reverse-FLIP duration (ms) for inside nodes — ease-out, identical at every depth; only the start is stepped. */
export const REALM_EXIT_FLIP_MS = 420;
/**
 * Reverse-FLIP per-depth delay step (ms). Entry steps shallow-first, so exit
 * inverts it and **the deepest layer leaves first**: depth 3+ → 0 steps, depth 2
 * → +1, depth ≤ 1 → +2 (last to go). Worst case 240 + 420 FLIP = 660, inside the
 * 800 ms envelope.
 */
export const REALM_EXIT_FLIP_DELAY_STEP_MS = 120;
/** Reverse-gravity return duration (ms) for outside nodes — reach 1→0, decelerating into the landing. */
export const REALM_EXIT_OUTSIDE_RETURN_MS = 500;
/** Return start delay (ms) — after the warding has erased and the inside world has begun folding. */
export const REALM_EXIT_OUTSIDE_RETURN_DELAY_MS = 150;

export type RealmPhase = "idle" | "entering" | "active" | "exiting";

export interface RealmTransitionState {
  phase: RealmPhase;
  /** Current or most recent realm root id (null while idle). */
  rootId: string | null;
  /** Transition start time (`performance.now` clock). Meaningless while idle or active. */
  startMs: number;
  /** Duration of this transition (ms); 0 under reduced motion, i.e. instant. */
  durationMs: number;
}

export const INITIAL_REALM_TRANSITION_STATE: RealmTransitionState = {
  phase: "idle",
  rootId: null,
  startMs: 0,
  durationMs: 0,
};

export type RealmTransitionEvent =
  | { type: "enter"; rootId: string; now: number; reducedMotion: boolean }
  | { type: "exit"; now: number; reducedMotion: boolean }
  | { type: "tick"; now: number };

/**
 * Pure reducer. `enter` re-enters on a new root from any state; `exit` opens the
 * leaving transition only when a realm exists; `tick` settles entering→active and
 * exiting→idle once the duration has elapsed. Under reduced motion the duration
 * is 0, so it settles on the next tick.
 */
export function realmTransitionReducer(
  state: RealmTransitionState,
  event: RealmTransitionEvent,
): RealmTransitionState {
  switch (event.type) {
    case "enter":
      return {
        phase: "entering",
        rootId: event.rootId,
        startMs: event.now,
        durationMs: event.reducedMotion ? 0 : REALM_ENVELOPE_MS,
      };
    case "exit":
      if (state.phase === "idle") return state;
      return {
        phase: "exiting",
        rootId: state.rootId,
        startMs: event.now,
        // The reverse-playback envelope. It was previously just the 660 ms FLIP,
        // which left no room for the outside nodes' return or the warding erase.
        durationMs: event.reducedMotion ? 0 : REALM_EXIT_ENVELOPE_MS,
      };
    case "tick": {
      if (state.phase !== "entering" && state.phase !== "exiting") return state;
      if (event.now - state.startMs < state.durationMs) return state;
      return state.phase === "entering"
        ? { ...state, phase: "active" }
        : { ...INITIAL_REALM_TRANSITION_STATE };
    }
    default:
      return state;
  }
}

/** Realm engaged, transitions included — only then is the subtree drawn alone and wrapped in a warding ring. */
export function isRealmEngaged(phase: RealmPhase): boolean {
  return phase !== "idle";
}

/** When outside nodes may be hard-culled: once the fling has finished. */
export function isRealmOutsideCulled(state: RealmTransitionState, now: number): boolean {
  if (state.phase === "active") return true;
  if (state.phase === "idle" || state.phase === "exiting") return false;
  // Entering: cull once the fling is done — it is shorter than the envelope.
  return now - state.startMs >= REALM_OUTSIDE_FLING_MS;
}

function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** ease-out cubic — leaves fast, settles softly (the FLIP landing). */
function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 3);
}

/** ease-in cubic — leaves slowly, accelerates (the gravity fling). */
function easeInCubic(t: number): number {
  const c = clamp01(t);
  return c * c * c;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * This frame's position for a node inside the realm: FLIP from `from` to `to`.
 * `duration <= 0` (reduced motion) lands on `to` immediately, and any
 * `elapsed >= duration` gives exactly `to`.
 */
export function realmInsidePosition(
  from: Point,
  to: Point,
  elapsed: number,
  duration: number = REALM_INSIDE_FLIP_MS,
): Point {
  if (duration <= 0) return { x: to.x, y: to.y };
  const e = easeOutCubic(elapsed / duration);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
}

/**
 * This frame's position for a node outside the realm: radial acceleration away
 * from the centre plus a tangential curl. A node sitting exactly on the centre
 * leaves along `fallbackAngle`, which keeps it deterministic. As `elapsed`
 * advances (ease-in) the radius grows by `REALM_FLING_REACH` and the direction
 * bends by the curl.
 */
export function realmOutsidePosition(
  from: Point,
  center: Point,
  elapsed: number,
  options?: { duration?: number; reach?: number; curl?: number; fallbackAngle?: number },
): Point {
  const duration = options?.duration ?? REALM_OUTSIDE_FLING_MS;
  const reach = options?.reach ?? REALM_FLING_REACH;
  const curl = options?.curl ?? REALM_FLING_CURL;
  const fallbackAngle = options?.fallbackAngle ?? 0;

  const dx = from.x - center.x;
  const dy = from.y - center.y;
  const dist = Math.hypot(dx, dy);
  const baseAngle = dist > 1e-6 ? Math.atan2(dy, dx) : fallbackAngle;

  if (duration <= 0) {
    // Reduced motion: straight off screen.
    const r = dist + reach;
    return { x: center.x + Math.cos(baseAngle) * r, y: center.y + Math.sin(baseAngle) * r };
  }
  const e = easeInCubic(elapsed / duration);
  const r = dist + reach * e;
  const angle = baseAngle + curl * e;
  return { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r };
}

/**
 * Exit reverse-FLIP start delay (ms) — the inverse of entry's
 * `realmInsideFlipDelayFor`, which goes shallow-first. Here **the deepest layer
 * leaves first**: depth 3+ → 0 (first), depth 2 → +1 step, depth ≤ 1 (root and
 * domains) → +2 steps, the spine that stays longest. Worst case 240 + 420 FLIP
 * = 660, inside the 800 ms envelope. Pure.
 */
export function realmExitFlipDelayFor(depth: number): number {
  if (depth <= 1) return REALM_EXIT_FLIP_DELAY_STEP_MS * 2;
  if (depth === 2) return REALM_EXIT_FLIP_DELAY_STEP_MS;
  return 0;
}

/**
 * Warding-ring erase progress, 1→0 — the reverse of entry's
 * `realmWardingDrawProgress` (0→1). At elapsed 0 the ring is full; after
 * `duration` it is gone. Fed to the same drawing renderer, the arc rewinds from
 * its end. Pure.
 */
export function realmWardingEraseProgress(
  elapsed: number,
  duration: number = REALM_EXIT_WARDING_ERASE_MS,
): number {
  if (duration <= 0) return 0;
  return clamp01(1 - elapsed / duration);
}

/**
 * Reach factor 1→0 for an outside node returning under reverse gravity — the
 * **reverse playback** of the entry fling (`easeInCubic` accelerating 0→1).
 * Being `easeInCubic(1 - t)`, elapsed 0 gives 1 (fully flung) and `duration`
 * gives 0 (home). The forward curve was fastest at its end, so the reverse is
 * fastest at its start and decelerates into the landing. Pure.
 */
export function realmOutsideReturnReach(
  elapsed: number,
  duration: number = REALM_EXIT_OUTSIDE_RETURN_MS,
): number {
  if (duration <= 0) return 0;
  return easeInCubic(1 - clamp01(elapsed / duration));
}

/**
 * Alpha (0..1) for an outside node during its reverse-gravity return: the pure
 * phase→alpha mapping `1 - realmOutsideReturnReach(elapsed, duration)`.
 *
 * Since the reach factor shrinks from 1 (fully flung) to 0 (home), its
 * complement grows from 0 (invisible) to 1 (full alpha) — a materialize alpha,
 * the additive mirror of the entry fling's subtractive fade. Without it, an
 * outside node rewound its position only, so the frame it stopped being culled
 * (`isEdgeCulled`) it popped in at full alpha in one frame — a spike of ink at
 * onset, caught in the owner's motion audit. No new easing and no new tokens:
 * it reuses the existing `realmOutsideReturnReach` curve. Pure.
 */
export function realmOutsideReturnAlpha(
  elapsed: number,
  duration: number = REALM_EXIT_OUTSIDE_RETURN_MS,
): number {
  return 1 - realmOutsideReturnReach(elapsed, duration);
}

/**
 * This frame's return position for an outside node — the reverse playback of
 * `realmOutsidePosition`. `from` is the node's **home** position, which was the
 * fling's starting point on entry. As the reach factor falls 1→0 the radius and
 * curl rewind and it lands exactly on `from`, fully reversing the entry path with
 * no overshoot. `duration <= 0` (reduced motion) goes home immediately.
 */
export function realmOutsideReturnPosition(
  from: Point,
  center: Point,
  elapsed: number,
  options?: { duration?: number; reach?: number; curl?: number; fallbackAngle?: number },
): Point {
  const duration = options?.duration ?? REALM_EXIT_OUTSIDE_RETURN_MS;
  const reach = options?.reach ?? REALM_FLING_REACH;
  const curl = options?.curl ?? REALM_FLING_CURL;
  const fallbackAngle = options?.fallbackAngle ?? 0;

  if (duration <= 0) return { x: from.x, y: from.y };

  const dx = from.x - center.x;
  const dy = from.y - center.y;
  const dist = Math.hypot(dx, dy);
  const baseAngle = dist > 1e-6 ? Math.atan2(dy, dx) : fallbackAngle;

  const e = realmOutsideReturnReach(elapsed, duration); // 1 → 0
  const r = dist + reach * e;
  const angle = baseAngle + curl * e;
  return { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r };
}

/** Warding-ring self-drawing progress, 0..1 — drives the stroke-dash offset. */
export function realmWardingDrawProgress(
  elapsed: number,
  duration: number = REALM_WARDING_DRAW_MS,
): number {
  if (duration <= 0) return 1;
  return clamp01(elapsed / duration);
}

/**
 * Dot-grid parallax factor, 0..1 — a half sine period, rise then settle: 0 at the
 * start, peak in the middle, and back to 0 after `REALM_DUST_SETTLE_MS`, because
 * this must never become a continuous animation. The caller multiplies it by
 * layer depth and a maximum travel (within 3% of the screen) to get the radial
 * offset.
 */
export function realmDustParallaxFactor(
  elapsed: number,
  duration: number = REALM_DUST_SETTLE_MS,
): number {
  if (duration <= 0 || elapsed <= 0 || elapsed >= duration) return 0;
  return Math.sin(Math.PI * (elapsed / duration));
}
