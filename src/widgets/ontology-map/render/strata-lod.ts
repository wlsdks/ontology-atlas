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

const DUST_PLANES: readonly StrataLodDustPlane[] = ["capability", "element"];
const DUST_STATES: readonly EvidenceLight[] = ["current", "stale", "unknown"];
const DUST_FOG_BUCKETS = 4;
const DUST_WEIGHT_BUCKETS = 3;
const DUST_RADIUS: Readonly<Record<StrataLodDustPlane, number>> = { capability: 1.7, element: 1.3 };
const DUST_EMISSION: Readonly<Record<EvidenceLight, number>> = { current: 1, stale: 0.85, unknown: 0.72 };
const DUST_DOT_ALPHA = 0.7;
const DUST_SPREAD_GAIN = 1.6;
const DUST_SPREAD_MAX_PX = 4.5;

interface DustBucket {
  xs: Float32Array;
  ys: Float32Array;
  count: number;
}

export interface StrataLodDust {
  buckets: DustBucket[];
}

function bucketIndex(plane: number, state: number, fog: number, weight: number): number {
  return ((plane * DUST_STATES.length + state) * DUST_FOG_BUCKETS + fog) * DUST_WEIGHT_BUCKETS + weight;
}

export function createStrataLodDust(): StrataLodDust {
  const buckets: DustBucket[] = [];
  const total = DUST_PLANES.length * DUST_STATES.length * DUST_FOG_BUCKETS * DUST_WEIGHT_BUCKETS;
  for (let i = 0; i < total; i += 1) buckets.push({ xs: new Float32Array(64), ys: new Float32Array(64), count: 0 });
  return { buckets };
}

export function resetStrataLodDust(dust: StrataLodDust): void {
  for (const bucket of dust.buckets) bucket.count = 0;
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
  const w = Math.min(DUST_WEIGHT_BUCKETS - 1, Math.floor(weight * DUST_WEIGHT_BUCKETS - 1e-9));
  const bucket = dust.buckets[bucketIndex(plane === "capability" ? 0 : 1, DUST_STATES.indexOf(state), fog, Math.max(0, w))];
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

export function strataLodDustSpreadPx(plane: StrataLodDustPlane, spacingPx: number): number {
  const diameter = DUST_RADIUS[plane] * 2;
  if (!(spacingPx >= 0) || spacingPx >= diameter) return 0;
  return Math.min(DUST_SPREAD_MAX_PX, diameter * (1 - spacingPx / diameter) * DUST_SPREAD_GAIN);
}

export function drawStrataLodDust(
  ctx: CanvasRenderingContext2D,
  dust: StrataLodDust,
  inks: { kindRgb: Readonly<Record<string, Rgb>>; warningRgb: Rgb },
  fog: (u: number) => number,
  presence: number,
): number {
  if (presence <= 0.01) return 0;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;
  let drawn = 0;
  for (let p = 0; p < DUST_PLANES.length; p += 1) {
    const plane = DUST_PLANES[p];
    for (let s = 0; s < DUST_STATES.length; s += 1) {
      const state = DUST_STATES[s];
      const rgb = state === "stale" ? inks.warningRgb : inks.kindRgb[plane];
      if (!rgb) continue;
      for (let f = 0; f < DUST_FOG_BUCKETS; f += 1) {
        const u = (f + 0.5) / DUST_FOG_BUCKETS;
        const radius = DUST_RADIUS[plane] * (1.15 - 0.3 * u);
        for (let w = 0; w < DUST_WEIGHT_BUCKETS; w += 1) {
          const bucket = dust.buckets[bucketIndex(p, s, f, w)];
          if (bucket.count === 0) continue;
          const weight = (w + 1) / DUST_WEIGHT_BUCKETS;
          const alpha = DUST_DOT_ALPHA * DUST_EMISSION[state] * fog(u) * weight * presence;
          if (alpha <= 0.004) continue;
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
      }
    }
  }
  ctx.globalAlpha = prevAlpha;
  return drawn;
}
