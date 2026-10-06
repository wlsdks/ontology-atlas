import type { EvidenceLight, Rgb } from "./dome-light";
import { arrowHead, taperedCurve } from "./tapered-arrow";

type StrataLodSheetKind = "fan" | "curtain" | "direct";

export interface StrataLodSheetDraw {
  kind: StrataLodSheetKind;
  xs: readonly number[];
  ys: readonly number[];
  length: number;
  x0: number;
  y0: number;
  u0: number;
  x1: number;
  y1: number;
  u1: number;
  weight: number;
  depth: number;
}

const SHEET_ALPHA: Readonly<Record<StrataLodSheetKind, { near: number; far: number }>> = {
  fan: { near: 0.2, far: 0.05 },
  curtain: { near: 0.13, far: 0.04 },
  direct: { near: 0.07, far: 0.015 },
};

const sheetOrder: number[] = [];

function rgba(rgb: Rgb, alpha: number, lift = 0): string {
  const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha;
  if (lift === 0) return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`;
  const up = (v: number) => Math.round(v + (255 - v) * lift);
  return `rgba(${up(rgb[0])},${up(rgb[1])},${up(rgb[2])},${a.toFixed(3)})`;
}

export function drawStrataLodSheets(
  ctx: CanvasRenderingContext2D,
  sheets: readonly StrataLodSheetDraw[],
  count: number,
  ink: Rgb,
  fog: (u: number) => number,
  presence: number,
): void {
  if (presence <= 0.01) return;
  sheetOrder.length = 0;
  for (let i = 0; i < count; i += 1) if (sheets[i].weight > 0.004 && sheets[i].length >= 3) sheetOrder.push(i);
  if (sheetOrder.length === 0) return;
  sheetOrder.sort((a, b) => sheets[b].depth - sheets[a].depth);
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;
  for (const i of sheetOrder) {
    const sheet = sheets[i];
    const alpha = SHEET_ALPHA[sheet.kind];
    const a0 = alpha.near * sheet.weight * presence * fog(sheet.u0);
    const a1 = alpha.far * sheet.weight * presence * fog(sheet.u1);
    if (a0 <= 0.003 && a1 <= 0.003) continue;
    const gradient = ctx.createLinearGradient(sheet.x0, sheet.y0, sheet.x1, sheet.y1);
    gradient.addColorStop(0, rgba(ink, a0));
    gradient.addColorStop(1, rgba(ink, a1));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(sheet.xs[0], sheet.ys[0]);
    for (let k = 1; k < sheet.length; k += 1) ctx.lineTo(sheet.xs[k], sheet.ys[k]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = prevAlpha;
}

export type StrataLodDustPlane = "capability" | "element";

const DUST_STATES: readonly EvidenceLight[] = ["current", "stale", "unknown"];
const DUST_FOG_BUCKETS = 8;
const DUST_WEIGHT_STEPS = 128;
const DUST_RADIUS: Readonly<Record<StrataLodDustPlane, number>> = { capability: 1.7, element: 1.3 };
const DUST_MARK: Readonly<Record<EvidenceLight, { alpha: number; ring: boolean; lift: number }>> = {
  current: { alpha: 0.85, ring: false, lift: 0.18 },
  stale: { alpha: 0.9, ring: true, lift: 0 },
  unknown: { alpha: 0.5, ring: true, lift: 0 },
};
const DUST_RING_SCALE = 1.3;
const DUST_RING_WIDTH = 0.45;
const TAU = Math.PI * 2;

interface DustBucket {
  plane: StrataLodDustPlane;
  state: EvidenceLight;
  fog: number;
  weight: number;
  xs: Float32Array;
  ys: Float32Array;
  count: number;
}

export interface StrataLodDust {
  buckets: Map<number, DustBucket>;
  pool: DustBucket[];
}

export function createStrataLodDust(): StrataLodDust {
  return { buckets: new Map(), pool: [] };
}

export function resetStrataLodDust(dust: StrataLodDust): void {
  for (const bucket of dust.buckets.values()) {
    bucket.count = 0;
    dust.pool.push(bucket);
  }
  dust.buckets.clear();
}

export function addStrataLodDust(
  dust: StrataLodDust,
  plane: StrataLodDustPlane,
  state: EvidenceLight,
  u: number,
  weight: number,
  x: number,
  y: number,
): void {
  const fog = Math.min(DUST_FOG_BUCKETS - 1, Math.max(0, Math.floor(u * DUST_FOG_BUCKETS)));
  const w = Math.round(Math.min(1, Math.max(0, weight)) * DUST_WEIGHT_STEPS);
  if (w === 0) return;
  const key =
    (((plane === "capability" ? 0 : 1) * DUST_STATES.length + DUST_STATES.indexOf(state)) * DUST_FOG_BUCKETS + fog) *
      (DUST_WEIGHT_STEPS + 1) +
    w;
  let bucket = dust.buckets.get(key);
  if (bucket === undefined) {
    bucket = dust.pool.pop() ?? { plane, state, fog, weight: w, xs: new Float32Array(64), ys: new Float32Array(64), count: 0 };
    bucket.plane = plane;
    bucket.state = state;
    bucket.fog = fog;
    bucket.weight = w;
    bucket.count = 0;
    dust.buckets.set(key, bucket);
  }
  if (bucket.count === bucket.xs.length) {
    const xs = new Float32Array(bucket.xs.length * 2);
    const ys = new Float32Array(bucket.ys.length * 2);
    xs.set(bucket.xs);
    ys.set(bucket.ys);
    bucket.xs = xs;
    bucket.ys = ys;
  }
  bucket.xs[bucket.count] = x;
  bucket.ys[bucket.count] = y;
  bucket.count += 1;
}

const bucketOrder: DustBucket[] = [];

interface DustPath {
  path: Path2D;
  xs: Float32Array;
  ys: Float32Array;
}

const dustPaths = new WeakMap<CanvasRenderingContext2D, Map<string, DustPath>>();

function matchesDustPath(path: DustPath, bucket: DustBucket): boolean {
  if (path.xs.length !== bucket.count) return false;
  for (let i = 0; i < bucket.count; i += 1) {
    if (path.xs[i] !== bucket.xs[i] || path.ys[i] !== bucket.ys[i]) return false;
  }
  return true;
}

export function drawStrataLodDust(
  ctx: CanvasRenderingContext2D,
  dust: StrataLodDust,
  inks: { kindRgb: Readonly<Record<string, Rgb>>; warningRgb: Rgb },
  fog: (u: number) => number,
  presence: number,
  drawnByState?: Record<EvidenceLight, number>,
): number {
  if (presence <= 0.01) {
    dustPaths.delete(ctx);
    return 0;
  }
  const previousPaths = dustPaths.get(ctx);
  const nextPaths = typeof Path2D === "undefined" ? null : new Map<string, DustPath>();
  bucketOrder.length = 0;
  for (const bucket of dust.buckets.values()) if (bucket.count > 0) bucketOrder.push(bucket);
  bucketOrder.sort((a, b) => b.fog - a.fog);
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;
  let drawn = 0;
  for (const bucket of bucketOrder) {
    const rgb = bucket.state === "stale" ? inks.warningRgb : inks.kindRgb[bucket.plane];
    if (!rgb) continue;
    const mark = DUST_MARK[bucket.state];
    const u = (bucket.fog + 0.5) / DUST_FOG_BUCKETS;
    const alpha = mark.alpha * fog(u) * (bucket.weight / DUST_WEIGHT_STEPS) * presence;
    if (alpha <= 0.002) continue;
    const radius = DUST_RADIUS[bucket.plane] * (1.15 - 0.3 * u);
    ctx.fillStyle = rgba(rgb, alpha, mark.lift);
    const key = `${bucket.plane}:${bucket.state}:${bucket.fog}:${bucket.weight}`;
    const previous = previousPaths?.get(key);
    const reusable = nextPaths !== null && previous !== undefined && matchesDustPath(previous, bucket);
    const cached = nextPaths === null ? null : reusable ? previous : {
      path: new Path2D(), xs: bucket.xs.slice(0, bucket.count), ys: bucket.ys.slice(0, bucket.count),
    };
    const pen = cached?.path ?? ctx;
    if (cached === null) ctx.beginPath();
    if (!reusable && mark.ring) {
      const outer = radius * DUST_RING_SCALE;
      const inner = outer * (1 - DUST_RING_WIDTH);
      for (let i = 0; i < bucket.count; i += 1) {
        const x = bucket.xs[i];
        const y = bucket.ys[i];
        pen.moveTo(x + outer, y);
        pen.arc(x, y, outer, 0, TAU);
        pen.moveTo(x + inner, y);
        pen.arc(x, y, inner, TAU, 0, true);
      }
    } else if (!reusable) {
      for (let i = 0; i < bucket.count; i += 1) {
        const x = bucket.xs[i];
        const y = bucket.ys[i];
        pen.moveTo(x + radius, y);
        pen.arc(x, y, radius, 0, TAU);
      }
    }
    if (cached !== null) {
      nextPaths!.set(key, cached);
      ctx.fill(cached.path);
    } else ctx.fill();
    drawn += bucket.count;
    if (drawnByState) drawnByState[bucket.state] += bucket.count;
  }
  // O(N) equality checks; only this frame's paths survive, owned weakly by the context.
  if (nextPaths !== null) dustPaths.set(ctx, nextPaths);
  ctx.globalAlpha = prevAlpha;
  return drawn;
}

export interface StrataLodChordDraw {
  ax: number;
  ay: number;
  ar: number;
  bx: number;
  by: number;
  br: number;
  cx: number;
  cy: number;
  count: number;
  weight: number;
  depth: number;
  lift: number;
}

const chordOrder: number[] = [];

export function strataLodChordWidth(count: number): number {
  return Math.min(3.5, 0.8 + 0.55 * Math.log2(1 + count));
}

function strataLodChordAlpha(count: number): number {
  return Math.min(0.75, 0.22 + 0.09 * Math.log2(1 + count));
}

function strataLodChordHead(count: number): number {
  return Math.min(8, 4.5 + 0.6 * Math.log2(1 + count));
}

export function drawStrataLodChords(
  ctx: CanvasRenderingContext2D,
  chords: readonly StrataLodChordDraw[],
  count: number,
  ink: Rgb,
  fog: (u: number) => number,
  presence: number,
): number {
  if (presence <= 0.01) return 0;
  chordOrder.length = 0;
  for (let i = 0; i < count; i += 1) if (chords[i].weight > 0.004 && chords[i].lift > 0.004) chordOrder.push(i);
  chordOrder.sort((a, b) => chords[b].depth - chords[a].depth);
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;
  let drawn = 0;
  for (const i of chordOrder) {
    const chord = chords[i];
    const share = chord.weight / chord.count;
    const alpha = strataLodChordAlpha(chord.count) * chord.lift * share * fog(chord.depth) * presence;
    if (alpha <= 0.003) continue;
    const startA = Math.atan2(chord.cy - chord.ay, chord.cx - chord.ax);
    const endA = Math.atan2(chord.by - chord.cy, chord.bx - chord.cx);
    const sx = chord.ax + (chord.ar + 2) * Math.cos(startA);
    const sy = chord.ay + (chord.ar + 2) * Math.sin(startA);
    const ex = chord.bx - (chord.br + 3) * Math.cos(endA);
    const ey = chord.by - (chord.br + 3) * Math.sin(endA);
    const head = strataLodChordHead(chord.count);
    const width = strataLodChordWidth(chord.count);
    ctx.fillStyle = rgba(ink, alpha);
    taperedCurve(ctx, sx, sy, chord.cx, chord.cy, ex - head * 0.8 * Math.cos(endA), ey - head * 0.8 * Math.sin(endA), width, Math.max(0.6, width * 0.45));
    arrowHead(ctx, ex, ey, endA, head);
    drawn += 1;
  }
  ctx.globalAlpha = prevAlpha;
  return drawn;
}
