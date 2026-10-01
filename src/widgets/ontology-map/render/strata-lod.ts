import type { EvidenceLight, Rgb } from "./dome-light";

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

function rgba(rgb: Rgb, alpha: number): string {
  const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`;
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
const DUST_EMISSION: Readonly<Record<EvidenceLight, number>> = { current: 1, stale: 0.85, unknown: 0.72 };
const DUST_DOT_ALPHA = 0.7;

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

export function drawStrataLodDust(
  ctx: CanvasRenderingContext2D,
  dust: StrataLodDust,
  inks: { kindRgb: Readonly<Record<string, Rgb>>; warningRgb: Rgb },
  fog: (u: number) => number,
  presence: number,
): number {
  if (presence <= 0.01) return 0;
  bucketOrder.length = 0;
  for (const bucket of dust.buckets.values()) if (bucket.count > 0) bucketOrder.push(bucket);
  bucketOrder.sort((a, b) => b.fog - a.fog);
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;
  let drawn = 0;
  for (const bucket of bucketOrder) {
    const rgb = bucket.state === "stale" ? inks.warningRgb : inks.kindRgb[bucket.plane];
    if (!rgb) continue;
    const u = (bucket.fog + 0.5) / DUST_FOG_BUCKETS;
    const alpha = DUST_DOT_ALPHA * DUST_EMISSION[bucket.state] * fog(u) * (bucket.weight / DUST_WEIGHT_STEPS) * presence;
    if (alpha <= 0.002) continue;
    const radius = DUST_RADIUS[bucket.plane] * (1.15 - 0.3 * u);
    ctx.fillStyle = rgba(rgb, alpha);
    ctx.beginPath();
    for (let i = 0; i < bucket.count; i += 1) {
      const x = bucket.xs[i];
      const y = bucket.ys[i];
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
    drawn += bucket.count;
  }
  ctx.globalAlpha = prevAlpha;
  return drawn;
}

export interface StrataLodChordDraw {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  count: number;
  weight: number;
  depth: number;
  lifted: boolean;
}

const chordOrder: number[] = [];

export function strataLodChordWidth(count: number): number {
  return Math.min(3.5, 0.8 + 0.55 * Math.log2(1 + count));
}

function strataLodChordAlpha(count: number): number {
  return Math.min(0.75, 0.22 + 0.09 * Math.log2(1 + count));
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
  for (let i = 0; i < count; i += 1) if (chords[i].weight > 0.004) chordOrder.push(i);
  chordOrder.sort((a, b) => chords[b].depth - chords[a].depth);
  const prevAlpha = ctx.globalAlpha;
  const prevCap = ctx.lineCap;
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  let drawn = 0;
  for (const i of chordOrder) {
    const chord = chords[i];
    const share = chord.weight / chord.count;
    const alpha = Math.min(1, strataLodChordAlpha(chord.count) * (chord.lifted ? 1.6 : 1)) * share * fog(chord.depth) * presence;
    if (alpha <= 0.003) continue;
    ctx.strokeStyle = rgba(ink, alpha);
    ctx.lineWidth = strataLodChordWidth(chord.count);
    ctx.beginPath();
    ctx.moveTo(chord.ax, chord.ay);
    ctx.quadraticCurveTo(chord.cx, chord.cy, chord.bx, chord.by);
    ctx.stroke();
    drawn += 1;
  }
  ctx.globalAlpha = prevAlpha;
  ctx.lineCap = prevCap;
  return drawn;
}
