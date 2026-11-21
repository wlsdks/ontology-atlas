import { DOME_NODE_PX } from "../../model/dome-view/ink";
import { neuralCellRadiusPx, neuralGraphOf, neuralTracts, type NeuralTracts } from "../../model/dome-view/neural/neural-cells";
import { readNeuralTokens, type NeuralTokens } from "../../tokens/read-neural-tokens";
import type { DomeNodeFrame } from "../../model/dome-view/runtime";
import type { TopologyWorld, WorldNode } from "../world/topology-world";
import { at, AXON_BANDS, bandWidthPx, glowSprite, stamp, taperedAxon, traceAxon } from "./neural-axons";
import type { NeuralFrame } from "./neural-frame";
import { IMPACT_STEP_DISTANCES, impactStepOf, impactStrength } from "./neural-spread";

/** The words Neural paints, composed by the view that owns the locale. */
export interface NeuralLabels {
  domainMeta: (counts: { capabilities: number; elements: number; stale: number }) => string;
  /** `impact` is present on a selection whose impact reaches past its direct dependents. */
  focusFacts: (facts: { stale: boolean; needs: number; usedBy: number; impact?: number }) => string;
}

/** `NeuralFrame.cellKind` codes: the one choice a cell's body and ring make by kind. */
export const NEURAL_CELL = { element: 0, capability: 1, domain: 2, project: 3 } as const satisfies Record<WorldNode["kind"], number>;

export const AXON_DOT_T = 0.95;
export const LIT_DOT_T = 0.96;
/** An axon's end dot is this much brighter than its stroke. */
export const AXON_DOT_GAIN = 1.7;
/** A domain's or the project's ring under its body. */
export const RING_ALPHA = 0.8;
/** The travelling signal's glow under its dot. */
export const SIGNAL_GLOW_ALPHA = 0.85;
/** A weaker impact step is also thinner, down to this share of a lit axon's width at zero strength. */
export const IMPACT_WIDTH_FLOOR = 0.45;

let tokens: NeuralTokens | null = null;
let tractCache: { world: TopologyWorld; epoch: number; tracts: NeuralTracts } | null = null;

/** Neural's tokens, read once per page. */
export function neuralTokens(): NeuralTokens {
  return (tokens ??= readNeuralTokens());
}

/** Zooming in past the whole-cloud fit grows the cells with the camera, up to `zoomGrowMax`. */
export function zoomGrowthOf(camScale: number, restFitScale: number | null, t: NeuralTokens): number {
  return restFitScale !== null && restFitScale > 0 ? Math.min(t.zoomGrowMax, Math.max(1, camScale / restFitScale)) : 1;
}

function cellSizesOf(t: NeuralTokens) {
  return { capabilityPx: t.capPx, capabilityGainPx: t.capGainPx, elementPx: t.elementPx, elementGainPx: t.elementGainPx, domainPx: t.domainPx, projectPx: t.projectPx };
}

/**
 * What Neural multiplies a node's base radius (`radiusForKind × magnitudeScale × camera scale`) by:
 * perspective, the dependency-sized cell and zoom growth. Paint, the node hit test and the edge guard
 * all take it from here, so the pressable disc is the painted one.
 */
export function neuralRadiusScale(
  world: TopologyWorld,
  node: { id: string; kind: WorldNode["kind"] },
  perspective: number,
  camScale: number,
  restFitScale: number | null,
): number {
  const t = neuralTokens();
  const dependencies = neuralGraphOf(world.nodes, world.edges).dependencyCount.get(node.id) ?? 0;
  return (perspective * neuralCellRadiusPx(node.kind, dependencies, cellSizesOf(t)) * zoomGrowthOf(camScale, restFitScale, t)) / DOME_NODE_PX[node.kind];
}

/**
 * Neural's route context for this frame: the one input paint, picking and the probe give
 * `projectDomeEdgeControl`, so all three bend a dependency the same way. Cached per frame epoch.
 */
export function neuralTractsFor(world: TopologyWorld, frame: ReadonlyMap<string, DomeNodeFrame>, epoch: number | null): NeuralTracts {
  if (epoch !== null && tractCache?.world === world && tractCache.epoch === epoch) return tractCache.tracts;
  const t = neuralTokens();
  const tracts = neuralTracts(neuralGraphOf(world.nodes, world.edges), (id) => {
    const node = world.nodeById.get(id);
    const f = frame.get(id);
    return node && f ? { x: node.x + f.dx, y: node.y + f.dy } : null;
  }, { bow: t.axonBow, pull: t.tractPull, gain: t.tractGain });
  if (epoch !== null) tractCache = { world, epoch, tracts };
  return tracts;
}

/**
 * Canvas-2D strokes of a `NeuralFrame`: cluster light, rest axons batched by group, cells far to near
 * (glow, filled body in the strong ink or amber when stale, a capability's nucleus, a domain's ring),
 * then a focus's lit axons, signal, spread and ring. O(cells drawn + axons drawn).
 */
export function strokeNeural(ctx: CanvasRenderingContext2D, nf: NeuralFrame): void {
  const t = nf.tokens;
  const ink = t.inks;
  const arcGlow = glowSprite(ink.arc);
  for (let k = 0; k < nf.poolCount; k += 1) {
    const pool = nf.pools[k];
    stamp(ctx, arcGlow, pool.x, pool.y, pool.reachPx, pool.lightAlpha);
  }
  strokeRestAxons(ctx, nf);
  strokeCells(ctx, nf);
  if (nf.sets !== null) strokeLit(ctx, nf);
}

function strokeRestAxons(ctx: CanvasRenderingContext2D, nf: NeuralFrame): void {
  const t = nf.tokens;
  const { axonAX: ax, axonAY: ay, axonCX: acx, axonCY: acy, axonBX: abx, axonBY: aby, axonGroup } = nf;
  ctx.lineCap = "round";
  ctx.strokeStyle = t.inks.arc;
  ctx.fillStyle = t.inks.arc;
  for (let group = 0; group < nf.groupAlpha.length; group += 1) {
    const alpha = nf.groupAlpha[group];
    if (alpha <= 0.004) continue;
    const startPx = group % 2 ? t.axonCapPx : t.axonElementPx;
    let any = false;
    for (let band = 0; band < AXON_BANDS; band += 1) {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = bandWidthPx(band, startPx, t.axonEndPx);
      ctx.beginPath();
      for (let i = 0; i < nf.axonCount; i += 1) {
        if (axonGroup[i] !== group) continue;
        any = true;
        traceAxon(ctx, nf, i, band / AXON_BANDS, (band + 1) / AXON_BANDS);
      }
      if (!any) break;
      ctx.stroke();
    }
    if (!any) continue;
    ctx.globalAlpha = Math.min(1, alpha * AXON_DOT_GAIN);
    ctx.beginPath();
    for (let i = 0; i < nf.axonCount; i += 1) {
      if (axonGroup[i] !== group) continue;
      const x = at(ax[i], acx[i], abx[i], AXON_DOT_T);
      const y = at(ay[i], acy[i], aby[i], AXON_DOT_T);
      ctx.moveTo(x + t.axonDotPx, y);
      ctx.arc(x, y, t.axonDotPx, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function strokeCells(ctx: CanvasRenderingContext2D, nf: NeuralFrame): void {
  const t = nf.tokens;
  const ink = t.inks;
  const { cellX: sx, cellY: sy, cellR: sr, cellAlpha: sa, cellKind, cellStale } = nf;
  const strongGlow = glowSprite(ink.strong);
  const warningGlow = glowSprite(ink.warning);
  for (let k = 0; k < nf.drawCount; k += 1) {
    const i = nf.drawOrder[k];
    const alpha = sa[i];
    const r = sr[i];
    const kind = cellKind[i];
    const stale = cellStale[i] === 1;
    const body = kind === NEURAL_CELL.project ? ink.project : stale ? ink.warning : ink.strong;
    stamp(ctx, stale ? warningGlow : strongGlow, sx[i], sy[i], r * t.glowReach, alpha * t.glowAlpha);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(sx[i], sy[i], r, 0, Math.PI * 2);
    ctx.fill();
    if (kind === NEURAL_CELL.capability) {
      ctx.globalAlpha = alpha * t.nucleusAlpha;
      ctx.fillStyle = ink.ground;
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], r * t.nucleusShare, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === NEURAL_CELL.domain || kind === NEURAL_CELL.project) {
      ctx.globalAlpha = alpha * RING_ALPHA;
      ctx.strokeStyle = body;
      ctx.lineWidth = t.ringPx;
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], r + t.ringGapPx, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** The lit axons, the focus's ring, and the signal: once along each lit axon, or a selection's spread. */
function strokeLit(ctx: CanvasRenderingContext2D, nf: NeuralFrame): void {
  const t = nf.tokens;
  const ink = t.inks;
  const { axonAX: ax, axonAY: ay, axonCX: acx, axonCY: acy, axonBX: abx, axonBY: aby } = nf;
  const spreading = nf.impact !== null;
  const signalAlpha = nf.ramp * nf.neural;
  const whiteGlow = glowSprite(ink.strong);
  for (let k = 0; k < nf.litCount; k += 1) {
    if (spreading && nf.litHop[k] > 0) continue;
    const i = nf.litAxon[k];
    const lineInk = nf.litHop[k] > 0 ? ink.reach : ink.arc;
    ctx.globalAlpha = nf.litAlpha[k];
    ctx.strokeStyle = lineInk;
    ctx.shadowColor = lineInk;
    ctx.shadowBlur = t.litGlowPx;
    taperedAxon(ctx, nf, i, t.litStartPx, t.litEndPx);
    ctx.shadowBlur = 0;
    ctx.fillStyle = lineInk;
    ctx.beginPath();
    ctx.arc(at(ax[i], acx[i], abx[i], LIT_DOT_T), at(ay[i], acy[i], aby[i], LIT_DOT_T), t.litDotPx, 0, Math.PI * 2);
    ctx.fill();
    if (nf.travel < 1) {
      const x = at(ax[i], acx[i], abx[i], nf.travel);
      const y = at(ay[i], acy[i], aby[i], nf.travel);
      stamp(ctx, whiteGlow, x, y, t.signalGlowPx, SIGNAL_GLOW_ALPHA * nf.ramp * nf.neural);
      ctx.globalAlpha = signalAlpha;
      ctx.fillStyle = ink.strong;
      ctx.beginPath();
      ctx.arc(x, y, t.signalPx, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (spreading) strokeSpread(ctx, nf, signalAlpha, whiteGlow);
  const ring = nf.focusRing;
  if (ring.alpha > 0) {
    ctx.globalAlpha = ring.alpha;
    ctx.strokeStyle = ink.strong;
    ctx.lineWidth = t.focusRingPx;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * A selection's dependents in the reach ink, hop k lighting from its nearer end as its signal runs out,
 * and each impact step drawn as one stroke per band. O(lit axons) per frame.
 */
function strokeSpread(ctx: CanvasRenderingContext2D, nf: NeuralFrame, alpha: number, glow: HTMLCanvasElement | null): void {
  const t = nf.tokens;
  const { axonAX: ax, axonAY: ay, axonCX: acx, axonCY: acy, axonBX: abx, axonBY: aby, litAxon, litHop } = nf;
  const reach = t.inks.reach;
  const runOf = (k: number) => Math.min(1, Math.max(0, nf.spread - (litHop[k] - 1)));
  ctx.strokeStyle = reach;
  ctx.fillStyle = reach;
  for (let step = 0; step < IMPACT_STEP_DISTANCES.length; step += 1) {
    const strength = impactStrength(t, IMPACT_STEP_DISTANCES[step]);
    const widthShare = IMPACT_WIDTH_FLOOR + (1 - IMPACT_WIDTH_FLOOR) * strength;
    let any = false;
    ctx.shadowColor = reach;
    ctx.shadowBlur = step === 0 ? t.litGlowPx : 0;
    for (let band = 0; band < AXON_BANDS; band += 1) {
      const t1 = (band + 1) / AXON_BANDS;
      let started = false;
      for (let k = 0; k < nf.litCount; k += 1) {
        if (litHop[k] <= 0 || impactStepOf(litHop[k]) !== step) continue;
        if (!started) {
          ctx.globalAlpha = nf.litAlpha[k];
          ctx.lineWidth = bandWidthPx(band, t.litStartPx, t.litEndPx) * widthShare;
          ctx.beginPath();
          started = true;
        }
        any = true;
        const t0 = Math.max(band / AXON_BANDS, 1 - runOf(k));
        if (t0 < t1) traceAxon(ctx, nf, litAxon[k], t0, t1);
      }
      if (!any) break;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (!any) continue;
    ctx.beginPath();
    for (let k = 0; k < nf.litCount; k += 1) {
      if (litHop[k] <= 0 || impactStepOf(litHop[k]) !== step) continue;
      const i = litAxon[k];
      const x = at(ax[i], acx[i], abx[i], LIT_DOT_T);
      const y = at(ay[i], acy[i], aby[i], LIT_DOT_T);
      ctx.moveTo(x + t.litDotPx, y);
      ctx.arc(x, y, t.litDotPx, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  // The signal runs from the end nearer the selection, the dependency's target, to its dependent.
  ctx.fillStyle = t.inks.strong;
  ctx.beginPath();
  for (let k = 0; k < nf.litCount; k += 1) {
    const run = litHop[k] > 0 ? runOf(k) : 1;
    if (run <= 0 || run >= 1) continue;
    const i = litAxon[k];
    const x = at(ax[i], acx[i], abx[i], 1 - run);
    const y = at(ay[i], acy[i], aby[i], 1 - run);
    stamp(ctx, glow, x, y, t.signalGlowPx, SIGNAL_GLOW_ALPHA * alpha);
    ctx.moveTo(x + t.signalPx, y);
    ctx.arc(x, y, t.signalPx, 0, Math.PI * 2);
  }
  ctx.globalAlpha = alpha;
  ctx.fill();
}
