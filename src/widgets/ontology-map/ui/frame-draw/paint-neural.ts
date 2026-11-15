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
import { isOutwardHop, type NeuralImpact } from "../../model/dome-view/neural-impact";
import { standingDomainTitles, type TitleCandidate } from "../../model/dome-view/neural-titles";
import { isPathLensEdge } from "../../model/visibility/path-lens";
import { labelFontFamily } from "../../render/labels";
import { readNeuralTokens, type NeuralTokens } from "../../tokens/read-neural-tokens";
import type { DomeNodeFrame } from "../../model/dome-view/runtime";
import { radiusForKind, type TopologyWorld, type WorldNode } from "../world/topology-world";
import { litDrawnStateCounts, passState } from "./frame-state";
import type { FrameInputs } from "./frame-begin";
import type { FrameFocus } from "./frame-focus";
import {
  abx, aby, acx, acy, aGroup, at, AXON_BANDS, ax, ay, bandWidthPx, ensureAxons, glowSprite, litAxon, litEdge,
  litFarNode, litHop, stamp, taperedAxon, traceAxon,
} from "./neural-axons";
import { litRaster } from "./neural-lit-raster";
import { impactStrength, lastLit, LIT_DOT_T, neuralSpreadFrame, paintSpread, SIGNAL_GLOW_ALPHA } from "./neural-spread";
import type { NodeLayer } from "./node-layer";

/** The words Neural paints, composed by the view that owns the locale. */
export interface NeuralLabels {
  domainMeta: (counts: { capabilities: number; elements: number; stale: number }) => string;
  /** `impact` is present on a selection whose impact reaches past its direct dependents. */
  focusFacts: (facts: { stale: boolean; needs: number; usedBy: number; impact?: number }) => string;
}

/** Depth is drawn in this many alpha steps, so lines batch into a bounded number of strokes. */
const DEPTH_TONES = 3;
const AXON_DOT_T = 0.95;
const NAME_GRID_PX = 48;
const PLATE_EDGE_ALPHA = 0.2;
/** A cluster's soft pool reaches this far past its members' half-span. */
const CLUSTER_POOL_REACH = 1.6;
/** An axon's end dot is this much brighter than its stroke. */
const AXON_DOT_GAIN = 1.7;
/** A domain's or the project's ring under its body. */
const RING_ALPHA = 0.8;
/** A name's rank: dependencies first, then nearness, one dependency weighing a quarter of the depth. */
const NAME_DEPTH_WEIGHT = 4;
/** A rest name's alpha before depth fades it. */
const REST_NAME_ALPHA = 0.9;
const TITLE_NAME_ALPHA = 0.96;
const TITLE_META_ALPHA = 0.85;
/** A domain name's halo is this much wider than a capability name's. */
const TITLE_HALO_EXTRA_PX = 1;
/** The focus plate's title is this much larger than a name, its facts this much smaller than a domain's meta. */
const PLATE_TITLE_EXTRA_PX = 2.5;
const PLATE_FACT_LESS_PX = 0.5;
/** The plate holds two lines of names and this many paddings of air. */
const PLATE_LINES = 2;
const PLATE_PAD_SHARE = 1.8;
/** How far, in name heights, a focus's name may stand off its first places to keep clear of lit axons. */
const NAME_NUDGE_LINES = 1.2;
/** A selection's indirect dependents take at most this share of the name budget, nearest first. */
const INDIRECT_NAME_SHARE = 0.25;
/** At most this many names are tried per drawn name, so a dense frame stops early. */
const NAME_TRIES_PER_NAME = 4;
/** Off-screen cells this far past an edge may still put a name on screen. */
const NAME_CULL_MARGIN_PX = 160;

/** A cell at distance d starts to lift this share of a hop before the signal reaches it. */
const CELL_LIFT_HOPS = 0.15;

let tokens: NeuralTokens | null = null;
/** Measured label widths per font, so a label is measured once rather than once per placement try. */
const labelWidths = new Map<string, Map<string, number>>();
const LABEL_WIDTH_FONTS_MAX = 8;

let sx = new Float64Array(0);
let sy = new Float64Array(0);
let sr = new Float64Array(0);
let sa = new Float64Array(0);
let su = new Float64Array(0);
let restAlpha = new Float64Array(0);
let order = new Int32Array(0);
function ensure(nodes: number, edges: number): void {
  if (sx.length < nodes) {
    sx = new Float64Array(nodes); sy = new Float64Array(nodes); sr = new Float64Array(nodes);
    sa = new Float64Array(nodes); su = new Float64Array(nodes); order = new Int32Array(nodes);
    restAlpha = new Float64Array(nodes);
  }
  ensureAxons(edges);
}

let tractCache: { world: TopologyWorld; epoch: number; tracts: NeuralTracts } | null = null;

/** Zooming in past the whole-cloud fit grows the cells with the camera, up to `zoomGrowMax`. */
function zoomGrowthOf(camScale: number, restFitScale: number | null, t: NeuralTokens): number {
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
  const t = (tokens ??= readNeuralTokens());
  const dependencies = neuralGraphOf(world.nodes, world.edges).dependencyCount.get(node.id) ?? 0;
  return (perspective * neuralCellRadiusPx(node.kind, dependencies, cellSizesOf(t)) * zoomGrowthOf(camScale, restFitScale, t)) / DOME_NODE_PX[node.kind];
}

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

const axonKey = (edge: { sourceId: string; targetId: string }) => `${edge.sourceId}\u0000${edge.targetId}`;

/** The dependencies a person is pointing at: a hovered or selected axon, or the path lens's axons. Null when none. */
function litAxonKeys(frame: FrameInputs): Set<string> | null {
  const keys = new Set<string>();
  if (frame.hoveredEdge) keys.add(axonKey(frame.hoveredEdge));
  else if (frame.selectedEdge) keys.add(axonKey(frame.selectedEdge));
  if (frame.mapLensKind === "path" && frame.pathEdgeIds !== null && frame.pathEdgeIds.size > 0) {
    for (const edge of frame.world.edges) {
      if (isNeuralDependency(edge) && isPathLensEdge(frame.mapLensKind, edge.id, frame.pathEdgeIds)) keys.add(axonKey(edge));
    }
  }
  return keys.size > 0 ? keys : null;
}

/** A lit axon lights both its ends: what it depends on as needed, the dependent as using it. */
function axonEnds(edges: readonly { sourceId: string; targetId: string }[], keys: ReadonlySet<string>) {
  const needs = new Set<string>();
  const usedBy = new Set<string>();
  for (const edge of edges) {
    if (!keys.has(axonKey(edge))) continue;
    needs.add(edge.targetId);
    usedBy.add(edge.sourceId);
  }
  return { needs, usedBy };
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
 * O(n log n) for the depth order and O(e) for the axons. Names: O(n) to gather on-screen candidates,
 * O(c log c) to rank the c on screen, and at most `nameBudget × NAME_TRIES_PER_NAME` placements, each
 * measuring its label once per font.
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

  const hoverRamp = hoveredNodeId !== null ? Math.min(1, emphasisById.get(hoveredNodeId) ?? 0) : 0;
  // A hovered concept leads; then a hovered, selected or path axon; then the selected concept.
  const litAxons = hoverRamp > 0.001 ? null : litAxonKeys(frame);
  const focusId = hoverRamp > 0.001 ? hoveredNodeId : litAxons !== null ? null : colorFocusedNodeId;
  const ramp = litAxons !== null ? 1 : focusId === null ? 0 : focusId === hoveredNodeId ? hoverRamp : Math.min(1, Math.max(0, focusRampById.get(focusId) ?? 0));
  const sets = litAxons !== null ? axonEnds(world.edges, litAxons) : focusId !== null && ramp > 0.001 ? neuralFocusSets(world.edges, focusId) : null;
  const indexOf = nodeIndexOf(world.nodes);
  const { impact, hopOf, spread, travel } = neuralSpreadFrame({ graph, nodes: world.nodes, indexOf, focusId,
    focusedNodeId: frame.focusedNodeId, hoveredNodeId, sets, litAxons, now, reducedMotion }, t);
  const veilCell = 1 - (1 - t.veil) * ramp;
  const veilAxon = 1 - (1 - t.axonVeil) * ramp;

  const zoomGrowth = zoomGrowthOf(camScale, frame.domeFitScale ?? null, t);
  let drawn = 0;
  litDrawnStateCounts.current = 0;
  litDrawnStateCounts.stale = 0;
  litDrawnStateCounts.unknown = 0;
  for (let i = 0; i < n; i += 1) {
    const node = world.nodes[i];
    const f = nodeFrameAt(i);
    sx[i] = toScreenX(node.x + f.dx);
    sy[i] = toScreenY(node.y + f.dy);
    sr[i] = radiusForKind(node.kind, frame.tokens) * node.magnitudeScale * camScale *
      neuralRadiusScale(world, node, f.s, camScale, frame.domeFitScale ?? null);
    su[i] = f.u;
    restAlpha[i] = f.a * neural * (1 - (1 - t.farAlpha) * f.u);
    const hop = hopOf === null ? -1 : hopOf[i];
    const needed = sets !== null && sets.needs.has(node.id);
    if (hop > 0 && !needed) {
      const lift = Math.min(1, Math.max(0, (spread - hop + CELL_LIFT_HOPS) / CELL_LIFT_HOPS));
      if (lift >= 1) lastLit.liftedCells += 1;
      sa[i] = restAlpha[i] * (veilCell + (1 - veilCell) * impactStrength(t, hop) * lift);
    } else {
      if (hop > 0) lastLit.liftedCells += 1;
      const lit = sets === null || node.id === focusId || needed || (hopOf === null && sets.usedBy.has(node.id));
      sa[i] = restAlpha[i] * (lit ? 1 : veilCell);
    }
    order[i] = i;
  }

  const tracts = domeFrame === null ? null : neuralTractsFor(world, domeFrame, null);

  // Cluster light: one soft pool behind each cluster, centred on its members.
  const arcGlow = glowSprite(ink.arc);
  const pools = new Map<string, { minX: number; maxX: number; minY: number; maxY: number; top: number; a: number; depth: number }>();
  for (let i = 0; i < n; i += 1) {
    const domain = graph.clusterOf.get(world.nodes[i].id);
    if (domain === undefined || sa[i] <= 0.01) continue;
    const pool = pools.get(domain) ?? { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, top: Infinity, a: 0, depth: 0 };
    pool.minX = Math.min(pool.minX, sx[i]); pool.maxX = Math.max(pool.maxX, sx[i]);
    pool.minY = Math.min(pool.minY, sy[i]); pool.maxY = Math.max(pool.maxY, sy[i]);
    pool.top = Math.min(pool.top, sy[i] - sr[i]);
    if (world.nodes[i].kind === "domain") {
      pool.a = Math.max(pool.a, restAlpha[i]);
      pool.depth = su[i];
    }
    pools.set(domain, pool);
  }
  for (const pool of pools.values()) {
    const reach = Math.max(pool.maxX - pool.minX, pool.maxY - pool.minY) / 2 + t.clusterGlowPadPx;
    stamp(ctx, arcGlow, (pool.minX + pool.maxX) / 2, (pool.minY + pool.maxY) / 2, reach * CLUSTER_POOL_REACH, t.clusterGlowAlpha * neural);
  }

  // Axons at rest, batched by group: (inside or between clusters) × depth tone × source kind.
  let axons = 0;
  let litCount = 0;
  for (let edgeIndex = 0; edgeIndex < world.edges.length; edgeIndex += 1) {
    const edge = world.edges[edgeIndex];
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
    const needs = (litAxons !== null && litAxons.has(axonKey(edge))) || (sets !== null && edge.sourceId === focusId);
    const hop = needs ? 0
      : hopOf !== null ? (isOutwardHop(hopOf[e], hopOf[s]) ? hopOf[s] : -1)
      : sets !== null && edge.targetId === focusId ? 1 : -1;
    // A selection's dependency lights once its hop starts and stops receding once the hop arrives.
    const started = hop === 0 || (hop > 0 && (hopOf === null || spread > hop - 1));
    if (started) {
      litAxon[litCount] = axons;
      litFarNode[litCount] = hop === 0 ? e : s;
      litEdge[litCount] = edgeIndex;
      litHop[litCount] = hop;
      litCount += 1;
    }
    if (started && (hopOf === null || hop === 0 || spread >= hop)) {
      aGroup[axons] = -1;
    } else {
      const cross = graph.clusterOf.get(edge.sourceId) !== graph.clusterOf.get(edge.targetId) ? 1 : 0;
      const tone = Math.min(DEPTH_TONES - 1, Math.floor(((su[s] + su[e]) / 2) * DEPTH_TONES));
      const capability = world.nodes[s].kind === "capability" ? 1 : 0;
      aGroup[axons] = (cross * DEPTH_TONES + tone) * 2 + capability;
    }
    axons += 1;
  }
  lastLit.edges = world.edges;
  lastLit.litCount = litCount;
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
      ctx.globalAlpha = alpha;
      ctx.lineWidth = bandWidthPx(band, startPx, t.axonEndPx);
      ctx.beginPath();
      for (let i = 0; i < axons; i += 1) {
        if (aGroup[i] !== group) continue;
        any = true;
        traceAxon(ctx, i, band / AXON_BANDS, (band + 1) / AXON_BANDS);
      }
      if (!any) break;
      ctx.stroke();
    }
    if (!any) continue;
    ctx.globalAlpha = Math.min(1, alpha * AXON_DOT_GAIN);
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
      ctx.globalAlpha = alpha * RING_ALPHA;
      ctx.strokeStyle = body;
      ctx.lineWidth = t.ringPx;
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], r + t.ringGapPx, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  passState.drawnNodeCount = drawn;

  // The lit axons, the focus's ring, and the signal: once along each lit axon, or a selection's spread.
  const focusIndex = focusId === null ? undefined : indexOf.get(focusId);
  if (sets !== null) {
    const whiteGlow = glowSprite(ink.strong);
    for (let k = 0; k < litCount; k += 1) {
      if (hopOf !== null && litHop[k] > 0) continue;
      const i = litAxon[k];
      const lineInk = litHop[k] > 0 ? ink.reach : ink.arc;
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
        stamp(ctx, whiteGlow, x, y, t.signalGlowPx, SIGNAL_GLOW_ALPHA * ramp * neural);
        ctx.globalAlpha = ramp * neural;
        ctx.fillStyle = ink.strong;
        ctx.beginPath();
        ctx.arc(x, y, t.signalPx, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (hopOf !== null) paintSpread(ctx, t, litCount, spread, ramp * neural, whiteGlow);
    if (focusIndex !== undefined) {
      ctx.globalAlpha = ramp * neural;
      ctx.strokeStyle = ink.strong;
      ctx.lineWidth = t.focusRingPx;
      ctx.beginPath();
      ctx.arc(sx[focusIndex], sy[focusIndex], sr[focusIndex] + t.focusRingGapPx, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  paintNeuralNames(ctx, frame, graph, evidence, labels, { focusId, focusIndex, sets, ramp, litCount, hopOf, impact, spread, zoomGrowth }, pools);
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
    /** How many of `litAxon`, `litFarNode` and `litHop` this frame filled. */
    litCount: number;
    hopOf: Int32Array | null;
    impact: NeuralImpact | null;
    spread: number;
    zoomGrowth: number;
  },
  pools: ReadonlyMap<string, { minX: number; maxX: number; minY: number; maxY: number; top: number; a: number; depth: number }>,
): void {
  const t = tokens!;
  const ink = t.inks;
  const { world, neural, viewportWidth: width, viewportHeight: height } = frame;
  const family = labelFontFamily();
  const cells = new BoxGrid();
  const names = new BoxGrid();
  const boxes: typeof passState.drawnLabelBoxes = [];
  // A focus's names may cross a receded cell, so the cells are gathered only at rest.
  for (let i = 0; i < world.nodes.length && focus.sets === null; i += 1) {
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
  const widthOf = (text: string): number => {
    let widths = labelWidths.get(ctx.font);
    if (!widths) {
      if (labelWidths.size >= LABEL_WIDTH_FONTS_MAX) labelWidths.clear();
      widths = new Map();
      labelWidths.set(ctx.font, widths);
    }
    let w = widths.get(text);
    if (w === undefined) {
      w = ctx.measureText(text).width;
      widths.set(text, w);
    }
    return w;
  };
  const boxFor = (text: string, x: number, y: number, align: CanvasTextAlign, px: number): Box => {
    const w = widthOf(text);
    const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    return { minX: left - 3, minY: y - px * 0.62 - 2, maxX: left + w + 3, maxY: y + px * 0.62 + 2 };
  };
  const focusId = focus.focusId;
  const sets = focus.sets;
  const { hopOf, spread } = focus;
  // Where each lit axon arrives at its far end, and how many of the focus's own leave it to the right.
  const arrival = new Map<number, { dx: number; dy: number }>();
  const litPath = litRaster;
  litPath.reset(width, height);
  let litRight = 0;
  let litOwn = 0;
  for (let k = 0; k < focus.litCount; k += 1) {
    const e = litAxon[k];
    const far = litFarNode[k];
    const farIsTarget = litHop[k] === 0;
    const fx = farIsTarget ? abx[e] : ax[e];
    const fy = farIsTarget ? aby[e] : ay[e];
    const nx = farIsTarget ? ax[e] : abx[e];
    const into = arrival.get(far) ?? { dx: 0, dy: 0 };
    const len = Math.hypot(acx[e] - fx, acy[e] - fy) || 1;
    into.dx += (acx[e] - fx) / len;
    into.dy += (acy[e] - fy) / len;
    arrival.set(far, into);
    if (litHop[k] <= 1) {
      litOwn += 1;
      if (acx[e] > nx) litRight += 1;
    }
    litPath.markAxon(e);
  }
  const impactSize = focus.impact?.distance.size ?? 0;
  const plate = focusId !== null && focus.focusIndex !== undefined && sets !== null && labels
    ? placeFocusPlate(ctx, frame, focus.focusIndex, labels.focusFacts({
      stale: neuralCellIsStale(evidence, focusId), needs: sets.needs.size, usedBy: sets.usedBy.size,
      ...(impactSize > sets.usedBy.size ? { impact: impactSize } : {}),
    }), family, litRight * 2 <= litOwn)
    : null;
  lastLit.plateFacts = plate?.facts ?? null;
  if (plate) names.add(plate.box);
  if (focus.focusIndex !== undefined && sets !== null) {
    const f = focus.focusIndex;
    const ring = sr[f] + t.focusRingGapPx + t.focusRingPx;
    names.add({ minX: sx[f] - ring, minY: sy[f] - ring, maxX: sx[f] + ring, maxY: sy[f] + ring });
  }

  // Capability names beside their cells at rest; with a focus, its direct ends first and then a
  // selection's arrived dependents nearest first, each name on the side its arriving axons leave free.
  const candidates: number[] = [];
  // A selection's dependent is named once its hop has arrived.
  const nameStep = (i: number) => {
    const id = world.nodes[i].id;
    if (sets === null) return 0;
    if (sets.needs.has(id)) return 1;
    if (hopOf === null) return sets.usedBy.has(id) ? 1 : 0;
    return hopOf[i] > 0 && spread >= hopOf[i] ? hopOf[i] : 0;
  };
  for (let i = 0; i < world.nodes.length; i += 1) {
    const node = world.nodes[i];
    if (node.id === focusId || sa[i] <= 0.05) continue;
    if (sx[i] < -NAME_CULL_MARGIN_PX || sx[i] > width + NAME_CULL_MARGIN_PX || sy[i] < -NAME_CULL_MARGIN_PX || sy[i] > height + NAME_CULL_MARGIN_PX) continue;
    if (sets !== null ? nameStep(i) > 0 : node.kind === "capability") candidates.push(i);
  }
  const rank = (i: number) => (graph.dependencyCount.get(world.nodes[i].id) ?? 0) - su[i] * NAME_DEPTH_WEIGHT;
  candidates.sort(sets !== null ? (a, b) => nameStep(a) - nameStep(b) || rank(b) - rank(a) : (a, b) => rank(b) - rank(a));
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
    // Clear of every lit axon, a name may also stand a line off each side before it crosses one.
    const nudge = t.namePx * NAME_NUDGE_LINES;
    const nudged = hot ? tries.flatMap(([x, y, align, dx, dy]): (typeof tries)[number][] => dy === 0
      ? [[x, y - nudge, align, dx, dy], [x, y + nudge, align, dx, dy]]
      : [[x, y + dy * nudge, align, dx, dy]]) : [];
    const direct = nameStep(i) === 1;
    for (const clearOfLit of hot ? (direct ? [true, false] : [true]) : [false]) {
      for (const [x, y, align] of clearOfLit ? [...tries, ...nudged] : tries) {
        const box = boxFor(node.label, x, y, align, t.namePx);
        if (box.maxX < 0 || box.minX > width || box.maxY < 0 || box.minY > height) continue;
        // A focus's names may cross a receded cell, never another name or the focus's ring; only a
        // direct end's name may cross a lit axon, and only if no side is clear.
        if (names.hits(box) || (!hot && cells.hits(box)) || (clearOfLit && litPath.hits(box))) continue;
        const alpha = (hot ? focus.ramp : REST_NAME_ALPHA * (1 - (1 - t.farAlpha) * su[i])) * neural;
        write(node.label, x, y, align, font, hot && direct ? ink.strong : ink.name, alpha, t.nameHaloPx);
        names.add(box);
        boxes.push({ nodeId: node.id, text: node.label, ...box });
        return true;
      }
    }
    return false;
  };
  let named = 0;
  const nameBudget = Math.round(t.nameBudget * focus.zoomGrowth);
  const placeNames = () => {
    const tries = Math.min(candidates.length, nameBudget * NAME_TRIES_PER_NAME);
    let indirect = 0;
    for (let k = 0; k < tries && named < nameBudget; k += 1) {
      const far = nameStep(candidates[k]) > 1;
      if (far && indirect >= nameBudget * INDIRECT_NAME_SHARE) break;
      if (!placeName(candidates[k])) continue;
      named += 1;
      if (far) indirect += 1;
    }
  };

  // Each domain's name stands above its cluster, nearest first; a title that would sit on another
  // cluster or a nearer title gives way. With a focus the lit clusters' titles stand first at full
  // strength, the lit names next, and a receded title only where it meets no lit name or axon.
  const nameFont = `${FONT_WEIGHT.strong} ${t.domainNamePx}px ${family}`;
  const metaFont = `${FONT_WEIGHT.signature} ${t.domainMetaPx}px ${family}`;
  const summaries = clusterSummaries(frame, graph, evidence);
  const litClusters = new Set<string>();
  const lightClusterOf = (id: string) => {
    const own = graph.clusterOf.get(id);
    if (own !== undefined) litClusters.add(own);
  };
  if (focusId !== null) {
    lightClusterOf(focusId);
    if (focus.impact !== null && sets !== null) {
      for (const id of sets.needs) lightClusterOf(id);
      for (const [id, distance] of focus.impact.distance) if (distance <= spread) lightClusterOf(id);
    }
  } else if (sets !== null) {
    for (const id of sets.needs) lightClusterOf(id);
    for (const id of sets.usedBy) lightClusterOf(id);
  }
  const freeLeft = Math.max(t.titlePinPx, (frame.panelInsets?.left ?? 0) + t.domainNameGapPx);
  const freeRight = width - Math.max(t.titlePinPx, (frame.panelInsets?.right ?? 0) + t.domainNameGapPx);
  const titles: (TitleCandidate & { label: string; meta: string | null; x: number; nameY: number; metaY: number; nameBox: Box; a: number })[] = [];
  for (const [domainId, pool] of pools) {
    if (pool.a <= 0.05) continue;
    const node = world.nodeById.get(domainId);
    if (!node) continue;
    const summary = summaries.get(domainId);
    const meta = labels && summary ? labels.domainMeta(summary) : null;
    // While any of the cluster is on screen its title stays inside the free area, under the chrome.
    const onScreen = pool.maxY > 0 && pool.minY < height && pool.maxX > 0 && pool.minX < width;
    const metaY = Math.max(pool.top - t.domainMetaGapPx, onScreen ? t.titlePinPx + t.domainNameGapPx : -Infinity);
    const nameY = metaY - t.domainNameGapPx;
    ctx.font = nameFont;
    const nameW = widthOf(node.label);
    ctx.font = metaFont;
    const halfW = Math.max(nameW, meta ? widthOf(meta) : 0) / 2;
    const centre = (pool.minX + pool.maxX) / 2;
    const x = onScreen ? Math.min(Math.max(centre, freeLeft + halfW), Math.max(freeLeft + halfW, freeRight - halfW)) : centre;
    ctx.font = nameFont;
    const nameBox = boxFor(node.label, x, nameY, "center", t.domainNamePx);
    ctx.font = metaFont;
    const metaBox = meta ? boxFor(meta, x, metaY, "center", t.domainMetaPx) : nameBox;
    const box = { minX: Math.min(nameBox.minX, metaBox.minX), minY: nameBox.minY, maxX: Math.max(nameBox.maxX, metaBox.maxX), maxY: metaBox.maxY };
    const disc = { x: centre, y: (pool.minY + pool.maxY) / 2, r: Math.max(pool.maxX - pool.minX, pool.maxY - pool.minY) / 2 };
    titles.push({ id: domainId, box, disc, depth: pool.depth, label: node.label, meta, x, nameY, metaY, nameBox, a: pool.a });
  }
  const standing = standingDomainTitles(titles);
  const receded = (id: string) => hot && !litClusters.has(id);
  const writeTitle = (title: (typeof titles)[number]) => {
    if (title.box.maxX < 0 || title.box.minX > width || title.box.maxY < 0 || title.box.minY > height) return;
    const dim = (receded(title.id) ? 1 - (1 - t.titleVeil) * focus.ramp : 1) * title.a;
    write(title.label, title.x, title.nameY, "center", nameFont, ink.strong, TITLE_NAME_ALPHA * dim, t.nameHaloPx + TITLE_HALO_EXTRA_PX);
    if (title.meta) write(title.meta, title.x, title.metaY, "center", metaFont, ink.name, TITLE_META_ALPHA * dim, t.nameHaloPx);
    names.add(title.box);
    boxes.push({ nodeId: title.id, text: title.label, ...title.nameBox });
  };
  for (const title of titles) if (standing.has(title.id) && !receded(title.id) && !(hot && names.hits(title.box))) writeTitle(title);
  if (hot) {
    const litNames = new BoxGrid();
    const before = boxes.length;
    placeNames();
    for (let k = before; k < boxes.length; k += 1) litNames.add(boxes[k]);
    if (plate) litNames.add(plate.box);
    for (const title of titles) {
      if (standing.has(title.id) && receded(title.id) && !litNames.hits(title.box) && !litPath.hits(title.box)) writeTitle(title);
    }
  }

  if (!hot) {
    for (let i = 0; i < world.nodes.length; i += 1) {
      if (world.nodes[i].kind !== "project" || sa[i] <= 0.05) continue;
      ctx.font = font;
      const label = world.nodes[i].label;
      const box = boxFor(label, sx[i] + sr[i] + t.nameGapPx, sy[i], "left", t.namePx);
      write(label, sx[i] + sr[i] + t.nameGapPx, sy[i], "left", font, ink.name, 0.9 * neural, t.nameHaloPx);
      names.add(box);
      boxes.push({ nodeId: world.nodes[i].id, text: label, ...box });
    }
    placeNames();
  }

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
  const titleFont = `${FONT_WEIGHT.emphasis} ${t.namePx + PLATE_TITLE_EXTRA_PX}px ${family}`;
  const factFont = `${FONT_WEIGHT.signature} ${t.domainMetaPx - PLATE_FACT_LESS_PX}px ${family}`;
  ctx.font = titleFont;
  const titleW = ctx.measureText(title).width;
  ctx.font = factFont;
  const w = Math.max(titleW, ctx.measureText(facts).width) + t.platePadPx * 2;
  const h = t.namePx * PLATE_LINES + t.platePadPx * PLATE_PAD_SHARE;
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
