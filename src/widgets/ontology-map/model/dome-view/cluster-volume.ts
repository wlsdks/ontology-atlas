import { DOME_FIT_RADIUS, DOME_FOCAL } from './projection';

/** A cluster's radius in cloud units: room for its heart plus the square root of its members. */
const CLUSTER_RADIUS_BASE = 12;
const CLUSTER_RADIUS_GAIN = 15;
/** The empty band left between two neighbouring clusters, in cloud units. */
export const CLUSTER_GAP = 20;
/** A title's height as a share of the cloud's rest-pose height: its 65 px of the 708 a 1440 by 900 window leaves free. */
export const CLUSTER_TITLE_SHARE = 0.092;
/**
 * The title band, the pack's height and the lens settle in this many passes. Packing is discrete,
 * so later passes, never narrowing the band, stop at the first whose height leaves it whole.
 */
const SETTLE_PASSES = 3;
const SETTLE_PASSES_MAX = 6;
/** The lens a pack is drawn with and the one its normalisation implies settle in this many passes. */
const LENS_PASSES = 3;
/** The window's free area is wider than tall, so the pack grows sideways first. */
const PACK_ASPECT = 1.7;
/** Candidate positions round each placed cluster. */
const PACK_DIRECTIONS = 24;
/** Depth spans this share of the pack's drawn height: deep enough that turning shows parallax, shallow enough that far clusters stay legible. */
const CLUSTER_DEPTH_SHARE = 0.8;
const DEPTH_LEVELS = 7;
const MIDDLE_LEVEL = (DEPTH_LEVELS - 1) / 2;
/** Clusters whose drawn centres lie within this many pair distances are screen neighbours and stand at different depths. */
const NEIGHBOUR_REACH = 1.6;
/** Rounding allowance on the clearing test, so a candidate touching its generator counts as clear. */
const CLEAR_EPSILON = 1e-9;

interface Point3 {
  x: number;
  y: number;
  z: number;
}

export function clusterRadius(members: number): number {
  return CLUSTER_RADIUS_BASE + CLUSTER_RADIUS_GAIN * Math.sqrt(Math.max(0, members));
}

/** Two discs `pair` apart side by side clear each other, one above the other they also leave `band`. */
function clears(dx: number, dy: number, pair: number, band: number): boolean {
  const u = dx / pair;
  const v = dy / (pair + band);
  return u * u + v * v >= 1 - CLEAR_EPSILON;
}

/**
 * Discs packed in the rest pose's screen plane, the first at the origin and each next one touching
 * a placed disc where it lies nearest the origin under the pack's aspect. A uniform grid keeps
 * each validity test O(1), so a pass is O(k² · PACK_DIRECTIONS) for k discs.
 */
function packDiscs(reach: readonly number[], order: readonly number[], gap: number, band: number): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(reach.length);
  const y = new Float64Array(reach.length);
  const cellX = 2 * Math.max(...reach) + gap;
  const cellY = cellX + band;
  const grid = new Map<number, number[]>();
  const keyOf = (gx: number, gy: number) => (gx + 32768) * 65536 + (gy + 32768);
  const insert = (i: number) => {
    const key = keyOf(Math.floor(x[i] / cellX), Math.floor(y[i] / cellY));
    const bucket = grid.get(key);
    if (bucket) bucket.push(i); else grid.set(key, [i]);
  };
  // Neighbouring candidates are mostly blocked by the same disc, so it is tried first.
  let blocker = -1;
  const isClear = (c: number, cx: number, cy: number) => {
    if (blocker >= 0 && !clears(cx - x[blocker], cy - y[blocker], reach[blocker] + reach[c] + gap, band)) return false;
    const gx = Math.floor(cx / cellX);
    const gy = Math.floor(cy / cellY);
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        const bucket = grid.get(keyOf(gx + ox, gy + oy));
        if (bucket === undefined) continue;
        for (const q of bucket) {
          if (clears(cx - x[q], cy - y[q], reach[q] + reach[c] + gap, band)) continue;
          blocker = q;
          return false;
        }
      }
    }
    return true;
  };
  const ux = Array.from({ length: PACK_DIRECTIONS }, (_, d) => Math.cos((d * 2 * Math.PI) / PACK_DIRECTIONS));
  const uy = Array.from({ length: PACK_DIRECTIONS }, (_, d) => Math.sin((d * 2 * Math.PI) / PACK_DIRECTIONS));
  // A candidate blocked for a radius stays blocked for it, since placing only adds discs.
  const blockedFor = new Float64Array(reach.length).fill(-1);
  const blocked = new Int32Array(reach.length);
  const allBlocked = (1 << PACK_DIRECTIONS) - 1;
  insert(order[0]);
  for (let k = 1; k < order.length; k += 1) {
    const c = order[k];
    let bestX = 0;
    let bestY = 0;
    let bestScore = Infinity;
    for (let j = 0; j < k; j += 1) {
      const p = order[j];
      if (blockedFor[p] !== reach[c]) {
        blockedFor[p] = reach[c];
        blocked[p] = 0;
      }
      if (blocked[p] === allBlocked) continue;
      const pair = reach[p] + reach[c] + gap;
      const nearest = Math.max(0, Math.sqrt((x[p] * x[p]) / (PACK_ASPECT * PACK_ASPECT) + y[p] * y[p]) - pair - band);
      if (nearest * nearest >= bestScore) continue;
      for (let d = 0; d < PACK_DIRECTIONS; d += 1) {
        if (blocked[p] & (1 << d)) continue;
        const u = ux[d] / pair;
        const v = uy[d] / (pair + band);
        const t = 1 / Math.sqrt(u * u + v * v);
        const cx = x[p] + ux[d] * t;
        const cy = y[p] + uy[d] * t;
        const score = (cx * cx) / (PACK_ASPECT * PACK_ASPECT) + cy * cy;
        if (score >= bestScore) continue;
        if (!isClear(c, cx, cy)) {
          blocked[p] |= 1 << d;
          continue;
        }
        bestX = cx;
        bestY = cy;
        bestScore = score;
      }
    }
    x[c] = bestX;
    y[c] = bestY;
    insert(c);
  }
  return { x, y };
}

/**
 * Depth levels in placement order: each takes the level farthest from its screen neighbours',
 * then the one keeping the depths' sum nearest zero, then the nearer. O(k²).
 */
function depthLevels(reach: readonly number[], order: readonly number[], x: Float64Array, y: Float64Array, gap: number, loose: number | null): Int32Array {
  const level = new Int32Array(reach.length);
  let sum = 0;
  for (let k = 0; k < order.length; k += 1) {
    const c = order[k];
    if (c === loose) {
      level[c] = MIDDLE_LEVEL;
      continue;
    }
    if (k === (loose === null ? 0 : 1)) {
      level[c] = 1;
      sum += 1 - MIDDLE_LEVEL;
      continue;
    }
    const neighbourLevels: number[] = [];
    for (let j = 0; j < k; j += 1) {
      const q = order[j];
      const dx = x[c] - x[q];
      const dy = y[c] - y[q];
      const near = NEIGHBOUR_REACH * (reach[c] + reach[q] + gap);
      if (dx * dx + dy * dy < near * near) neighbourLevels.push(level[q]);
    }
    let best = 0;
    let bestApart = -1;
    let bestSum = Infinity;
    for (let l = 0; l < DEPTH_LEVELS; l += 1) {
      let apart = Infinity;
      for (const other of neighbourLevels) apart = Math.min(apart, Math.abs(l - other));
      const balance = Math.abs(sum + l - MIDDLE_LEVEL);
      if (apart > bestApart || (apart === bestApart && balance < bestSum)) {
        best = l;
        bestApart = apart;
        bestSum = balance;
      }
    }
    level[c] = best;
    sum += best - MIDDLE_LEVEL;
  }
  return level;
}

/**
 * One pass: pack, give depths, centre the drawn box and back-project through the rest pose.
 * `focal` is the lens in cloud units, the cloud being normalised to `DOME_FIT_RADIUS` later.
 */
function arrange(
  radii: readonly number[],
  order: readonly number[],
  loose: number | null,
  restYaw: number,
  pitch: number,
  gap: number,
  band: number,
  depthHalf: number,
  focal: number,
): { points: Point3[]; height: number; focal: number } {
  const nearGrowth = Number.isFinite(focal) ? focal / (focal - depthHalf) : 1;
  const reach = radii.map((r) => r * nearGrowth);
  const { x, y } = packDiscs(reach, order, gap, band);
  const level = depthLevels(reach, order, x, y, gap, loose);
  const depth = Array.from(level, (l) => depthHalf * (l / MIDDLE_LEVEL - 1));
  let drawn = backProject(radii, x, y, depth, focal, restYaw, pitch);
  for (let pass = 0; pass < LENS_PASSES; pass += 1) drawn = backProject(radii, x, y, depth, drawn.focal, restYaw, pitch);
  return drawn;
}

/**
 * World points drawn at pack `(x, y)` and camera depth `depth` through the rest pose with `focal`,
 * the drawn box centred, and the focal their own normalisation implies. O(k).
 */
function backProject(
  radii: readonly number[],
  x: Float64Array,
  y: Float64Array,
  depth: readonly number[],
  focal: number,
  restYaw: number,
  pitch: number,
): { points: Point3[]; height: number; focal: number } {
  const scale = depth.map((z) => (Number.isFinite(focal) ? focal / (focal + z) : 1));
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  radii.forEach((r, i) => {
    left = Math.min(left, x[i] - r * scale[i]);
    right = Math.max(right, x[i] + r * scale[i]);
    bottom = Math.min(bottom, y[i] - r * scale[i]);
    top = Math.max(top, y[i] + r * scale[i]);
  });
  const midX = (left + right) / 2;
  const midY = (bottom + top) / 2;
  const [cy, sy, cp, sp] = [Math.cos(restYaw), Math.sin(restYaw), Math.cos(pitch), Math.sin(pitch)];
  let farthest = 0;
  const points = radii.map((r, i) => {
    const camX = (x[i] - midX) / scale[i];
    const camY = (y[i] - midY) / scale[i];
    const camZ = depth[i];
    const zr = camY * sp + camZ * cp;
    const point = { x: camX * cy + zr * sy, y: camY * cp - camZ * sp, z: -camX * sy + zr * cy };
    farthest = Math.max(farthest, Math.hypot(point.x, point.y, point.z) + r);
    return point;
  });
  return { points, height: top - bottom, focal: (DOME_FOCAL * farthest) / DOME_FIT_RADIUS };
}

/**
 * Cluster centres filling a volume: packed `gap` apart where the rest pose draws them, with room for
 * a title above each, then set at depth levels that differ between screen neighbours. A loose group
 * of `centreRadius` sits first, at the pack's centre. Turning may bring two clusters across each other.
 * O(k² · PACK_DIRECTIONS) per pass; 200 clusters took 18-21 ms on an M-series Mac (2026-11-15), budget 50 ms.
 */
export function clusterVolumeAnchors(
  radii: readonly number[],
  restYaw: number,
  pitch: number,
  centreRadius = 0,
  gap = CLUSTER_GAP,
): { anchors: Point3[]; centre: Point3 } {
  if (radii.length === 0) return { anchors: [], centre: { x: 0, y: 0, z: 0 } };
  const loose = centreRadius > 0 ? radii.length : null;
  const all = loose === null ? [...radii] : [...radii, centreRadius];
  const bySize = radii.map((_, i) => i).sort((a, b) => radii[b] - radii[a] || a - b);
  const order = loose === null ? bySize : [loose, ...bySize];
  let placed = arrange(all, order, loose, restYaw, pitch, gap, 0, 0, Infinity);
  let band = 0;
  for (let pass = 0; pass < SETTLE_PASSES_MAX; pass += 1) {
    band = Math.max(band, CLUSTER_TITLE_SHARE * placed.height);
    placed = arrange(all, order, loose, restYaw, pitch, gap, band, (CLUSTER_DEPTH_SHARE * placed.height) / 2, placed.focal);
    if (pass >= SETTLE_PASSES - 1 && CLUSTER_TITLE_SHARE * placed.height <= band) break;
  }
  const anchors = placed.points.slice(0, radii.length);
  return { anchors, centre: loose === null ? { x: 0, y: 0, z: 0 } : placed.points[loose] };
}
