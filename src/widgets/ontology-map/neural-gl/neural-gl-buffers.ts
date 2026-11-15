import { at } from "../ui/frame-draw/neural-axons";
import type { NeuralFrame } from "../ui/frame-draw/neural-frame";
import { NEURAL_CELL } from "../ui/frame-draw/paint-neural";
import { IMPACT_STEP_DISTANCES, impactStepOf, impactStrength } from "../ui/frame-draw/neural-spread";

/**
 * A spot: one disc with an optional soft glow under it, a nucleus inside it and a ring around it.
 * Floats: centre x, y, radius, depth · body rgba · glow rgba · nucleus rgba · ring rgba ·
 * glow reach, nucleus radius, ring radius, ring width. Lengths are CSS px, depth 0 near and 1 far.
 */
export const SPOT_FLOATS = 24;
/**
 * A ribbon: the quadratic (a, c, b) between `t0` and `t1`, its width running from `startPx` at t = 0
 * to `endPx` at t = 1. Floats: ax, ay, cx, cy · bx, by, t0, t1 · startPx, endPx, depth, 0 · rgba.
 */
export const RIBBON_FLOATS = 16;

/** One instanced draw: `count` records of its stride in `data`; `data` is replaced only to grow. */
export interface NeuralGlBatch {
  readonly stride: number;
  data: Float32Array;
  count: number;
}

/** The draws of one Neural frame, in paint order. */
export interface NeuralGlBuffers {
  pools: NeuralGlBatch;
  restAxons: NeuralGlBatch;
  restDots: NeuralGlBatch;
  cells: NeuralGlBatch;
  litAxons: NeuralGlBatch;
  litSpots: NeuralGlBatch;
  /** What the last fill drew. */
  cellCount: number;
  axonCount: number;
}

/** Straight (not premultiplied) rgba in 0..1. */
export type GlInk = readonly [number, number, number, number];

/** The frame's inks resolved to numbers; the GL module resolves them from CSS once per tokens object. */
export interface NeuralGlInks {
  strong: GlInk;
  arc: GlInk;
  reach: GlInk;
  project: GlInk;
  warning: GlInk;
  ground: GlInk;
}

/** Mirrors of the canvas-2D painter's constants (`ui/frame-draw/paint-neural.ts`), so both draw the same marks. */
const AXON_DOT_T = 0.95;
const LIT_DOT_T = 0.96;
const AXON_DOT_GAIN = 1.7;
const RING_ALPHA = 0.8;
const SIGNAL_GLOW_ALPHA = 0.85;
const IMPACT_WIDTH_FLOOR = 0.45;
/** The canvas painter's shadow blur under a lit axon, drawn here as a wider faint ribbon beneath it. */
const LIT_GLOW_ALPHA = 0.18;
const LIT_GLOW_WIDTH_SHARE = 0.75;
/** The GL canvas fades by its CSS opacity, so marks are drawn without the ramp the frame folded in. */
const MIN_RAMP = 1e-3;

const NONE: GlInk = [0, 0, 0, 0];

function batch(stride: number): NeuralGlBatch {
  return { stride, data: new Float32Array(0), count: 0 };
}

export function createNeuralGlBuffers(): NeuralGlBuffers {
  return {
    pools: batch(SPOT_FLOATS),
    restAxons: batch(RIBBON_FLOATS),
    restDots: batch(SPOT_FLOATS),
    cells: batch(SPOT_FLOATS),
    litAxons: batch(RIBBON_FLOATS),
    litSpots: batch(SPOT_FLOATS),
    cellCount: 0,
    axonCount: 0,
  };
}

/** Room for `records` more; grows by doubling, so a steady graph allocates nothing after warm-up. */
function reserve(target: NeuralGlBatch, records: number): void {
  const needed = (target.count + records) * target.stride;
  if (target.data.length >= needed) return;
  const grown = new Float32Array(Math.max(needed, target.data.length * 2));
  grown.set(target.data.subarray(0, target.count * target.stride));
  target.data = grown;
}

interface SpotMarks {
  body: GlInk;
  bodyAlpha: number;
  glow: GlInk;
  glowAlpha: number;
  glowReachPx: number;
  inner: GlInk;
  innerAlpha: number;
  innerPx: number;
  ring: GlInk;
  ringAlpha: number;
  ringPx: number;
  ringWidthPx: number;
}

const spot: SpotMarks = {
  body: NONE, bodyAlpha: 0, glow: NONE, glowAlpha: 0, glowReachPx: 0,
  inner: NONE, innerAlpha: 0, innerPx: 0, ring: NONE, ringAlpha: 0, ringPx: 0, ringWidthPx: 0,
};

function clearSpot(): SpotMarks {
  spot.body = NONE; spot.bodyAlpha = 0; spot.glow = NONE; spot.glowAlpha = 0; spot.glowReachPx = 0;
  spot.inner = NONE; spot.innerAlpha = 0; spot.innerPx = 0; spot.ring = NONE; spot.ringAlpha = 0; spot.ringPx = 0; spot.ringWidthPx = 0;
  return spot;
}

function pushSpot(target: NeuralGlBatch, x: number, y: number, r: number, depth: number, marks: SpotMarks, unramp: number): void {
  const d = target.data;
  const o = target.count * SPOT_FLOATS;
  d[o] = x; d[o + 1] = y; d[o + 2] = r; d[o + 3] = depth;
  writeInk(d, o + 4, marks.body, marks.bodyAlpha * unramp);
  writeInk(d, o + 8, marks.glow, marks.glowAlpha * unramp);
  writeInk(d, o + 12, marks.inner, marks.innerAlpha * unramp);
  writeInk(d, o + 16, marks.ring, marks.ringAlpha * unramp);
  d[o + 20] = marks.glowReachPx; d[o + 21] = marks.innerPx; d[o + 22] = marks.ringPx; d[o + 23] = marks.ringWidthPx;
  target.count += 1;
}

function pushRibbon(target: NeuralGlBatch, f: NeuralFrame, i: number, t0: number, t1: number, startPx: number, endPx: number, ink: GlInk, alpha: number): void {
  const d = target.data;
  const o = target.count * RIBBON_FLOATS;
  d[o] = f.axonAX[i]; d[o + 1] = f.axonAY[i]; d[o + 2] = f.axonCX[i]; d[o + 3] = f.axonCY[i];
  d[o + 4] = f.axonBX[i]; d[o + 5] = f.axonBY[i]; d[o + 6] = t0; d[o + 7] = t1;
  d[o + 8] = startPx; d[o + 9] = endPx; d[o + 10] = 0; d[o + 11] = 0;
  writeInk(d, o + 12, ink, alpha);
  target.count += 1;
}

function writeInk(d: Float32Array, o: number, ink: GlInk, alpha: number): void {
  d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2];
  d[o + 3] = Math.min(1, Math.max(0, ink[3] * alpha));
}

/**
 * Fills `buffers` with what `f` draws, in the canvas painter's order: cluster light, rest axons and
 * their end dots, cells far to near, then a focus's lit axons, spread, signals and ring.
 * O(cells drawn + axons drawn); allocates only when a batch grows.
 */
export function fillNeuralGlBuffers(buffers: NeuralGlBuffers, f: NeuralFrame, inks: NeuralGlInks): void {
  const unramp = 1 / Math.max(f.neural, MIN_RAMP);
  buffers.pools.count = 0;
  buffers.restAxons.count = 0;
  buffers.restDots.count = 0;
  buffers.cells.count = 0;
  buffers.litAxons.count = 0;
  buffers.litSpots.count = 0;
  fillPools(buffers.pools, f, inks, unramp);
  fillRestAxons(buffers, f, inks, unramp);
  fillCells(buffers.cells, f, inks, unramp);
  if (f.sets !== null) fillLit(buffers, f, inks, unramp);
  buffers.cellCount = buffers.cells.count;
  buffers.axonCount = f.axonCount;
}

function fillPools(target: NeuralGlBatch, f: NeuralFrame, inks: NeuralGlInks, unramp: number): void {
  reserve(target, f.poolCount);
  for (let k = 0; k < f.poolCount; k += 1) {
    const pool = f.pools[k];
    if (pool.lightAlpha <= 0.004 || pool.reachPx <= 0.5) continue;
    const marks = clearSpot();
    marks.glow = inks.arc;
    marks.glowAlpha = pool.lightAlpha;
    marks.glowReachPx = pool.reachPx;
    pushSpot(target, pool.x, pool.y, 0, 1, marks, unramp);
  }
}

function fillRestAxons(buffers: NeuralGlBuffers, f: NeuralFrame, inks: NeuralGlInks, unramp: number): void {
  const t = f.tokens;
  reserve(buffers.restAxons, f.axonCount);
  reserve(buffers.restDots, f.axonCount);
  for (let i = 0; i < f.axonCount; i += 1) {
    const group = f.axonGroup[i];
    if (group < 0) continue;
    const alpha = f.groupAlpha[group];
    if (alpha <= 0.004) continue;
    const startPx = group % 2 ? t.axonCapPx : t.axonElementPx;
    pushRibbon(buffers.restAxons, f, i, 0, 1, startPx, t.axonEndPx, inks.arc, Math.min(1, alpha * unramp));
    const marks = clearSpot();
    marks.body = inks.arc;
    marks.bodyAlpha = Math.min(1, alpha * AXON_DOT_GAIN);
    pushSpot(buffers.restDots, at(f.axonAX[i], f.axonCX[i], f.axonBX[i], AXON_DOT_T), at(f.axonAY[i], f.axonCY[i], f.axonBY[i], AXON_DOT_T), t.axonDotPx, 0, marks, unramp);
  }
}

function fillCells(target: NeuralGlBatch, f: NeuralFrame, inks: NeuralGlInks, unramp: number): void {
  const t = f.tokens;
  reserve(target, f.drawCount);
  for (let k = 0; k < f.drawCount; k += 1) {
    const i = f.drawOrder[k];
    const alpha = f.cellAlpha[i];
    const r = f.cellR[i];
    const kind = f.cellKind[i];
    const stale = f.cellStale[i] === 1;
    const marks = clearSpot();
    marks.body = kind === NEURAL_CELL.project ? inks.project : stale ? inks.warning : inks.strong;
    marks.bodyAlpha = alpha;
    marks.glow = stale ? inks.warning : inks.strong;
    marks.glowAlpha = r * t.glowReach > 0.5 ? alpha * t.glowAlpha : 0;
    marks.glowReachPx = r * t.glowReach;
    if (kind === NEURAL_CELL.capability) {
      marks.inner = inks.ground;
      marks.innerAlpha = alpha * t.nucleusAlpha;
      marks.innerPx = r * t.nucleusShare;
    } else if (kind === NEURAL_CELL.domain || kind === NEURAL_CELL.project) {
      marks.ring = marks.body;
      marks.ringAlpha = alpha * RING_ALPHA;
      marks.ringPx = r + t.ringGapPx;
      marks.ringWidthPx = t.ringPx;
    }
    pushSpot(target, f.cellX[i], f.cellY[i], r, f.cellU[i], marks, unramp);
  }
}

function pushSignal(target: NeuralGlBatch, f: NeuralFrame, i: number, along: number, inks: NeuralGlInks, unramp: number): void {
  const t = f.tokens;
  const marks = clearSpot();
  marks.body = inks.strong;
  marks.bodyAlpha = f.ramp * f.neural;
  marks.glow = inks.strong;
  marks.glowAlpha = SIGNAL_GLOW_ALPHA * f.ramp * f.neural;
  marks.glowReachPx = t.signalGlowPx;
  pushSpot(target, at(f.axonAX[i], f.axonCX[i], f.axonBX[i], along), at(f.axonAY[i], f.axonCY[i], f.axonBY[i], along), t.signalPx, 0, marks, unramp);
}

function pushLitDot(target: NeuralGlBatch, f: NeuralFrame, i: number, ink: GlInk, alpha: number, unramp: number): void {
  const marks = clearSpot();
  marks.body = ink;
  marks.bodyAlpha = alpha;
  pushSpot(target, at(f.axonAX[i], f.axonCX[i], f.axonBX[i], LIT_DOT_T), at(f.axonAY[i], f.axonCY[i], f.axonBY[i], LIT_DOT_T), f.tokens.litDotPx, 0, marks, unramp);
}

function fillLit(buffers: NeuralGlBuffers, f: NeuralFrame, inks: NeuralGlInks, unramp: number): void {
  const t = f.tokens;
  const { litAxons, litSpots } = buffers;
  reserve(litAxons, f.litCount * 2);
  reserve(litSpots, f.litCount * 2 + 1);
  const spreading = f.impact !== null;
  const glowPx = t.litGlowPx * LIT_GLOW_WIDTH_SHARE;
  for (let k = 0; k < f.litCount; k += 1) {
    if (spreading && f.litHop[k] > 0) continue;
    const i = f.litAxon[k];
    const ink = f.litHop[k] > 0 ? inks.reach : inks.arc;
    const alpha = Math.min(1, f.litAlpha[k] * unramp);
    pushRibbon(litAxons, f, i, 0, 1, t.litStartPx + glowPx, t.litEndPx + glowPx, ink, alpha * LIT_GLOW_ALPHA);
    pushRibbon(litAxons, f, i, 0, 1, t.litStartPx, t.litEndPx, ink, alpha);
    pushLitDot(litSpots, f, i, ink, f.litAlpha[k], unramp);
    if (f.travel < 1) pushSignal(litSpots, f, i, f.travel, inks, unramp);
  }
  if (spreading) fillSpread(buffers, f, inks, unramp);
  const ring = f.focusRing;
  if (ring.alpha > 0) {
    const marks = clearSpot();
    marks.ring = inks.strong;
    marks.ringAlpha = ring.alpha;
    marks.ringPx = ring.r;
    marks.ringWidthPx = t.focusRingPx;
    pushSpot(litSpots, ring.x, ring.y, 0, 0, marks, unramp);
  }
}

/** How far hop k's signal has run along its axon, 0..1. */
const runOf = (f: NeuralFrame, k: number) => Math.min(1, Math.max(0, f.spread - (f.litHop[k] - 1)));

/** A selection's dependents in the reach ink, each lit from its nearer end as far as its hop's signal has run. */
function fillSpread(buffers: NeuralGlBuffers, f: NeuralFrame, inks: NeuralGlInks, unramp: number): void {
  const t = f.tokens;
  const { litAxons, litSpots } = buffers;
  reserve(litAxons, f.litCount);
  reserve(litSpots, f.litCount * 2);
  for (let step = 0; step < IMPACT_STEP_DISTANCES.length; step += 1) {
    const strength = impactStrength(t, IMPACT_STEP_DISTANCES[step]);
    const widthShare = IMPACT_WIDTH_FLOOR + (1 - IMPACT_WIDTH_FLOOR) * strength;
    const startPx = t.litStartPx * widthShare;
    const endPx = t.litEndPx * widthShare;
    for (let k = 0; k < f.litCount; k += 1) {
      const hop = f.litHop[k];
      if (hop <= 0 || impactStepOf(hop) !== step) continue;
      const i = f.litAxon[k];
      const t0 = Math.max(0, 1 - runOf(f, k));
      if (t0 < 1) pushRibbon(litAxons, f, i, t0, 1, startPx, endPx, inks.reach, Math.min(1, f.litAlpha[k] * unramp));
      pushLitDot(litSpots, f, i, inks.reach, f.litAlpha[k], unramp);
    }
  }
  for (let k = 0; k < f.litCount; k += 1) {
    const run = f.litHop[k] > 0 ? runOf(f, k) : 1;
    if (run <= 0 || run >= 1) continue;
    pushSignal(litSpots, f, f.litAxon[k], 1 - run, inks, unramp);
  }
}
