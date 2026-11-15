import { DOME_FIT_RADIUS, DOME_FOCAL } from './projection';

/** A cluster's radius in cloud units: room for its heart plus the square root of its members. */
const CLUSTER_RADIUS_BASE = 12;
const CLUSTER_RADIUS_GAIN = 15;
/** The empty band left between two neighbouring clusters, in cloud units. */
export const CLUSTER_GAP = 20;
/** A title's height as a share of the cloud's rest-pose height: its 65 px of the 708 a 1440 by 900 window leaves free. */
export const CLUSTER_TITLE_SHARE = 0.092;
/** A title box is about this many times as wide as it is tall: a domain name over its counts. */
export const CLUSTER_TITLE_ASPECT = 2.4;
/**
 * The title band, the pack's height and the lens settle in this many passes. Packing is discrete,
 * so later passes, never narrowing the band, stop at the first whose height leaves it whole.
 */
const SETTLE_PASSES = 3;
const SETTLE_PASSES_MAX = 6;
/**
 * Past about forty clusters the rows' titles outgrow the window and the band would grow without
 * end, so it stops at this many largest-cluster radii; titles that then collide give way when drawn.
 */
const TITLE_BAND_CAP = 1.5;
/** The lens a pack is drawn with and the one its normalisation implies settle in this many passes. */
const LENS_PASSES = 3;
/**
 * The fit frames a whole turn, so a wide pack buys nothing; at 1.7 four titled clusters fall
 * into one flat row, and rounder than 1.4 the title band no longer settles clear at 30 clusters.
 */
const PACK_ASPECT_WIDE = 1.4;
/** Four like clusters packed wide stand three in a row over one, a quarter of the pack bare; packed round they stand two by two. */
const PACK_ASPECT_ROUND = 1;
/** A quarter of the pack's box holding less than this share of the clusters' area reads as a hole. */
const BARE_QUARTER_SHARE = 0.05;
const QUARTER_SAMPLES = 32;
/** Candidate positions round each placed cluster. */
const PACK_DIRECTIONS = 24;
/** Depth spans this share of the pack's drawn height: deep enough that turning shows parallax, shallow enough that far clusters stay legible. */
const CLUSTER_DEPTH_SHARE = 0.8;
const DEPTH_LEVELS = 7;
const MIDDLE_LEVEL = (DEPTH_LEVELS - 1) / 2;
/** Neighbours this many levels apart already read as near and far, so the rest of the levels get used. */
const DEPTH_APART_ENOUGH = 2;
/** Clusters whose drawn centres lie within this many pair distances are screen neighbours and stand at different depths. */
const NEIGHBOUR_REACH = 1.6;
/** A touching candidate steps this share further out, so rounding never counts it as overlapping. */
const CLEAR_EPSILON = 1e-9;

interface Point3 {
  x: number;
  y: number;
  z: number;
}

export function clusterRadius(members: number): number {
  return CLUSTER_RADIUS_BASE + CLUSTER_RADIUS_GAIN * Math.sqrt(Math.max(0, members));
}

/** A cluster as the packer sees it: its disc and, when it has one, the title box standing on it. */
interface Footprint {
  r: number;
  /** The title box's half width; 0 for the loose group, which has no title. */
  w: number;
  /** The title's lowest foot above the centre: on a far cluster's smaller drawn disc. */
  base: number;
}

function boxDiscDistanceSq(x0: number, x1: number, y0: number, y1: number, px: number, py: number): number {
  const nx = Math.min(Math.max(px, x0), x1);
  const ny = Math.min(Math.max(py, y0), y1);
  return (px - nx) ** 2 + (py - ny) ** 2;
}

/**
 * Whether cluster `c`, `(dx, dy)` from cluster `q`, leaves `gap` between their discs, between
 * either title box (`band` tall, on its disc) and the other disc, and between the two titles.
 */
function clears(dx: number, dy: number, c: Footprint, q: Footprint, gap: number, band: number): boolean {
  if (dx * dx + dy * dy < (c.r + q.r + gap) ** 2) return false;
  if (c.w > 0 && boxDiscDistanceSq(dx - c.w, dx + c.w, dy + c.base, dy + c.r + band, 0, 0) < (q.r + gap) ** 2) return false;
  if (q.w > 0 && boxDiscDistanceSq(-q.w, q.w, q.base, q.r + band, dx, dy) < (c.r + gap) ** 2) return false;
  return !(c.w > 0 && q.w > 0 && Math.abs(dx) < c.w + q.w + gap && dy + c.base < q.r + band + gap && dy + c.r + band > q.base - gap);
}

/** The parameter interval where a ray from the origin along `u` lies within `[lo, hi]` on one axis. */
function slab(lo: number, hi: number, u: number, out: Float64Array): boolean {
  if (Math.abs(u) < 1e-12) return lo <= 0 && hi >= 0;
  const a = lo / u;
  const b = hi / u;
  out[0] = Math.max(out[0], Math.min(a, b));
  out[1] = Math.min(out[1], Math.max(a, b));
  return true;
}

const span = new Float64Array(2);

/** Where a ray from the origin along `(ux, uy)` leaves a box, or -Infinity when it misses it. */
function boxExit(x0: number, x1: number, y0: number, y1: number, ux: number, uy: number): number {
  span[0] = -Infinity;
  span[1] = Infinity;
  if (!slab(x0, x1, ux, span) || !slab(y0, y1, uy, span)) return -Infinity;
  return span[1] >= Math.max(span[0], 0) ? span[1] : -Infinity;
}

/** Where a ray from the origin along unit `(ux, uy)` leaves a disc, or -Infinity when it misses it. */
function discExit(cx: number, cy: number, r: number, ux: number, uy: number): number {
  const along = cx * ux + cy * uy;
  const disc = along * along - (cx * cx + cy * cy) + r * r;
  return disc < 0 ? -Infinity : along + Math.sqrt(disc);
}

/** Where a ray leaves a box widened by `r` on every side with rounded corners. */
function roundedBoxExit(x0: number, x1: number, y0: number, y1: number, r: number, ux: number, uy: number): number {
  return Math.max(
    boxExit(x0 - r, x1 + r, y0, y1, ux, uy),
    boxExit(x0, x1, y0 - r, y1 + r, ux, uy),
    discExit(x0, y0, r, ux, uy),
    discExit(x1, y0, r, ux, uy),
    discExit(x0, y1, r, ux, uy),
    discExit(x1, y1, r, ux, uy),
  );
}

/**
 * How far from `q` along unit `(ux, uy)` cluster `c` first clears it: the farthest exit of the
 * regions `clears` forbids, each convex, so a ray leaves each once. O(1).
 */
function touchingDistance(ux: number, uy: number, c: Footprint, q: Footprint, gap: number, band: number): number {
  let t = c.r + q.r + gap;
  if (c.w > 0) t = Math.max(t, roundedBoxExit(-c.w, c.w, -c.r - band, -c.base, q.r + gap, ux, uy));
  if (q.w > 0) t = Math.max(t, roundedBoxExit(-q.w, q.w, q.base, q.r + band, c.r + gap, ux, uy));
  if (c.w > 0 && q.w > 0) {
    const half = c.w + q.w + gap;
    t = Math.max(t, boxExit(-half, half, q.base - c.r - band - gap, q.r + band - c.base + gap, ux, uy));
  }
  return t * (1 + CLEAR_EPSILON);
}

/**
 * Discs packed in the rest pose's screen plane, the first at the origin and each next one touching
 * a placed disc where it lies nearest the origin under `aspect`. A uniform grid keeps
 * each validity test O(1), so a pass is O(k² · PACK_DIRECTIONS) for k discs.
 */
function packDiscs(shapes: readonly Footprint[], order: readonly number[], gap: number, band: number, aspect: number): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(shapes.length);
  const y = new Float64Array(shapes.length);
  const widest = Math.max(...shapes.map((s) => Math.max(s.r, s.w)));
  const cellX = 2 * widest + gap;
  const cellY = 2 * widest + band + gap;
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
    if (blocker >= 0 && !clears(cx - x[blocker], cy - y[blocker], shapes[c], shapes[blocker], gap, band)) return false;
    const gx = Math.floor(cx / cellX);
    const gy = Math.floor(cy / cellY);
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        const bucket = grid.get(keyOf(gx + ox, gy + oy));
        if (bucket === undefined) continue;
        for (const q of bucket) {
          if (clears(cx - x[q], cy - y[q], shapes[c], shapes[q], gap, band)) continue;
          blocker = q;
          return false;
        }
      }
    }
    return true;
  };
  const ux = Array.from({ length: PACK_DIRECTIONS }, (_, d) => Math.cos((d * 2 * Math.PI) / PACK_DIRECTIONS));
  const uy = Array.from({ length: PACK_DIRECTIONS }, (_, d) => Math.sin((d * 2 * Math.PI) / PACK_DIRECTIONS));
  // Touching distances depend only on the two footprints, which repeat with the radius.
  const kindOf = new Map<number, number>();
  const kind = Int32Array.from(shapes, (s) => {
    if (!kindOf.has(s.r)) kindOf.set(s.r, kindOf.size);
    return kindOf.get(s.r)!;
  });
  const touching = new Map<number, Float64Array>();
  const touchingRound = (c: number, p: number) => {
    const key = kind[p] * shapes.length + kind[c];
    let row = touching.get(key);
    if (row === undefined) {
      row = Float64Array.from(ux, (_, d) => touchingDistance(ux[d], uy[d], shapes[c], shapes[p], gap, band));
      touching.set(key, row);
    }
    return row;
  };
  // A candidate blocked for a radius stays blocked for it, since placing only adds discs.
  const blockedFor = new Float64Array(shapes.length).fill(-1);
  const blocked = new Int32Array(shapes.length);
  const allBlocked = (1 << PACK_DIRECTIONS) - 1;
  insert(order[0]);
  for (let k = 1; k < order.length; k += 1) {
    const c = order[k];
    let bestX = 0;
    let bestY = 0;
    let bestScore = Infinity;
    for (let j = 0; j < k; j += 1) {
      const p = order[j];
      if (blockedFor[p] !== shapes[c].r) {
        blockedFor[p] = shapes[c].r;
        blocked[p] = 0;
      }
      if (blocked[p] === allBlocked) continue;
      const farthest = shapes[p].r + shapes[c].r + shapes[p].w + shapes[c].w + 2 * band + gap;
      const nearest = Math.max(0, Math.sqrt((x[p] * x[p]) / (aspect * aspect) + y[p] * y[p]) - farthest);
      if (nearest * nearest >= bestScore) continue;
      const round = touchingRound(c, p);
      for (let d = 0; d < PACK_DIRECTIONS; d += 1) {
        if (blocked[p] & (1 << d)) continue;
        const t = round[d];
        const cx = x[p] + ux[d] * t;
        const cy = y[p] + uy[d] * t;
        const score = (cx * cx) / (aspect * aspect) + cy * cy;
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
 * Depth levels in placement order: each takes a level at least `DEPTH_APART_ENOUGH` from its screen
 * neighbours' (else the farthest), then the least used, then the one keeping the depths' sum nearest zero, then the nearer. O(k²).
 */
function depthLevels(reach: readonly number[], order: readonly number[], x: Float64Array, y: Float64Array, gap: number, loose: number | null): Int32Array {
  const level = new Int32Array(reach.length);
  const used = new Int32Array(DEPTH_LEVELS);
  let sum = 0;
  for (let k = 0; k < order.length; k += 1) {
    const c = order[k];
    if (c === loose) {
      level[c] = MIDDLE_LEVEL;
      used[MIDDLE_LEVEL] += 1;
      continue;
    }
    if (k === (loose === null ? 0 : 1)) {
      level[c] = 1;
      used[1] += 1;
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
    let bestUse = Infinity;
    let bestSum = Infinity;
    for (let l = 0; l < DEPTH_LEVELS; l += 1) {
      let apart = Infinity;
      for (const other of neighbourLevels) apart = Math.min(apart, Math.abs(l - other), DEPTH_APART_ENOUGH);
      const balance = Math.abs(sum + l - MIDDLE_LEVEL);
      const better = apart !== bestApart ? apart > bestApart : used[l] !== bestUse ? used[l] < bestUse : balance < bestSum;
      if (!better) continue;
      best = l;
      bestApart = apart;
      bestUse = used[l];
      bestSum = balance;
    }
    level[c] = best;
    used[best] += 1;
    sum += best - MIDDLE_LEVEL;
  }
  return level;
}

/**
 * The smallest share of the titled clusters' disc area that one quarter of their box holds,
 * 0.25 when the four hold alike. Sampled on a grid: O(QUARTER_SAMPLES² · k).
 */
function barestQuarterShare(shapes: readonly Footprint[], x: Float64Array, y: Float64Array): number {
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  shapes.forEach((s, i) => {
    if (s.w === 0) return;
    left = Math.min(left, x[i] - s.r);
    right = Math.max(right, x[i] + s.r);
    bottom = Math.min(bottom, y[i] - s.r);
    top = Math.max(top, y[i] + s.r);
  });
  const held = [0, 0, 0, 0];
  for (let row = 0; row < QUARTER_SAMPLES; row += 1) {
    const py = bottom + ((row + 0.5) / QUARTER_SAMPLES) * (top - bottom);
    for (let col = 0; col < QUARTER_SAMPLES; col += 1) {
      const px = left + ((col + 0.5) / QUARTER_SAMPLES) * (right - left);
      if (!shapes.some((s, i) => s.w > 0 && (px - x[i]) ** 2 + (py - y[i]) ** 2 <= s.r * s.r)) continue;
      held[(col * 2 < QUARTER_SAMPLES ? 0 : 1) + (row * 2 < QUARTER_SAMPLES ? 0 : 2)] += 1;
    }
  }
  const all = held[0] + held[1] + held[2] + held[3];
  return all === 0 ? 0.25 : Math.min(...held) / all;
}

interface Arranged {
  points: Point3[];
  height: number;
  focal: number;
  barestQuarter: number;
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
  aspect: number,
): Arranged {
  const nearGrowth = Number.isFinite(focal) ? focal / (focal - depthHalf) : 1;
  const reach = radii.map((r) => r * nearGrowth);
  const titleHalf = (CLUSTER_TITLE_ASPECT * band) / 2;
  const farShrink = Number.isFinite(focal) ? focal / (focal + depthHalf) : 1;
  const shapes = radii.map((r, i) => ({ r: reach[i], w: i === loose ? 0 : Math.max(reach[i], titleHalf), base: r * farShrink }));
  const { x, y } = packDiscs(shapes, order, gap, band, aspect);
  const level = depthLevels(reach, order, x, y, gap, loose);
  const depth = Array.from(level, (l) => depthHalf * (l / MIDDLE_LEVEL - 1));
  let drawn = backProject(radii, x, y, depth, focal, restYaw, pitch);
  for (let pass = 0; pass < LENS_PASSES; pass += 1) drawn = backProject(radii, x, y, depth, drawn.focal, restYaw, pitch);
  return { ...drawn, barestQuarter: barestQuarterShare(shapes, x, y) };
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
 * A wide pack that leaves a quarter bare is packed again round, and the fuller of the two stays.
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
  const bandCap = TITLE_BAND_CAP * Math.max(...radii);
  const settle = (aspect: number): Arranged => {
    let settled = arrange(all, order, loose, restYaw, pitch, gap, 0, 0, Infinity, aspect);
    let band = 0;
    for (let pass = 0; pass < SETTLE_PASSES_MAX; pass += 1) {
      band = Math.min(Math.max(band, CLUSTER_TITLE_SHARE * settled.height), bandCap);
      settled = arrange(all, order, loose, restYaw, pitch, gap, band, (CLUSTER_DEPTH_SHARE * settled.height) / 2, settled.focal, aspect);
      if (pass >= SETTLE_PASSES - 1 && (CLUSTER_TITLE_SHARE * settled.height <= band || band === bandCap)) break;
    }
    return settled;
  };
  let placed = settle(PACK_ASPECT_WIDE);
  if (placed.barestQuarter < BARE_QUARTER_SHARE) {
    const round = settle(PACK_ASPECT_ROUND);
    if (round.barestQuarter > placed.barestQuarter) placed = round;
  }
  const anchors = placed.points.slice(0, radii.length);
  return { anchors, centre: loose === null ? { x: 0, y: 0, z: 0 } : placed.points[loose] };
}
