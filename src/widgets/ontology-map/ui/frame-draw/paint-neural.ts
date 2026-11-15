import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { projectDomeEdgeControl } from "../../model/dome-view/dome-edge";
import { DOME_NODE_PX } from "../../model/dome-view/ink";
import {
  isNeuralDependency,
  neuralCellIsStale,
  neuralCellRadiusPx,
  neuralFocusSets,
  neuralGraphOf,
  neuralTracts,
  type NeuralGraph,
  type NeuralTracts,
} from "../../model/dome-view/neural-cells";
import { labelFontFamily } from "../../render/labels";
import { readNeuralTokens, type NeuralTokens } from "../../tokens/read-neural-tokens";
import type { DomeNodeFrame } from "../../model/dome-view/runtime";
import { radiusForKind, type TopologyWorld } from "../world/topology-world";
import { litDrawnStateCounts, passState } from "./frame-state";
import type { FrameInputs } from "./frame-begin";
import type { FrameFocus } from "./frame-focus";
import type { NodeLayer } from "./node-layer";

/** The words Neural paints, composed by the view that owns the locale. */
export interface NeuralLabels {
  domainMeta: (counts: { capabilities: number; elements: number; stale: number }) => string;
  focusFacts: (facts: { stale: boolean; needs: number; usedBy: number }) => string;
}

/** A tapered axon is stroked in this many pieces, each a sub-curve of the same quadratic. */
const AXON_BANDS = 4;
/** Depth is drawn in this many alpha steps, so lines batch into a bounded number of strokes. */
const DEPTH_TONES = 3;
const AXON_DOT_T = 0.95;
const LIT_DOT_T = 0.96;
const NAME_GRID_PX = 48;
const DOMAIN_DIM_IN_FOCUS = 0.45;
const SPRITE_PX = 64;
const PLATE_EDGE_ALPHA = 0.2;
/** Points per lit axon a receded domain title must keep clear of. */
const LIT_PATH_SAMPLES = 10;
const LIT_PATH_PAD_PX = 4;

let tokens: NeuralTokens | null = null;
const sprites = new Map<string, HTMLCanvasElement | null>();
let signal = { focusId: null as string | null, startMs: 0 };

let sx = new Float64Array(0);
let sy = new Float64Array(0);
let sr = new Float64Array(0);
let sa = new Float64Array(0);
let su = new Float64Array(0);
let order = new Int32Array(0);
let ax = new Float64Array(0);
let ay = new Float64Array(0);
let acx = new Float64Array(0);
let acy = new Float64Array(0);
let abx = new Float64Array(0);
let aby = new Float64Array(0);
let aGroup = new Int8Array(0);

function ensure(nodes: number, edges: number): void {
  if (sx.length < nodes) {
    sx = new Float64Array(nodes); sy = new Float64Array(nodes); sr = new Float64Array(nodes);
    sa = new Float64Array(nodes); su = new Float64Array(nodes); order = new Int32Array(nodes);
  }
  if (ax.length < edges) {
    ax = new Float64Array(edges); ay = new Float64Array(edges); acx = new Float64Array(edges);
    acy = new Float64Array(edges); abx = new Float64Array(edges); aby = new Float64Array(edges);
    aGroup = new Int8Array(edges);
  }
}

/** A soft radial light of one ink, rasterised once and stamped scaled. */
function glowSprite(ink: string): HTMLCanvasElement | null {
  if (sprites.has(ink)) return sprites.get(ink)!;
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  const g = canvas?.getContext("2d") ?? null;
  if (canvas && g) {
    canvas.width = canvas.height = SPRITE_PX;
    const half = SPRITE_PX / 2;
    const gradient = g.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, ink);
    gradient.addColorStop(1, "transparent");
    g.fillStyle = gradient;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  }
  sprites.set(ink, canvas && g ? canvas : null);
  return sprites.get(ink)!;
}

function stamp(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement | null, x: number, y: number, r: number, alpha: number): void {
  if (sprite === null || alpha <= 0.004 || r <= 0.5) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
}

const at = (p0: number, p1: number, p2: number, t: number) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
/** The control of the sub-curve on [t0, t1]: the quadratic's blossom at (t0, t1). */
const subControl = (p0: number, p1: number, p2: number, t0: number, t1: number) =>
  (1 - t0) * (1 - t1) * p0 + ((1 - t0) * t1 + t0 * (1 - t1)) * p1 + t0 * t1 * p2;

function taperedAxon(ctx: CanvasRenderingContext2D, i: number, startPx: number, endPx: number): void {
  for (let band = 0; band < AXON_BANDS; band += 1) {
    const t0 = band / AXON_BANDS;
    const t1 = (band + 1) / AXON_BANDS;
    ctx.lineWidth = startPx + (endPx - startPx) * Math.sqrt((t0 + t1) / 2);
    ctx.beginPath();
    ctx.moveTo(at(ax[i], acx[i], abx[i], t0), at(ay[i], acy[i], aby[i], t0));
    ctx.quadraticCurveTo(subControl(ax[i], acx[i], abx[i], t0, t1), subControl(ay[i], acy[i], aby[i], t0, t1),
      at(ax[i], acx[i], abx[i], t1), at(ay[i], acy[i], aby[i], t1));
    ctx.stroke();
  }
}

let tractCache: { world: TopologyWorld; epoch: number; tracts: NeuralTracts } | null = null;

/**
 * Neural's route context for this frame: the one input paint, picking and the probe give
 * `projectDomeEdgeControl`, so all three bend a dependency the same way. Cached per frame epoch.
 */
export function neuralTractsFor(world: TopologyWorld, frame: ReadonlyMap<string, DomeNodeFrame>, epoch: number | null): NeuralTracts {
  if (epoch !== null && tractCache?.world === world && tractCache.epoch === epoch) return tractCache.tracts;
  const t = (tokens ??= readNeuralTokens());
  const tracts = neuralTracts(neuralGraphOf(world.nodes, world.edges), (id) => {
    const node = world.nodeById.get(id);
    const f = frame.get(id);
    return node && f ? { x: node.x + f.dx, y: node.y + f.dy } : null;
  }, { bow: t.axonBow, pull: t.tractPull, gain: t.tractGain });
  if (epoch !== null) tractCache = { world, epoch, tracts };
  return tracts;
}

const nodeIndexes = new WeakMap<readonly { id: string }[], Map<string, number>>();
function nodeIndexOf(nodes: readonly { id: string }[]): ReadonlyMap<string, number> {
  let index = nodeIndexes.get(nodes);
  if (!index) {
    index = new Map(nodes.map((node, i) => [node.id, i]));
    nodeIndexes.set(nodes, index);
  }
  return index;
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }

/** Uniform grid of occupied boxes: insert and query are O(boxes in the touched cells). */
class BoxGrid {
  private cells = new Map<number, Box[]>();
  private key(cx: number, cy: number) { return cx * 73856093 ^ cy * 19349663; }
  private span(box: Box, visit: (key: number) => boolean | void): boolean {
    for (let cx = Math.floor(box.minX / NAME_GRID_PX); cx <= Math.floor(box.maxX / NAME_GRID_PX); cx += 1) {
      for (let cy = Math.floor(box.minY / NAME_GRID_PX); cy <= Math.floor(box.maxY / NAME_GRID_PX); cy += 1) {
        if (visit(this.key(cx, cy)) === true) return true;
      }
    }
    return false;
  }
  add(box: Box): void {
    this.span(box, (key) => {
      const list = this.cells.get(key);
      if (list) list.push(box); else this.cells.set(key, [box]);
    });
  }
  hits(box: Box, ignore?: Box): boolean {
    return this.span(box, (key) => (this.cells.get(key) ?? []).some((o) => o !== ignore &&
      box.minX < o.maxX && box.maxX > o.minX && box.minY < o.maxY && box.maxY > o.minY));
  }
}

interface ClusterSummary { capabilities: number; elements: number; stale: number }
let summaryCache: { graph: NeuralGraph; evidence: unknown; byDomain: Map<string, ClusterSummary> } | null = null;

function clusterSummaries(frame: FrameInputs, graph: NeuralGraph, evidence: ReadonlyMap<string, "current" | "stale" | "unknown"> | null) {
  if (summaryCache?.graph === graph && summaryCache.evidence === evidence) return summaryCache.byDomain;
  const byDomain = new Map<string, ClusterSummary>();
  for (const node of frame.world.nodes) {
    const domain = graph.clusterOf.get(node.id);
    if (domain === undefined || node.kind === "domain" || node.kind === "project") continue;
    const sum = byDomain.get(domain) ?? { capabilities: 0, elements: 0, stale: 0 };
    if (node.kind === "capability") sum.capabilities += 1; else sum.elements += 1;
    if (neuralCellIsStale(evidence, node.id)) sum.stale += 1;
    byDomain.set(domain, sum);
  }
  summaryCache = { graph, evidence, byDomain };
  return byDomain;
}

/**
 * Neural: filled cells in the strong ink (amber when stale), dependencies as tapered axons that share a
 * tract between clusters, each domain's name above its cluster, and a focus that lights its own axons.
 * O(n log n) for the depth order, O(e) for the axons; names are bounded by `nameBudget`.
 */
export function paintNeural(frame: FrameInputs, focus: FrameFocus, layer: NodeLayer, labels: NeuralLabels | null): void {
  const { world, domeFrame, viewportWidth: width, viewportHeight: height, hoveredNodeId, colorFocusedNodeId,
    emphasisById, focusRampById, reducedMotion, now, domeLight, neural, nodeFrameAt } = frame;
  const { camX, camY, camScale, halfW, halfH } = focus;
  const { ctx } = layer;
  const t = (tokens ??= readNeuralTokens());
  const ink = t.inks;
  const evidence = domeLight?.evidence ?? null;
  const graph = neuralGraphOf(world.nodes, world.edges);
  const n = world.nodes.length;
  ensure(n, world.edges.length);
  const toScreenX = (x: number) => (x - camX) * camScale + halfW;
  const toScreenY = (y: number) => (y - camY) * camScale + halfH;
  const sizes = { capabilityPx: t.capPx, capabilityGainPx: t.capGainPx, elementPx: t.elementPx, elementGainPx: t.elementGainPx, domainPx: t.domainPx, projectPx: t.projectPx };

  const hoverRamp = hoveredNodeId !== null ? Math.min(1, emphasisById.get(hoveredNodeId) ?? 0) : 0;
  const focusId = hoverRamp > 0.001 ? hoveredNodeId : colorFocusedNodeId;
  const ramp = focusId === null ? 0 : focusId === hoveredNodeId ? hoverRamp : Math.min(1, Math.max(0, focusRampById.get(focusId) ?? 0));
  const sets = focusId !== null && ramp > 0.001 ? neuralFocusSets(world.edges, focusId) : null;
  const veilCell = 1 - (1 - t.veil) * ramp;
  const veilAxon = 1 - (1 - t.axonVeil) * ramp;
  if (focusId !== signal.focusId) signal = { focusId, startMs: now };
  const travel = reducedMotion || focusId === null ? 1 : (now - signal.startMs) / t.signalMs;

  let drawn = 0;
  litDrawnStateCounts.current = 0;
  litDrawnStateCounts.stale = 0;
  litDrawnStateCounts.unknown = 0;
  for (let i = 0; i < n; i += 1) {
    const node = world.nodes[i];
    const f = nodeFrameAt(i);
    sx[i] = toScreenX(node.x + f.dx);
    sy[i] = toScreenY(node.y + f.dy);
    const perspective = (radiusForKind(node.kind, frame.tokens) * node.magnitudeScale * f.s * camScale) / DOME_NODE_PX[node.kind];
    sr[i] = neuralCellRadiusPx(node.kind, graph.dependencyCount.get(node.id) ?? 0, sizes) * perspective;
    su[i] = f.u;
    const lit = sets === null || node.id === focusId || sets.needs.has(node.id) || sets.usedBy.has(node.id);
    sa[i] = f.a * neural * (1 - (1 - t.farAlpha) * f.u) * (lit ? 1 : veilCell);
    order[i] = i;
  }

  const tracts = domeFrame === null ? null : neuralTractsFor(world, domeFrame, null);

  // Cluster light: one soft pool behind each cluster, centred on its members.
  const arcGlow = glowSprite(ink.arc);
  const pools = new Map<string, { minX: number; maxX: number; minY: number; maxY: number; top: number; a: number }>();
  for (let i = 0; i < n; i += 1) {
    const domain = graph.clusterOf.get(world.nodes[i].id);
    if (domain === undefined || sa[i] <= 0.01) continue;
    const pool = pools.get(domain) ?? { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, top: Infinity, a: 0 };
    pool.minX = Math.min(pool.minX, sx[i]); pool.maxX = Math.max(pool.maxX, sx[i]);
    pool.minY = Math.min(pool.minY, sy[i]); pool.maxY = Math.max(pool.maxY, sy[i]);
    pool.top = Math.min(pool.top, sy[i] - sr[i]);
    pool.a = Math.max(pool.a, world.nodes[i].kind === "domain" ? sa[i] : 0);
    pools.set(domain, pool);
  }
  for (const pool of pools.values()) {
    const reach = Math.max(pool.maxX - pool.minX, pool.maxY - pool.minY) / 2 + t.clusterGlowPadPx;
    stamp(ctx, arcGlow, (pool.minX + pool.maxX) / 2, (pool.minY + pool.maxY) / 2, reach * 1.6, t.clusterGlowAlpha * neural);
  }

  // Axons at rest, batched by group: (inside or between clusters) × depth tone × source kind.
  let axons = 0;
  const indexOf = nodeIndexOf(world.nodes);
  const litEdges: number[] = [];
  const litRole: boolean[] = [];
  const litFar: number[] = [];
  for (const edge of world.edges) {
    if (!isNeuralDependency(edge)) continue;
    const s = indexOf.get(edge.sourceId);
    const e = indexOf.get(edge.targetId);
    if (s === undefined || e === undefined || s === e) continue;
    if (Math.min(sa[s], sa[e]) <= 0.004 && sets === null) continue;
    const control = projectDomeEdgeControl(edge, domeFrame, "coupling", camScale, reducedMotion ? undefined : neural, tracts);
    ax[axons] = sx[s]; ay[axons] = sy[s]; abx[axons] = sx[e]; aby[axons] = sy[e];
    acx[axons] = toScreenX(control.x); acy[axons] = toScreenY(control.y);
    const minX = Math.min(ax[axons], abx[axons], acx[axons]);
    const maxX = Math.max(ax[axons], abx[axons], acx[axons]);
    const minY = Math.min(ay[axons], aby[axons], acy[axons]);
    const maxY = Math.max(ay[axons], aby[axons], acy[axons]);
    if (maxX < 0 || minX > width || maxY < 0 || minY > height) continue;
    const needs = sets !== null && edge.sourceId === focusId;
    const usedBy = sets !== null && edge.targetId === focusId;
    if (needs || usedBy) {
      litEdges.push(axons);
      litRole.push(usedBy);
      litFar.push(needs ? e : s);
      aGroup[axons] = -1;
    } else {
      const cross = graph.clusterOf.get(edge.sourceId) !== graph.clusterOf.get(edge.targetId) ? 1 : 0;
      const tone = Math.min(DEPTH_TONES - 1, Math.floor(((su[s] + su[e]) / 2) * DEPTH_TONES));
      const capability = world.nodes[s].kind === "capability" ? 1 : 0;
      aGroup[axons] = (cross * DEPTH_TONES + tone) * 2 + capability;
    }
    axons += 1;
  }
  ctx.lineCap = "round";
  ctx.strokeStyle = ink.arc;
  ctx.fillStyle = ink.arc;
  for (let group = 0; group < 4 * DEPTH_TONES; group += 1) {
    const capability = group % 2;
    const tone = Math.floor(group / 2) % DEPTH_TONES;
    const cross = Math.floor(group / 2 / DEPTH_TONES);
    const alpha = (cross ? t.tractAlpha : t.axonAlpha) * (1 - (1 - t.farAlpha) * ((tone + 0.5) / DEPTH_TONES)) * veilAxon * neural;
    if (alpha <= 0.004) continue;
    const startPx = capability ? t.axonCapPx : t.axonElementPx;
    let any = false;
    for (let band = 0; band < AXON_BANDS; band += 1) {
      const t0 = band / AXON_BANDS;
      const t1 = (band + 1) / AXON_BANDS;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = startPx + (t.axonEndPx - startPx) * Math.sqrt((t0 + t1) / 2);
      ctx.beginPath();
      for (let i = 0; i < axons; i += 1) {
        if (aGroup[i] !== group) continue;
        any = true;
        ctx.moveTo(at(ax[i], acx[i], abx[i], t0), at(ay[i], acy[i], aby[i], t0));
        ctx.quadraticCurveTo(subControl(ax[i], acx[i], abx[i], t0, t1), subControl(ay[i], acy[i], aby[i], t0, t1),
          at(ax[i], acx[i], abx[i], t1), at(ay[i], acy[i], aby[i], t1));
      }
      if (!any) break;
      ctx.stroke();
    }
    if (!any) continue;
    ctx.globalAlpha = Math.min(1, alpha * 1.7);
    ctx.beginPath();
    for (let i = 0; i < axons; i += 1) {
      if (aGroup[i] !== group) continue;
      const x = at(ax[i], acx[i], abx[i], AXON_DOT_T);
      const y = at(ay[i], acy[i], aby[i], AXON_DOT_T);
      ctx.moveTo(x + t.axonDotPx, y);
      ctx.arc(x, y, t.axonDotPx, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // Cells, far to near: glow, filled body, a capability's nucleus, a domain's ring.
  const sorted = order.subarray(0, n).sort((a, b) => su[b] - su[a]);
  const strongGlow = glowSprite(ink.strong);
  const warningGlow = glowSprite(ink.warning);
  for (let k = 0; k < n; k += 1) {
    const i = sorted[k];
    const alpha = sa[i];
    const r = sr[i];
    if (alpha <= 0.01 || sx[i] < -r * 4 || sy[i] < -r * 4 || sx[i] > width + r * 4 || sy[i] > height + r * 4) continue;
    const node = world.nodes[i];
    const stale = neuralCellIsStale(evidence, node.id);
    const body = node.kind === "project" ? ink.project : stale ? ink.warning : ink.strong;
    drawn += 1;
    if (evidence === null || !evidence.has(node.id)) litDrawnStateCounts.unknown += 1;
    else litDrawnStateCounts[stale ? "stale" : "current"] += 1;
    stamp(ctx, stale ? warningGlow : strongGlow, sx[i], sy[i], r * t.glowReach, alpha * t.glowAlpha);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(sx[i], sy[i], r, 0, Math.PI * 2);
    ctx.fill();
    if (node.kind === "capability") {
      ctx.globalAlpha = alpha * t.nucleusAlpha;
      ctx.fillStyle = ink.ground;
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], r * t.nucleusShare, 0, Math.PI * 2);
      ctx.fill();
    } else if (node.kind === "domain" || node.kind === "project") {
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = body;
      ctx.lineWidth = t.ringPx;
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], r + t.ringGapPx, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  passState.drawnNodeCount = drawn;

  // The focus's own axons, its ring, and the signal travelling each lit axon once.
  const focusIndex = focusId === null ? undefined : indexOf.get(focusId);
  if (sets !== null && focusIndex !== undefined) {
    const whiteGlow = glowSprite(ink.strong);
    for (let k = 0; k < litEdges.length; k += 1) {
      const i = litEdges[k];
      const lineInk = litRole[k] ? ink.reach : ink.arc;
      ctx.globalAlpha = t.litAlpha * ramp * neural;
      ctx.strokeStyle = lineInk;
      ctx.shadowColor = lineInk;
      ctx.shadowBlur = t.litGlowPx;
      taperedAxon(ctx, i, t.litStartPx, t.litEndPx);
      ctx.shadowBlur = 0;
      ctx.fillStyle = lineInk;
      ctx.beginPath();
      ctx.arc(at(ax[i], acx[i], abx[i], LIT_DOT_T), at(ay[i], acy[i], aby[i], LIT_DOT_T), t.litDotPx, 0, Math.PI * 2);
      ctx.fill();
      if (travel < 1) {
        const x = at(ax[i], acx[i], abx[i], travel);
        const y = at(ay[i], acy[i], aby[i], travel);
        stamp(ctx, whiteGlow, x, y, t.signalGlowPx, 0.85 * ramp * neural);
        ctx.globalAlpha = ramp * neural;
        ctx.fillStyle = ink.strong;
        ctx.beginPath();
        ctx.arc(x, y, t.signalPx, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = ramp * neural;
    ctx.strokeStyle = ink.strong;
    ctx.lineWidth = t.focusRingPx;
    ctx.beginPath();
    ctx.arc(sx[focusIndex], sy[focusIndex], sr[focusIndex] + t.focusRingGapPx, 0, Math.PI * 2);
    ctx.stroke();
  }

  const lit = { edges: litEdges, far: litFar, farIsTarget: litRole.map((usedBy) => !usedBy) };
  paintNeuralNames(ctx, frame, graph, evidence, labels, { focusId, focusIndex, sets, ramp, lit }, pools);
  ctx.globalAlpha = 1;
}

function paintNeuralNames(
  ctx: CanvasRenderingContext2D,
  frame: FrameInputs,
  graph: NeuralGraph,
  evidence: ReadonlyMap<string, "current" | "stale" | "unknown"> | null,
  labels: NeuralLabels | null,
  focus: {
    focusId: string | null;
    focusIndex: number | undefined;
    sets: { needs: Set<string>; usedBy: Set<string> } | null;
    ramp: number;
    lit: { edges: readonly number[]; far: readonly number[]; farIsTarget: readonly boolean[] };
  },
  pools: ReadonlyMap<string, { minX: number; maxX: number; maxY: number; top: number; a: number }>,
): void {
  const t = tokens!;
  const ink = t.inks;
  const { world, neural, viewportWidth: width, viewportHeight: height } = frame;
  const family = labelFontFamily();
  const cells = new BoxGrid();
  const names = new BoxGrid();
  const boxes: typeof passState.drawnLabelBoxes = [];
  for (let i = 0; i < world.nodes.length; i += 1) {
    if (sa[i] <= 0.05) continue;
    const r = sr[i] + 2;
    cells.add({ minX: sx[i] - r, minY: sy[i] - r, maxX: sx[i] + r, maxY: sy[i] + r });
  }
  ctx.lineJoin = "round";
  ctx.textBaseline = "middle";
  const write = (text: string, x: number, y: number, align: CanvasTextAlign, font: string, fill: string, alpha: number, halo: number) => {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ink.halo;
    ctx.lineWidth = halo;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  };
  const boxFor = (text: string, x: number, y: number, align: CanvasTextAlign, px: number): Box => {
    const w = ctx.measureText(text).width;
    const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    return { minX: left - 3, minY: y - px * 0.62 - 2, maxX: left + w + 3, maxY: y + px * 0.62 + 2 };
  };
  const focusId = focus.focusId;
  const sets = focus.sets;
  // Where each lit axon arrives at its far end, and how many leave the focus to the right.
  const arrival = new Map<number, { dx: number; dy: number }>();
  const litPath = new BoxGrid();
  let litRight = 0;
  for (let k = 0; k < focus.lit.edges.length; k += 1) {
    const e = focus.lit.edges[k];
    const far = focus.lit.far[k];
    const [fx, fy, nx] = focus.lit.farIsTarget[k] ? [abx[e], aby[e], ax[e]] : [ax[e], ay[e], abx[e]];
    const into = arrival.get(far) ?? { dx: 0, dy: 0 };
    const len = Math.hypot(acx[e] - fx, acy[e] - fy) || 1;
    into.dx += (acx[e] - fx) / len;
    into.dy += (acy[e] - fy) / len;
    arrival.set(far, into);
    if (acx[e] > nx) litRight += 1;
    for (let j = 1; j < LIT_PATH_SAMPLES; j += 1) {
      const x = at(ax[e], acx[e], abx[e], j / LIT_PATH_SAMPLES);
      const y = at(ay[e], acy[e], aby[e], j / LIT_PATH_SAMPLES);
      litPath.add({ minX: x - LIT_PATH_PAD_PX, minY: y - LIT_PATH_PAD_PX, maxX: x + LIT_PATH_PAD_PX, maxY: y + LIT_PATH_PAD_PX });
    }
  }
  const plate = focusId !== null && focus.focusIndex !== undefined && sets !== null && labels
    ? placeFocusPlate(ctx, frame, focus.focusIndex, labels.focusFacts({
      stale: neuralCellIsStale(evidence, focusId), needs: sets.needs.size, usedBy: sets.usedBy.size,
    }), family, litRight * 2 <= focus.lit.edges.length)
    : null;
  if (plate) names.add(plate.box);

  // Capability names beside their cells at rest; with a focus, its two sets first, each name on
  // the side its arriving axons leave free.
  const candidates: number[] = [];
  for (let i = 0; i < world.nodes.length; i += 1) {
    const node = world.nodes[i];
    if (node.id === focusId || sa[i] <= 0.05) continue;
    const hot = sets !== null && (sets.needs.has(node.id) || sets.usedBy.has(node.id));
    if (sets !== null ? hot : node.kind === "capability") candidates.push(i);
  }
  const rank = (i: number) => (graph.dependencyCount.get(world.nodes[i].id) ?? 0) - su[i] * 4;
  candidates.sort((a, b) => rank(b) - rank(a));
  const hot = sets !== null;
  const font = `${hot ? FONT_WEIGHT.emphasis : FONT_WEIGHT.signature} ${t.namePx}px ${family}`;
  const placeName = (i: number): boolean => {
    const node = world.nodes[i];
    const cluster = graph.clusterOf.get(node.id);
    const pool = cluster === undefined ? undefined : pools.get(cluster);
    const into = arrival.get(i);
    const right = into ? into.dx <= 0 : pool === undefined || sx[i] >= (pool.minX + pool.maxX) / 2;
    const gap = sr[i] + t.nameGapPx;
    ctx.font = font;
    const tries: [number, number, CanvasTextAlign, number, number][] = [
      [sx[i] + (right ? gap : -gap), sy[i], right ? "left" : "right", right ? 1 : -1, 0],
      [sx[i] + (right ? -gap : gap), sy[i], right ? "right" : "left", right ? -1 : 1, 0],
      [sx[i], sy[i] + gap + t.namePx * 0.5, "center", 0, 1],
      [sx[i], sy[i] - gap - t.namePx * 0.5, "center", 0, -1],
    ];
    if (into) tries.sort((a, b) => (a[3] * into.dx + a[4] * into.dy) - (b[3] * into.dx + b[4] * into.dy));
    for (const clearOfLit of hot ? [true, false] : [false]) {
      for (const [x, y, align] of tries) {
        const box = boxFor(node.label, x, y, align, t.namePx);
        if (box.maxX < 0 || box.minX > width || box.maxY < 0 || box.minY > height) continue;
        // A focus's names may cross a receded cell, never another name, and a lit axon only if no side is clear.
        if (names.hits(box) || (!hot && cells.hits(box)) || (clearOfLit && litPath.hits(box))) continue;
        const alpha = (hot ? focus.ramp : 0.9 * (1 - (1 - t.farAlpha) * su[i])) * neural;
        write(node.label, x, y, align, font, hot ? ink.strong : ink.name, alpha, t.nameHaloPx);
        names.add(box);
        boxes.push({ nodeId: node.id, text: node.label, ...box });
        return true;
      }
    }
    return false;
  };
  let named = 0;
  if (hot) for (const i of candidates) if (named < t.nameBudget && placeName(i)) named += 1;

  // Every domain's name above its cluster, or below when above is taken. With a focus, a receded
  // title gives way to the lit names and axons.
  const nameFont = `${FONT_WEIGHT.strong} ${t.domainNamePx}px ${family}`;
  const metaFont = `${FONT_WEIGHT.signature} ${t.domainMetaPx}px ${family}`;
  const summaries = clusterSummaries(frame, graph, evidence);
  const focusCluster = focusId === null ? undefined : graph.clusterOf.get(focusId);
  const domainOrder = [...pools.entries()].sort((a, b) => b[1].a - a[1].a || (summaries.get(b[0])?.capabilities ?? 0) - (summaries.get(a[0])?.capabilities ?? 0));
  for (const [domainId, pool] of domainOrder) {
    if (pool.a <= 0.05) continue;
    const node = world.nodeById.get(domainId);
    if (!node) continue;
    const summary = summaries.get(domainId);
    const meta = labels && summary ? labels.domainMeta(summary) : null;
    const x = (pool.minX + pool.maxX) / 2;
    const titleAt = (metaY: number) => {
      const nameY = metaY - t.domainNameGapPx;
      ctx.font = nameFont;
      const nameBox = boxFor(node.label, x, nameY, "center", t.domainNamePx);
      ctx.font = metaFont;
      const metaBox = meta ? boxFor(meta, x, metaY, "center", t.domainMetaPx) : nameBox;
      const box = {
        minX: Math.min(nameBox.minX, metaBox.minX), minY: nameBox.minY,
        maxX: Math.max(nameBox.maxX, metaBox.maxX), maxY: metaBox.maxY,
      };
      return { nameY, metaY, nameBox, box };
    };
    const above = titleAt(pool.top - t.domainMetaGapPx);
    const below = titleAt(pool.maxY + t.domainMetaGapPx + t.domainNameGapPx);
    const receded = focusCluster !== undefined && focusCluster !== domainId;
    const free = (b: Box) => !names.hits(b) && !(receded && litPath.hits(b));
    const chosen = free(above.box) && !cells.hits(above.box) ? above
      : free(below.box) && !cells.hits(below.box) ? below
      : free(above.box) ? above : null;
    if (chosen === null && hot) continue;
    const title = chosen ?? above;
    if (title.box.maxX < -200 || title.box.minX > width + 200 || title.box.maxY < -40 || title.box.minY > height + 40) continue;
    const dim = (receded ? 1 - (1 - DOMAIN_DIM_IN_FOCUS) * focus.ramp : 1) * pool.a * neural;
    write(node.label, x, title.nameY, "center", nameFont, ink.strong, 0.96 * dim, t.nameHaloPx + 1);
    if (meta) write(meta, x, title.metaY, "center", metaFont, ink.name, 0.85 * dim, t.nameHaloPx);
    names.add(title.box);
    boxes.push({ nodeId: domainId, text: node.label, ...title.nameBox });
  }

  if (!hot) for (const i of candidates) if (named < t.nameBudget && placeName(i)) named += 1;

  if (plate && focusId !== null) {
    paintFocusPlate(ctx, plate, focus.ramp * neural, neuralCellIsStale(evidence, focusId));
    boxes.push({ nodeId: focusId, text: plate.title, ...plate.box });
  }
  passState.drawnLabelBoxes = boxes;
}

interface FocusPlate { box: Box; title: string; facts: string; titleFont: string; factFont: string }

/** One plate beside the focus: its name, then stale, needs and used-by; on the side with fewer lit axons that fits. */
function placeFocusPlate(ctx: CanvasRenderingContext2D, frame: FrameInputs, i: number, facts: string, family: string, preferRight: boolean): FocusPlate {
  const t = tokens!;
  const title = frame.world.nodes[i].label;
  const titleFont = `${FONT_WEIGHT.emphasis} ${t.namePx + 2.5}px ${family}`;
  const factFont = `${FONT_WEIGHT.signature} ${t.domainMetaPx - 0.5}px ${family}`;
  ctx.font = titleFont;
  const titleW = ctx.measureText(title).width;
  ctx.font = factFont;
  const w = Math.max(titleW, ctx.measureText(facts).width) + t.platePadPx * 2;
  const h = t.namePx * 2 + t.platePadPx * 1.8;
  const reach = sr[i] + t.focusRingGapPx + t.platePadPx;
  const fitsRight = sx[i] + reach + w <= frame.viewportWidth - t.platePadPx;
  const fitsLeft = sx[i] - reach - w >= t.platePadPx;
  const x = (preferRight ? fitsRight || !fitsLeft : !fitsLeft && fitsRight) ? sx[i] + reach : sx[i] - reach - w;
  const y = Math.max(t.platePadPx, sy[i] - h - sr[i]);
  return { box: { minX: x, minY: y, maxX: x + w, maxY: y + h }, title, facts, titleFont, factFont };
}

function paintFocusPlate(ctx: CanvasRenderingContext2D, plate: FocusPlate, alpha: number, stale: boolean): void {
  const t = tokens!;
  const { minX: x, minY: y, maxX, maxY } = plate.box;
  const h = maxY - y;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = t.inks.plate;
  ctx.beginPath();
  ctx.roundRect(x, y, maxX - x, h, t.plateRadiusPx);
  ctx.fill();
  ctx.globalAlpha = alpha * PLATE_EDGE_ALPHA;
  ctx.strokeStyle = t.inks.name;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "left";
  ctx.font = plate.titleFont;
  ctx.fillStyle = t.inks.strong;
  ctx.fillText(plate.title, x + t.platePadPx, y + h * 0.34);
  ctx.font = plate.factFont;
  ctx.fillStyle = stale ? t.inks.warning : t.inks.name;
  ctx.fillText(plate.facts, x + t.platePadPx, y + h * 0.72);
}
