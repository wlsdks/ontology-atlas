import { DOME_PLANE, TAU } from './cone-layout';
import { MOMENTUM_TAU_MS } from '../motion-physics';
import type { DomeCoord, DomeModel, DomeViewKind } from './types';

/** Idle spin: one turn per 48 s. */
export const DOME_PERIOD_MS = 48000;
/** Steep enough that the small base circles under each parent read as circles, not lines. */
export const DOME_PITCH_DEFAULT = 0.5;
/**
 * Pitch stays between 0.15 and 0.95 rad, always looking down: from below a tier disc reverses
 * the level order, edge-on the discs collapse into one line, and near the top the height
 * that carries the tier is lost. `resistDomePitch` gives the walls a rubber band. Dissent is
 * in the decision fragment "The 3D map drops the Cone".
 */
export const DOME_PITCH_MAX = 0.95;
export const DOME_PITCH_MIN = 0.15;
/**
 * The quarter resistance is linear, so this caps the squash; 0.15 − 0.09 still looks from
 * above, so a pressed wall never shows the planes from underneath.
 */
const DOME_PITCH_OVERSHOOT_CAP = 0.09;

/**
 * Longest programmatic pose move (Home, selection reframe) for up to half a turn; the
 * 420 ms 2D camera cap reads as a whip over that angle.
 */
export const DOME_POSE_MS = 750;
/**
 * Matches three.js OrbitControls' `2π × dx / clientHeight` at a ~900 px canvas (838 px per
 * turn); a constant, so a window resize never changes sensitivity or test results.
 */
export const ORBIT_YAW_PER_PX = 0.0075;
/** Lower than yaw so horizontal stays the primary axis. */
export const ORBIT_PITCH_PER_PX = 0.005;
const ORBIT_VEL_DECAY_PER_MS = Math.exp(-1 / MOMENTUM_TAU_MS);
/**
 * Release projection (Designing Fluid Interfaces, WWDC18 803): compute the natural landing
 * from the release velocity, and only if it is already near a domain meridian re-aim the
 * deceleration there. The window stays narrow, or the app moves the place the person set.
 */
export const ORBIT_SNAP_WINDOW_RAD = 0.14;

export const ORBIT_DECAY_TRAVEL_MS = MOMENTUM_TAU_MS;

export function projectOrbitLanding(yaw: number, yawVel: number): number {
  return yaw + yawVel * ORBIT_DECAY_TRAVEL_MS;
}

/**
 * Past half a turn the person loses which face was in front, so the release velocity is
 * capped to keep the coast within π. The decay stays shared; a drag is never capped.
 */
export const ORBIT_COAST_MAX_RAD = Math.PI;

export function clampOrbitReleaseVelocity(velRadPerMs: number): number {
  const max = ORBIT_COAST_MAX_RAD / ORBIT_DECAY_TRAVEL_MS;
  return Math.max(-max, Math.min(max, velRadPerMs));
}

/** Depth after rotation is `r·sin(θ + yaw)`, minimal at θ + yaw = −π/2, so yaw = −π/2 − θ. */
export function domeFacingYaws(model: DomeModel, kind: DomeViewKind = "domain"): number[] {
  const out: number[] = [];
  const planeR = DOME_PLANE[kind].r;
  for (const coord of model.coords.values()) {
    if (Math.abs(coord.py - DOME_PLANE[kind].y) > 1e-6) continue;
    if (planeR <= 0) continue;
    const theta = Math.atan2(coord.pz, coord.px);
    out.push(-Math.PI / 2 - theta);
  }
  return out.sort((a, b) => a - b);
}

/** Candidates are 2π-periodic, so each folds to the equivalent angle nearest the landing. */
export function snapOrbitLanding(
  landing: number,
  candidates: readonly number[],
  windowRad = ORBIT_SNAP_WINDOW_RAD,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const turns = Math.round((landing - c) / TAU);
    const near = c + turns * TAU;
    const dist = Math.abs(near - landing);
    if (dist < bestDist) {
      bestDist = dist;
      best = near;
    }
  }
  return best !== null && bestDist <= windowRad ? best : null;
}

/**
 * Derived as `τ = (target − yaw)/yawVel`, so the approach starts at the release velocity; a fixed τ
 * makes speed jump when the hand lifts. Clamped: too short teleports, too long never stops.
 */
export const ORBIT_SNAP_TAU_MIN_MS = 90;
/** Short enough that the worst case falls inside `ORBIT_SNAP_ARRIVE_RAD` within 2 s. */
export const ORBIT_SNAP_TAU_MAX_MS = 320;

/**
 * On the outer ring 1 px ≈ 0.008 rad; this is half. Exponential approach never arrives, so
 * without it the loop stays awake forever.
 */
export const ORBIT_SNAP_ARRIVE_RAD = 0.004;

export function orbitSnapTauMs(delta: number, yawVel: number): number {
  if (Math.abs(yawVel) < 1e-9) return ORBIT_SNAP_TAU_MAX_MS;
  const tau = delta / yawVel;
  if (!Number.isFinite(tau) || tau <= 0) return ORBIT_SNAP_TAU_MAX_MS;
  return Math.min(ORBIT_SNAP_TAU_MAX_MS, Math.max(ORBIT_SNAP_TAU_MIN_MS, tau));
}

/** Below this |yawVel| (rad/ms) the coast snaps to 0, or its tail never ends. */
const ORBIT_VEL_EPS = 0.000005;

/** Keeps it from collapsing to edge-on or plan view. */
export function clampDomePitch(pitch: number): number {
  return Math.min(DOME_PITCH_MAX, Math.max(DOME_PITCH_MIN, pitch));
}

/**
 * Past the limit at quarter resistance, like iOS scroll bounds; on release the loop returns
 * exponentially to `clampDomePitch`.
 */
export function resistDomePitch(pitch: number): number {
  if (pitch > DOME_PITCH_MAX)
    return DOME_PITCH_MAX + Math.min(DOME_PITCH_OVERSHOOT_CAP, (pitch - DOME_PITCH_MAX) * 0.25);
  if (pitch < DOME_PITCH_MIN)
    return DOME_PITCH_MIN - Math.min(DOME_PITCH_OVERSHOOT_CAP, (DOME_PITCH_MIN - pitch) * 0.25);
  return pitch;
}

/** Geometric decay per ms, so the feel is dt-independent. */
export function decayOrbitVelocity(velRadPerMs: number, dtMs: number): number {
  const v = velRadPerMs * Math.pow(ORBIT_VEL_DECAY_PER_MS, dtMs);
  return Math.abs(v) < ORBIT_VEL_EPS ? 0 : v;
}

/**
 * Semi-implicit critically damped spring, so a dragged node follows as if it had mass and
 * settles on the last pointer target. `angFreq` is `--map-camera-spring-angfreq-interactive`.
 */
export interface DomeDragSpring {
  px: number;
  pz: number;
  vx: number;
  vz: number;
}

export function stepDomeDragSpring(
  spring: DomeDragSpring,
  targetPx: number,
  targetPz: number,
  dtMs: number,
  angFreq: number,
): void {
  const dt = Math.min(dtMs, 64) / 1000;
  const ax = angFreq * angFreq * (targetPx - spring.px) - 2 * angFreq * spring.vx;
  const az = angFreq * angFreq * (targetPz - spring.pz) - 2 * angFreq * spring.vz;
  spring.vx += ax * dt;
  spring.vz += az * dt;
  spring.px += spring.vx * dt;
  spring.pz += spring.vz * dt;
}

/** Keeps a programmatic rotation from taking the long way round. */
export function domeNearestYawTurn(target: number, current: number): number {
  return target + Math.round((current - target) / TAU) * TAU;
}

/**
 * Brings the node to the front, where depth `r·sin(yaw + θ)` is minimal (yaw + θ = −π/2),
 * the short way. A far-side node would otherwise grow under zoom yet stay hidden.
 */
export function domeFocusYaw(coord: DomeCoord, currentYaw: number): number {
  const r = Math.hypot(coord.px, coord.pz);
  // On the axis there is no bearing and no reason to rotate.
  if (r < 1e-6) return currentYaw;
  const theta = Math.atan2(coord.pz, coord.px);
  return domeNearestYawTurn(-Math.PI / 2 - theta, currentYaw);
}
