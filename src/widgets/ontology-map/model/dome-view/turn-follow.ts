import { DOME_FOCAL, domeWorldBounds, projectWithTrig } from './projection';
import type { DomeCoord, DomeModel } from './types';

type CameraPose = { tx: number; ty: number; tscale: number };

/** Yaws a turn-following zoom samples over a whole turn; linear interpolation fills between them. */
const DOME_TURN_SAMPLES = 360;

/**
 * How far the node centres reach from a fixed pivot at each sampled yaw (world units, left/right/up/down),
 * a bound on how fast a reach changes per radian of turn, and the fit's free half-size round the pivot (px).
 */
export interface DomeTurnReach {
  restYaw: number;
  pivotX: number;
  pivotY: number;
  reach: Float64Array;
  slope: number;
  freeHalfW: number;
  freeHalfH: number;
}

/** `domeWorldBounds` with the turn's trig taken once: the reach table's inner loop. O(N). */
function turnedBounds(model: DomeModel, coords: readonly DomeCoord[], yaw: number, cp: number, sp: number) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of coords) {
    const p = projectWithTrig(model, c, cy, sy, cp, sp);
    minX = Math.min(minX, p.wx);
    maxX = Math.max(maxX, p.wx);
    minY = Math.min(minY, p.wy);
    maxY = Math.max(maxY, p.wy);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Neural's reach table for the turn-following zoom, built once per fit: O(DOME_TURN_SAMPLES · N).
 * Sample 0 is the fit's own yaw, so a lookup there is the rest bounds exactly.
 */
export function domeTurnReach(
  model: DomeModel,
  restYaw: number,
  pitch: number,
  free: { halfW: number; halfH: number },
): DomeTurnReach | null {
  const rest = domeWorldBounds(model, restYaw, pitch);
  if (rest === null) return null;
  const pivotX = (rest.minX + rest.maxX) / 2;
  const pivotY = (rest.minY + rest.maxY) / 2;
  const reach = new Float64Array(DOME_TURN_SAMPLES * 4);
  const coords = [...model.coords.values()];
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  for (let k = 0; k < DOME_TURN_SAMPLES; k += 1) {
    const b = k === 0 ? rest : turnedBounds(model, coords, restYaw + (k * 2 * Math.PI) / DOME_TURN_SAMPLES, cp, sp);
    reach.set([pivotX - b.minX, b.maxX - pivotX, pivotY - b.minY, b.maxY - pivotY], k * 4);
  }
  let rho = 0;
  let r3 = 0;
  for (const c of model.coords.values()) {
    rho = Math.max(rho, Math.hypot(c.px, c.pz));
    r3 = Math.max(r3, Math.hypot(c.px, c.py, c.pz));
  }
  // d(x·s)/dθ ≤ ρ·s·(1 + ρ·s/F) with s ≤ F/(F − r): a Lipschitz bound on every projected reach.
  const sMax = DOME_FOCAL / Math.max(DOME_FOCAL - r3, DOME_FOCAL * 0.05);
  const slope = rho * sMax * (1 + (rho * sMax) / DOME_FOCAL) * model.unit;
  return { restYaw, pivotX, pivotY, reach, slope, freeHalfW: free.halfW, freeHalfH: free.halfH };
}

/**
 * The reach at `yaw`, O(1): linear between samples, padded by 2·slope·Δ·f(1−f), which bounds a
 * Lipschitz function's interpolation error, so it is continuous, exact at samples and never short.
 */
export function domeTurnReachAt(table: DomeTurnReach, yaw: number): [number, number, number, number] {
  const step = (2 * Math.PI) / DOME_TURN_SAMPLES;
  const turn = (((yaw - table.restYaw) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const k = Math.min(DOME_TURN_SAMPLES - 1, Math.floor(turn / step));
  const f = turn / step - k;
  const a = k * 4;
  const b = ((k + 1) % DOME_TURN_SAMPLES) * 4;
  const pad = 2 * table.slope * step * f * (1 - f);
  const r = table.reach;
  return [0, 1, 2, 3].map((i) => r[a + i] + (r[b + i] - r[a + i]) * f + pad) as [number, number, number, number];
}

/**
 * The camera at `yaw` while it still holds the fit: the pivot keeps its screen point and the zoom is
 * the largest that keeps the reach inside the fit's free area, never above the fit's own. A pure
 * function of yaw, so turning back to the fit's yaw returns the fit exactly. O(1).
 */
export function domeTurnFollowTarget(
  fit: { tx: number; ty: number; tscale: number },
  table: DomeTurnReach,
  yaw: number,
): { tx: number; ty: number; tscale: number } {
  const ratio = (r: readonly number[]) =>
    Math.min(table.freeHalfW / Math.max(r[0], r[1], 1e-6), table.freeHalfH / Math.max(r[2], r[3], 1e-6));
  const tscale = fit.tscale * Math.min(1, ratio(domeTurnReachAt(table, yaw)) / ratio(domeTurnReachAt(table, table.restYaw)));
  if (tscale === fit.tscale) return { tx: fit.tx, ty: fit.ty, tscale };
  return {
    tx: table.pivotX - ((table.pivotX - fit.tx) * fit.tscale) / tscale,
    ty: table.pivotY - ((table.pivotY - fit.ty) * fit.tscale) / tscale,
    tscale,
  };
}

/**
 * One frame of Neural's turn-following zoom, O(1). While the camera holds the fit (or the pose a turn
 * last set from it) it returns the camera for `yaw`, carrying the fit's free area so a focus leash
 * measures from it too; a camera anywhere else means the person zoomed or panned, which ends following
 * until the camera is back on the fit at the fit's own yaw.
 */
export function followTurnWithZoom<F extends CameraPose & { turn?: DomeTurnReach; freeArea?: unknown }>(
  rest: { target: F; yaw: number; followed?: CameraPose | null },
  camera: CameraPose,
  yaw: number,
): (CameraPose & Pick<F, "freeArea">) | null {
  const table = rest.target.turn;
  if (table === undefined) return null;
  const holds = (pose: CameraPose) =>
    Math.abs(camera.tx - pose.tx) < 0.01 && Math.abs(camera.ty - pose.ty) < 0.01 && Math.abs(camera.tscale - pose.tscale) < 1e-4;
  if (rest.followed === undefined && holds(rest.target) && Math.abs(yaw - rest.yaw) < 1e-3) rest.followed = null;
  if (rest.followed === undefined) return null;
  if (!holds(rest.followed ?? rest.target)) {
    rest.followed = undefined;
    return null;
  }
  const next = { ...domeTurnFollowTarget(rest.target, table, yaw), freeArea: rest.target.freeArea };
  rest.followed = next;
  return next.tx === camera.tx && next.ty === camera.ty && next.tscale === camera.tscale ? null : next;
}
