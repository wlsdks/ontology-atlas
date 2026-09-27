/**
 * Realm transition state machine and motion maths; `ui/use-topology-loop.ts` drives the
 * phase and applies these per frame. Inside nodes FLIP, outside nodes fling out on an
 * accelerating curved path and unmount, and the ward draws itself; nothing loops, and
 * reduced motion switches at once. Timings are feel constants, not tokens.
 */

/**
 * Phases are separated in time so each reads: fling 0–420, FLIP per depth (delays
 * 240/380/520, each 660, the deepest settling at 1180), ward draw 700–1000. Run together
 * they read as a hard cut.
 */
export const REALM_ENVELOPE_MS = 1180;
/** Ease-out, the same at every depth. */
export const REALM_INSIDE_FLIP_MS = 660;
/** The outside is seen to empty first; deeper rings step later via `realmInsideFlipDelayFor`. */
export const REALM_INSIDE_FLIP_DELAY_MS = 240;
/** Depth 2 is +1 step, depth 3+ is +2, so layers assemble outward from the root. */
export const REALM_INSIDE_FLIP_DELAY_STEP_MS = 140;

/** Depth ≤ 1 takes the base delay, 2 one step, 3+ two steps (the element ring). */
export function realmInsideFlipDelayFor(depth: number): number {
  if (depth <= 1) return REALM_INSIDE_FLIP_DELAY_MS;
  if (depth === 2) return REALM_INSIDE_FLIP_DELAY_MS + REALM_INSIDE_FLIP_DELAY_STEP_MS;
  return REALM_INSIDE_FLIP_DELAY_MS + REALM_INSIDE_FLIP_DELAY_STEP_MS * 2;
}

/**
 * Depth 1 → 1.0, 2 → 0.98, 3+ → 0.96; the caller restores hovered and ego members to 1.0.
 * The multiplier composites onto the stroke ink, and below 0.955 the darkest depth ink
 * (`--map-ink-depth-leaf`) falls under the 3:1 WCAG 1.4.11 floor
 * (`tests/contract/topology-ink-contrast.contract.test.ts`). Brightening the ink instead
 * would flatten the depth ramp.
 */
export function realmDepthClarityAlpha(depth: number): number {
  if (depth <= 1) return 1;
  if (depth === 2) return 0.98;
  return 0.96;
}

/** Depth 1 → 1.0, 2 → 0.97, 3+ → 0.94: slightly smaller deeper layers add perspective. */
export function realmDepthClarityScale(depth: number): number {
  if (depth <= 1) return 1;
  if (depth === 2) return 0.97;
  return 0.94;
}
/** Ease-in acceleration. */
export const REALM_OUTSIDE_FLING_MS = 420;
const REALM_WARDING_DRAW_MS = 300;
/** The seal is drawn once the world has roughly settled. */
export const REALM_WARDING_DRAW_DELAY_MS = 700;
/** Rise then settle. */
const REALM_DUST_SETTLE_MS = 1000;

/** Enough to clear the screen. */
export const REALM_FLING_REACH = 4200;
/** Bends the path slightly so it reads as re-forming rather than flying straight. */
const REALM_FLING_CURL = 0.5;

/**
 * Exit plays entry in reverse, so leaving is an event too: the ward erases while the inside
 * reverse-FLIPs deepest first, then outside nodes return under reverse gravity, with the
 * camera fit tweening alongside.
 */
export const REALM_EXIT_ENVELOPE_MS = 800;
/** Draw progress 1→0. */
export const REALM_EXIT_WARDING_ERASE_MS = 250;
/** Identical at every depth; only the start is stepped. */
export const REALM_EXIT_FLIP_MS = 420;
/**
 * The deepest layer leaves first: depth 3+ → 0 steps, 2 → +1, ≤ 1 → +2. Worst case
 * 240 + 420 = 660, inside the 800 ms envelope.
 */
export const REALM_EXIT_FLIP_DELAY_STEP_MS = 120;
/** Reach 1→0, decelerating into the landing. */
export const REALM_EXIT_OUTSIDE_RETURN_MS = 500;
/** After the ward has erased and the inside has begun folding. */
export const REALM_EXIT_OUTSIDE_RETURN_DELAY_MS = 150;

export type RealmPhase = "idle" | "entering" | "active" | "exiting";

export interface RealmTransitionState {
  phase: RealmPhase;
  /** null while idle. */
  rootId: string | null;
  /** `performance.now` clock; meaningless while idle or active. */
  startMs: number;
  /** 0 under reduced motion. */
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
 * `enter` re-enters on a new root from any state; `exit` applies only when a realm exists;
 * `tick` settles once the duration elapses (next tick under reduced motion).
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
        // The reverse envelope leaves room for the outside return and the ward erase.
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

/** Only then is the subtree drawn alone inside a ward. */
export function isRealmEngaged(phase: RealmPhase): boolean {
  return phase !== "idle";
}

/** Once the fling has finished. */
export function isRealmOutsideCulled(state: RealmTransitionState, now: number): boolean {
  if (state.phase === "active") return true;
  if (state.phase === "idle" || state.phase === "exiting") return false;
  // The fling is shorter than the envelope.
  return now - state.startMs >= REALM_OUTSIDE_FLING_MS;
}

function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 3);
}

function easeInCubic(t: number): number {
  const c = clamp01(t);
  return c * c * c;
}

export interface Point {
  x: number;
  y: number;
}

/** `duration <= 0` (reduced motion) lands on `to` at once. */
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
 * Radial acceleration plus a tangential curl; a node on the centre leaves along
 * `fallbackAngle`, keeping it deterministic.
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
    // Reduced motion goes straight off screen.
    const r = dist + reach;
    return { x: center.x + Math.cos(baseAngle) * r, y: center.y + Math.sin(baseAngle) * r };
  }
  const e = easeInCubic(elapsed / duration);
  const r = dist + reach * e;
  const angle = baseAngle + curl * e;
  return { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r };
}

/** The inverse of `realmInsideFlipDelayFor`: deepest first, the spine last. */
export function realmExitFlipDelayFor(depth: number): number {
  if (depth <= 1) return REALM_EXIT_FLIP_DELAY_STEP_MS * 2;
  if (depth === 2) return REALM_EXIT_FLIP_DELAY_STEP_MS;
  return 0;
}

/** The reverse of `realmWardingDrawProgress`, so the same renderer rewinds the arc. */
export function realmWardingEraseProgress(
  elapsed: number,
  duration: number = REALM_EXIT_WARDING_ERASE_MS,
): number {
  if (duration <= 0) return 0;
  return clamp01(1 - elapsed / duration);
}

/**
 * `easeInCubic(1 - t)`: the reverse of the entry fling, fastest at the start and
 * decelerating into the landing.
 */
export function realmOutsideReturnReach(
  elapsed: number,
  duration: number = REALM_EXIT_OUTSIDE_RETURN_MS,
): number {
  if (duration <= 0) return 0;
  return easeInCubic(1 - clamp01(elapsed / duration));
}

/**
 * `1 - realmOutsideReturnReach`, so a returning node materialises instead of popping in at
 * full alpha the frame it stops being culled.
 */
export function realmOutsideReturnAlpha(
  elapsed: number,
  duration: number = REALM_EXIT_OUTSIDE_RETURN_MS,
): number {
  return 1 - realmOutsideReturnReach(elapsed, duration);
}

/**
 * `from` is home, where the entry fling started; the radius and curl rewind to land
 * exactly there. `duration <= 0` goes home at once.
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

/** Drives the stroke-dash offset. */
export function realmWardingDrawProgress(
  elapsed: number,
  duration: number = REALM_WARDING_DRAW_MS,
): number {
  if (duration <= 0) return 1;
  return clamp01(elapsed / duration);
}

/**
 * Half a sine period, 0 → peak → 0 over `REALM_DUST_SETTLE_MS`, so it never becomes a
 * continuous animation; the caller scales it by layer depth and a travel under 3%.
 */
export function realmDustParallaxFactor(
  elapsed: number,
  duration: number = REALM_DUST_SETTLE_MS,
): number {
  if (duration <= 0 || elapsed <= 0 || elapsed >= duration) return 0;
  return Math.sin(Math.PI * (elapsed / duration));
}
