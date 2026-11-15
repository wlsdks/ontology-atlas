import { DOME_PLANE } from './cone-layout';
import type { DomeCoord, DomeModel } from './types';

/**
 * Smaller is a wider lens. 760 gives a near/far scale ratio of 1.42/0.77 = 1.84 on the
 * bottom ring, enough to read front from back and to grow a node rotating forward; below
 * 500 the ring's near arc leaves the screen.
 */
export const DOME_FOCAL = 760;

/** The denominator of the world scale. */
export const DOME_FIT_RADIUS = DOME_PLANE.element.r;

/** Beyond it direction is kept and length clamped. */
const DOME_DRAG_MAX_RADIUS = DOME_FIT_RADIUS * 1.5;

/**
 * Keeps the solution from flipping behind the camera as the pointer crosses the plane's
 * horizon (`solveDomePlanePoint`); far below `F·sin(pitch)`, so normal solutions are untouched.
 */
const DOME_PLANE_SOLVE_DENOM_MIN = 30;

/**
 * The fit solves from node centres (`domeWorldBounds`) before a drawn frame exists, so it
 * reserves one symmetric allowance sized to the silhouette's edge discs, not its apex.
 */
export const DOME_NODE_FIT_ALLOWANCE_PX = 12;

/**
 * On the object a drag rotates, off it the map pans, as in 2D; no mode or modifier. The
 * test is the ellipse inscribed in the drawn bbox, since the bbox corners are empty screen
 * that would rotate. 1.08 is the least margin covering the outermost disc and its
 * selection ring.
 */
export const DOME_GRIP_MARGIN = 1.08;

/**
 * The `bounds` argument is `DomeRuntime.drawnBounds`. With none (2D, or before assembly) it is false,
 * so the default pan wins.
 */
export function isInsideDomeGrip(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  worldX: number,
  worldY: number,
  margin = DOME_GRIP_MARGIN,
): boolean {
  if (bounds === null) return false;
  const halfW = ((bounds.maxX - bounds.minX) / 2) * margin;
  const halfH = ((bounds.maxY - bounds.minY) / 2) * margin;
  if (halfW <= 0 || halfH <= 0) return false;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const nx = (worldX - cx) / halfW;
  const ny = (worldY - cy) / halfH;
  return nx * nx + ny * ny <= 1;
}

export interface DomeProjection {
  /** The existing camera looks at these. */
  wx: number;
  wy: number;
  /** Weak perspective factor f/(f+z); radii and hit discs multiply by it too. */
  s: number;
  /** Camera-space depth, input to per-frame fog normalisation (`updateDomeFrame`). */
  z: number;
}

export function projectDomeCoord(model: DomeModel, coord: DomeCoord, yaw: number, pitch: number): DomeProjection {
  return projectWithTrig(model, coord, Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch));
}

export function projectWithTrig(
  model: DomeModel,
  coord: DomeCoord,
  cy: number,
  sy: number,
  cp: number,
  sp: number,
): DomeProjection {
  const x = coord.px * cy - coord.pz * sy;
  const zr = coord.px * sy + coord.pz * cy;
  const y2 = coord.py * cp + zr * sp;
  const z2 = -coord.py * sp + zr * cp;
  const s = DOME_FOCAL / (DOME_FOCAL + z2);
  return {
    wx: model.centerX + x * s * model.unit,
    wy: model.centerY - y2 * s * model.unit,
    s,
    z: z2,
  };
}

/**
 * Closed-form back-projection onto the plane at height py, so a dragged node stays on its
 * kind plane.
 */
export function solveDomePlanePoint(
  model: DomeModel,
  planeY: number,
  wx: number,
  wy: number,
  yaw: number,
  pitch: number,
): { px: number; pz: number } | null {
  const ux = (wx - model.centerX) / model.unit;
  const uy = (wy - model.centerY) / model.unit;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Solve uy = −(py·cp + zr·sp)·s, s = F/(F + (−py·sp + zr·cp)) for zr. Near the plane's
  // horizon denom → 0 and past it the solution flips behind the camera, so the magnitude is
  // floored on the side the viewpoint expects (the sign of sp): the node slides out to the
  // radius cap instead of freezing, from above or below.
  const rawDenom = DOME_FOCAL * sp + uy * cp;
  const denom =
    sp >= 0
      ? Math.max(rawDenom, DOME_PLANE_SOLVE_DENOM_MIN)
      : Math.min(rawDenom, -DOME_PLANE_SOLVE_DENOM_MIN);
  const zr = -(uy * (DOME_FOCAL - planeY * sp) + DOME_FOCAL * planeY * cp) / denom;
  const z2 = -planeY * sp + zr * cp;
  const s = DOME_FOCAL / Math.max(DOME_FOCAL + z2, DOME_FOCAL * 0.05);
  if (!Number.isFinite(s) || !Number.isFinite(zr)) return null;
  const x = ux / s;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  let px = x * cy + zr * sy;
  let pz = -x * sy + zr * cy;
  const r = Math.hypot(px, pz);
  if (r > DOME_DRAG_MAX_RADIUS) {
    const k = DOME_DRAG_MAX_RADIUS / r;
    px *= k;
    pz *= k;
  }
  return { px, pz };
}

/** Input to 3D fit view. */
export function domeWorldBounds(
  model: DomeModel,
  yaw: number,
  pitch: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const coord of model.coords.values()) {
    const p = projectDomeCoord(model, coord, yaw, pitch);
    if (p.wx < minX) minX = p.wx;
    if (p.wx > maxX) maxX = p.wx;
    if (p.wy < minY) minY = p.wy;
    if (p.wy > maxY) maxY = p.wy;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * The `allowancePx` argument pads each centre by its disc. The 3D fit asks it of the right-edge chrome
 * before the drawing uses that column.
 */
export function domeReachesRect(
  model: DomeModel,
  yaw: number,
  pitch: number,
  target: { tx: number; ty: number; tscale: number },
  viewportWidth: number,
  viewportHeight: number,
  rect: { left: number; right: number; top: number; bottom: number },
  allowancePx: number,
): boolean {
  for (const coord of model.coords.values()) {
    const p = projectDomeCoord(model, coord, yaw, pitch);
    const x = (p.wx - target.tx) * target.tscale + viewportWidth / 2;
    const y = (p.wy - target.ty) * target.tscale + viewportHeight / 2;
    if (
      x + allowancePx > rect.left &&
      x - allowancePx < rect.right &&
      y + allowancePx > rect.top &&
      y - allowancePx < rect.bottom
    ) {
      return true;
    }
  }
  return false;
}

/** Ids missing from the model are skipped. */
export function domeEgoWorldBounds(
  model: DomeModel,
  ids: Iterable<string>,
  yaw: number,
  pitch: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const coord = model.coords.get(id);
    if (!coord) continue;
    const p = projectDomeCoord(model, coord, yaw, pitch);
    if (p.wx < minX) minX = p.wx;
    if (p.wx > maxX) maxX = p.wx;
    if (p.wy < minY) minY = p.wy;
    if (p.wy > maxY) maxY = p.wy;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}
