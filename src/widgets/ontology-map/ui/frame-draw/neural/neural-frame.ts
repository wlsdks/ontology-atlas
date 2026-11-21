import { projectDomeEdgeControl } from "../../../model/dome-view/dome-edge";
import { isNeuralDependency, neuralCellIsStale, neuralFocusSets, neuralGraphOf, type NeuralGraph } from "../../../model/dome-view/neural/neural-cells";
import { isOutwardHop, type NeuralImpact } from "../../../model/dome-view/neural/neural-impact";
import { isPathLensEdge } from "../../../model/visibility/path-lens";
import type { NeuralTokens } from "../../../tokens/read-neural-tokens";
import { radiusForKind } from "../../world/topology-world";
import { litDrawnStateCounts, passState } from "../frame-state";
import type { FrameInputs } from "../frame-begin";
import type { FrameFocus } from "../frame-focus";
import { impactStrength, lastLit, neuralSpreadFrame } from "./neural-spread";
import { NEURAL_CELL, neuralRadiusScale, neuralTokens, neuralTractsFor, zoomGrowthOf } from "./paint-neural";

/** One cluster's soft light and the screen box of its cells, which a domain's title stands above. */
export interface NeuralPool {
  domainId: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** The highest cell top in the cluster. */
  top: number;
  /** The domain cell's alpha before the focus veil, and its depth. */
  alpha: number;
  depth: number;
  /** The light: centre, radius and alpha. */
  x: number;
  y: number;
  reachPx: number;
  lightAlpha: number;
  /** The shell: a circle around the cluster's drawn cells, one capability radius wider. */
  shellX: number;
  shellY: number;
  shellPx: number;
}

/**
 * What Neural draws this frame, in screen CSS px with depth `u` from the dome frame (0 near, 1 far).
 * Every painter strokes this one description, so a click selects the painted cell. Buffers are reused
 * across frames and grow only with the graph; cells are indexed like `world.nodes`.
 */
export interface NeuralFrame {
  width: number;
  height: number;
  /** Neural's ramp: 1 when it paints alone, below 1 while it crossfades with the flat map. */
  neural: number;
  tokens: NeuralTokens;

  cellCount: number;
  cellX: Float64Array;
  cellY: Float64Array;
  cellR: Float64Array;
  cellU: Float64Array;
  /** Alpha after depth and the focus veil; `cellRestAlpha` is before the veil. */
  cellAlpha: Float64Array;
  cellRestAlpha: Float64Array;
  /** {@link NEURAL_CELL} codes. */
  cellKind: Uint8Array;
  /** 1 when the cell's evidence is stale: drawn in the warning ink. */
  cellStale: Uint8Array;
  /** 1 for the focus and the direct ends it lights at full strength. */
  cellLit: Uint8Array;
  /** A selection's distance per cell: 0 the focus, k a dependent k hops out, −1 outside or no selection. */
  cellHop: Int32Array;
  /** The cells to draw, far to near, already culled by alpha and the viewport. */
  drawOrder: Int32Array;
  drawCount: number;

  /** Each drawn axon's end a (dependent), control and end b (dependency). */
  axonCount: number;
  axonAX: Float64Array;
  axonAY: Float64Array;
  axonCX: Float64Array;
  axonCY: Float64Array;
  axonBX: Float64Array;
  axonBY: Float64Array;
  /** Rest batch: `(between clusters × depth tones + tone) × 2 + from a capability`, −1 when drawn lit only. */
  axonGroup: Int8Array;
  /** Alpha per rest batch, indexed by `axonGroup`. */
  groupAlpha: Float64Array;
  /** Lit axons: drawn axon index, far end's cell, world edge index, hop (0 a need, k ≥ 1 a dependent), alpha. */
  litCount: number;
  litAxon: Int32Array;
  litFarNode: Int32Array;
  litEdge: Int32Array;
  litHop: Int32Array;
  litAlpha: Float64Array;

  pools: NeuralPool[];
  poolCount: number;

  focusId: string | null;
  /** The focus's cell index, −1 when none. */
  focusIndex: number;
  /** The ring around a lit focus; `alpha` 0 when none is drawn. */
  focusRing: { x: number; y: number; r: number; alpha: number };
  /** The focus ramp, 0 at rest and 1 when the focus is fully lit. */
  ramp: number;
  /** The ends a lit focus or axon lights, null at rest. */
  sets: { needs: ReadonlySet<string>; usedBy: ReadonlySet<string> } | null;
  impact: NeuralImpact | null;
  /** How many hops a selection's spread has travelled. */
  spread: number;
  /** How far a direct signal has run along each lit axon, 1 when it has arrived. */
  travel: number;
  /** What the focus leaves of an unlit cell's and an unlit axon's alpha. */
  veilCell: number;
  veilAxon: number;
  /** How much zooming in past the whole-cloud fit has grown the cells. */
  zoomGrowth: number;
}

/**
 * A painter that draws a {@link NeuralFrame} instead of the canvas-2D strokes. It returns the context
 * names are drawn on, or null when it cannot paint this frame and the canvas-2D strokes must.
 */
export interface NeuralSurface {
  paint(frame: NeuralFrame): CanvasRenderingContext2D | null;
}

/** Depth is drawn in this many alpha steps, so rest axons batch into a bounded number of strokes. */
const DEPTH_TONES = 3;
const REST_GROUPS = 4 * DEPTH_TONES;
/** A cell at distance d starts to lift this share of a hop before the signal reaches it. */
const CELL_LIFT_HOPS = 0.15;
/** A cluster's soft pool reaches this far past its members' half-span. */
const CLUSTER_POOL_REACH = 1.6;

/** What `buildNeuralFrame` reads of the frame. */
export type NeuralFrameInputs = Pick<FrameInputs, "world" | "domeFrame" | "viewportWidth" | "viewportHeight" | "hoveredNodeId"
  | "colorFocusedNodeId" | "focusedNodeId" | "emphasisById" | "focusRampById" | "reducedMotion" | "now" | "domeLight" | "neural"
  | "nodeFrameAt" | "tokens" | "domeFitScale" | "hoveredEdge" | "selectedEdge" | "mapLensKind" | "pathEdgeIds">;

type ScreenCamera = Pick<FrameFocus, "camX" | "camY" | "camScale" | "halfW" | "halfH">;

const axonKey = (edge: { sourceId: string; targetId: string }) => `${edge.sourceId}\u0000${edge.targetId}`;

/** The dependencies a person is pointing at: a hovered or selected axon, or the path lens's axons. Null when none. */
function litAxonKeys(frame: NeuralFrameInputs): Set<string> | null {
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

let reused: NeuralFrame | null = null;

function reusedFrame(t: NeuralTokens): NeuralFrame {
  reused ??= {
    width: 0, height: 0, neural: 0, tokens: t,
    cellCount: 0, cellX: new Float64Array(0), cellY: new Float64Array(0), cellR: new Float64Array(0), cellU: new Float64Array(0),
    cellAlpha: new Float64Array(0), cellRestAlpha: new Float64Array(0), cellKind: new Uint8Array(0), cellStale: new Uint8Array(0),
    cellLit: new Uint8Array(0), cellHop: new Int32Array(0), drawOrder: new Int32Array(0), drawCount: 0,
    axonCount: 0, axonAX: new Float64Array(0), axonAY: new Float64Array(0), axonCX: new Float64Array(0), axonCY: new Float64Array(0),
    axonBX: new Float64Array(0), axonBY: new Float64Array(0), axonGroup: new Int8Array(0), groupAlpha: new Float64Array(REST_GROUPS),
    litCount: 0, litAxon: new Int32Array(0), litFarNode: new Int32Array(0), litEdge: new Int32Array(0), litHop: new Int32Array(0),
    litAlpha: new Float64Array(0),
    pools: [], poolCount: 0,
    focusId: null, focusIndex: -1, focusRing: { x: 0, y: 0, r: 0, alpha: 0 }, ramp: 0, sets: null, impact: null, spread: 0, travel: 1,
    veilCell: 1, veilAxon: 1, zoomGrowth: 1,
  };
  reused.tokens = t;
  return reused;
}

function ensureCells(f: NeuralFrame, n: number): void {
  if (f.cellX.length >= n) return;
  f.cellX = new Float64Array(n); f.cellY = new Float64Array(n); f.cellR = new Float64Array(n); f.cellU = new Float64Array(n);
  f.cellAlpha = new Float64Array(n); f.cellRestAlpha = new Float64Array(n); f.cellKind = new Uint8Array(n);
  f.cellStale = new Uint8Array(n); f.cellLit = new Uint8Array(n); f.cellHop = new Int32Array(n); f.drawOrder = new Int32Array(n);
}

function ensureAxons(f: NeuralFrame, edges: number): void {
  if (f.axonAX.length >= edges) return;
  f.axonAX = new Float64Array(edges); f.axonAY = new Float64Array(edges); f.axonCX = new Float64Array(edges);
  f.axonCY = new Float64Array(edges); f.axonBX = new Float64Array(edges); f.axonBY = new Float64Array(edges);
  f.axonGroup = new Int8Array(edges);
  f.litAxon = new Int32Array(edges); f.litFarNode = new Int32Array(edges); f.litEdge = new Int32Array(edges);
  f.litHop = new Int32Array(edges); f.litAlpha = new Float64Array(edges);
}

interface PoolSlot extends NeuralPool {
  builtAt: number;
  /** Its place in `pools` this build. */
  slot: number;
  /** The largest capability cell, and the largest cell for a cluster without one. */
  capabilityPx: number;
  widestPx: number;
}
const poolByDomain = new Map<string, PoolSlot>();
/** The pool slot each cell joined this build, or -1; grows only with the graph. */
let poolOfCell = new Int32Array(0);
let poolGraph: NeuralGraph | null = null;
let builds = 0;

let farFirstDepth: Float64Array = new Float64Array(0);
const farFirst = (a: number, b: number) => farFirstDepth[b] - farFirstDepth[a];
let drawOrderView: Int32Array = new Int32Array(0);

/**
 * Builds this frame's Neural description into reused buffers: O(n + e) per drawn frame, plus the
 * O(d log d) far-to-near sort of the d cells on screen. Also writes what the map probe reads, so the
 * probe does not depend on which painter drew the frame.
 */
export function buildNeuralFrame(frame: NeuralFrameInputs, camera: ScreenCamera): NeuralFrame {
  const t = neuralTokens();
  const { world, hoveredNodeId, colorFocusedNodeId, emphasisById, focusRampById, reducedMotion, now, domeLight, neural, nodeFrameAt } = frame;
  const { camX, camY, camScale, halfW, halfH } = camera;
  const f = reusedFrame(t);
  const evidence = domeLight?.evidence ?? null;
  const graph = neuralGraphOf(world.nodes, world.edges);
  const n = world.nodes.length;
  ensureCells(f, n);
  ensureAxons(f, world.edges.length);
  const { cellX: sx, cellY: sy, cellR: sr, cellU: su, cellAlpha: sa, cellRestAlpha: restAlpha } = f;

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

  for (let i = 0; i < n; i += 1) {
    const node = world.nodes[i];
    const at = nodeFrameAt(i);
    sx[i] = (node.x + at.dx - camX) * camScale + halfW;
    sy[i] = (node.y + at.dy - camY) * camScale + halfH;
    sr[i] = radiusForKind(node.kind, frame.tokens) * node.magnitudeScale * camScale *
      neuralRadiusScale(world, node, at.s, camScale, frame.domeFitScale ?? null);
    su[i] = at.u;
    restAlpha[i] = at.a * neural * (1 - (1 - t.farAlpha) * at.u);
    f.cellKind[i] = NEURAL_CELL[node.kind];
    f.cellStale[i] = neuralCellIsStale(evidence, node.id) ? 1 : 0;
    const hop = hopOf === null ? -1 : hopOf[i];
    f.cellHop[i] = hop;
    const needed = sets !== null && sets.needs.has(node.id);
    if (hop > 0 && !needed) {
      const lift = Math.min(1, Math.max(0, (spread - hop + CELL_LIFT_HOPS) / CELL_LIFT_HOPS));
      if (lift >= 1) lastLit.liftedCells += 1;
      sa[i] = restAlpha[i] * (veilCell + (1 - veilCell) * impactStrength(t, hop) * lift);
      f.cellLit[i] = 0;
    } else {
      if (hop > 0) lastLit.liftedCells += 1;
      const lit = sets === null || node.id === focusId || needed || (hopOf === null && sets.usedBy.has(node.id));
      sa[i] = restAlpha[i] * (lit ? 1 : veilCell);
      f.cellLit[i] = sets !== null && lit ? 1 : 0;
    }
  }

  buildPools(f, frame, graph, n);
  buildAxons(f, frame, camera, { graph, indexOf, litAxons, focusId, sets, hopOf, spread });
  for (let group = 0; group < REST_GROUPS; group += 1) {
    const tone = Math.floor(group / 2) % DEPTH_TONES;
    const cross = Math.floor(group / 2 / DEPTH_TONES);
    f.groupAlpha[group] = (cross ? t.tractAlpha : t.axonAlpha) * (1 - (1 - t.farAlpha) * ((tone + 0.5) / DEPTH_TONES)) * veilAxon * neural;
  }
  const spreadAlpha = ramp * neural;
  for (let k = 0; k < f.litCount; k += 1) {
    const hop = f.litHop[k];
    f.litAlpha[k] = hopOf !== null && hop > 0 ? t.litAlpha * spreadAlpha * impactStrength(t, hop) : t.litAlpha * ramp * neural;
  }
  buildDrawOrder(f, evidence, world.nodes, n);

  const focusIndex = focusId === null ? -1 : indexOf.get(focusId) ?? -1;
  const ring = f.focusRing;
  ring.alpha = sets !== null && focusIndex >= 0 ? ramp * neural : 0;
  ring.x = focusIndex >= 0 ? sx[focusIndex] : 0;
  ring.y = focusIndex >= 0 ? sy[focusIndex] : 0;
  ring.r = focusIndex >= 0 ? sr[focusIndex] + t.focusRingGapPx : 0;
  f.neural = neural;
  f.cellCount = n;
  f.focusId = focusId;
  f.focusIndex = focusIndex;
  f.ramp = ramp;
  f.sets = sets;
  f.impact = impact;
  f.spread = spread;
  f.travel = travel;
  f.veilCell = veilCell;
  f.veilAxon = veilAxon;
  f.zoomGrowth = zoomGrowthOf(camScale, frame.domeFitScale ?? null, t);
  return f;
}

/** One soft pool behind each cluster, centred on its members, in the order its first member appears. */
function buildPools(f: NeuralFrame, frame: NeuralFrameInputs, graph: NeuralGraph, n: number): void {
  const t = f.tokens;
  const { cellX: sx, cellY: sy, cellR: sr, cellU: su, cellAlpha: sa, cellRestAlpha: restAlpha } = f;
  if (poolGraph !== graph) {
    poolByDomain.clear();
    poolGraph = graph;
  }
  builds += 1;
  if (poolOfCell.length < n) poolOfCell = new Int32Array(n);
  let poolCount = 0;
  for (let i = 0; i < n; i += 1) {
    poolOfCell[i] = -1;
    const kind = frame.world.nodes[i].kind;
    const domain = graph.clusterOf.get(frame.world.nodes[i].id);
    if (domain === undefined || sa[i] <= 0.01) continue;
    let pool = poolByDomain.get(domain);
    if (pool === undefined) {
      pool = { domainId: domain, minX: 0, maxX: 0, minY: 0, maxY: 0, top: 0, alpha: 0, depth: 0, x: 0, y: 0, reachPx: 0, lightAlpha: 0,
        shellX: 0, shellY: 0, shellPx: 0, builtAt: 0, slot: 0, capabilityPx: 0, widestPx: 0 };
      poolByDomain.set(domain, pool);
    }
    if (pool.builtAt !== builds) {
      pool.builtAt = builds;
      pool.minX = Infinity; pool.maxX = -Infinity; pool.minY = Infinity; pool.maxY = -Infinity; pool.top = Infinity;
      pool.alpha = 0; pool.depth = 0; pool.capabilityPx = 0; pool.widestPx = 0;
      pool.slot = poolCount;
      f.pools[poolCount] = pool;
      poolCount += 1;
    }
    poolOfCell[i] = pool.slot;
    pool.minX = Math.min(pool.minX, sx[i]); pool.maxX = Math.max(pool.maxX, sx[i]);
    pool.minY = Math.min(pool.minY, sy[i]); pool.maxY = Math.max(pool.maxY, sy[i]);
    pool.top = Math.min(pool.top, sy[i] - sr[i]);
    pool.widestPx = Math.max(pool.widestPx, sr[i]);
    if (kind === "capability") pool.capabilityPx = Math.max(pool.capabilityPx, sr[i]);
    if (kind === "domain") {
      pool.alpha = Math.max(pool.alpha, restAlpha[i]);
      pool.depth = su[i];
    }
  }
  for (let k = 0; k < poolCount; k += 1) {
    const pool = f.pools[k];
    const reach = Math.max(pool.maxX - pool.minX, pool.maxY - pool.minY) / 2 + t.clusterGlowPadPx;
    pool.x = (pool.minX + pool.maxX) / 2;
    pool.y = (pool.minY + pool.maxY) / 2;
    pool.reachPx = reach * CLUSTER_POOL_REACH;
    pool.lightAlpha = t.clusterGlowAlpha * frame.neural;
    pool.shellX = pool.x;
    pool.shellY = pool.y;
    pool.shellPx = 0;
  }
  encloseClusters(f, n);
  for (let k = 0; k < poolCount; k += 1) {
    const pool = f.pools[k] as PoolSlot;
    pool.shellPx += pool.capabilityPx > 0 ? pool.capabilityPx : pool.widestPx;
  }
  f.poolCount = poolCount;
}

/**
 * Grows each shell over its cluster's cell discs in one pass, O(cells): a disc outside the circle widens
 * it to the smallest circle holding both, so the last disc that grew it touches the rim.
 */
function encloseClusters(f: NeuralFrame, n: number): void {
  const { cellX: sx, cellY: sy, cellR: sr } = f;
  for (let i = 0; i < n; i += 1) {
    const slot = poolOfCell[i];
    if (slot < 0) continue;
    const pool = f.pools[slot];
    const dx = sx[i] - pool.shellX;
    const dy = sy[i] - pool.shellY;
    const d = Math.hypot(dx, dy);
    const far = d + sr[i];
    if (far <= pool.shellPx) continue;
    const near = Math.min(-pool.shellPx, d - sr[i]);
    if (d > 0) {
      const shift = (far + near) / 2 / d;
      pool.shellX += dx * shift;
      pool.shellY += dy * shift;
    }
    pool.shellPx = (far - near) / 2;
  }
}

interface AxonLight {
  graph: NeuralGraph;
  indexOf: ReadonlyMap<string, number>;
  litAxons: ReadonlySet<string> | null;
  focusId: string | null;
  sets: { needs: ReadonlySet<string>; usedBy: ReadonlySet<string> } | null;
  hopOf: Int32Array | null;
  spread: number;
}

/** The axons on screen, each in a rest batch or lit, and the lit list in edge order. */
function buildAxons(f: NeuralFrame, frame: NeuralFrameInputs, camera: ScreenCamera, light: AxonLight): void {
  const { world, domeFrame, viewportWidth: width, viewportHeight: height, reducedMotion, neural } = frame;
  const { camX, camY, camScale, halfW, halfH } = camera;
  const { graph, indexOf, litAxons, focusId, sets, hopOf, spread } = light;
  const { cellX: sx, cellY: sy, cellU: su, cellAlpha: sa, axonAX: ax, axonAY: ay, axonCX: acx, axonCY: acy, axonBX: abx, axonBY: aby } = f;
  const tracts = domeFrame === null ? null : neuralTractsFor(world, domeFrame, null);
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
    acx[axons] = (control.x - camX) * camScale + halfW; acy[axons] = (control.y - camY) * camScale + halfH;
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
      f.litAxon[litCount] = axons;
      f.litFarNode[litCount] = hop === 0 ? e : s;
      f.litEdge[litCount] = edgeIndex;
      f.litHop[litCount] = hop;
      litCount += 1;
    }
    if (started && (hopOf === null || hop === 0 || spread >= hop)) {
      f.axonGroup[axons] = -1;
    } else {
      const cross = graph.clusterOf.get(edge.sourceId) !== graph.clusterOf.get(edge.targetId) ? 1 : 0;
      const tone = Math.min(DEPTH_TONES - 1, Math.floor(((su[s] + su[e]) / 2) * DEPTH_TONES));
      const capability = world.nodes[s].kind === "capability" ? 1 : 0;
      f.axonGroup[axons] = (cross * DEPTH_TONES + tone) * 2 + capability;
    }
    axons += 1;
  }
  f.width = width;
  f.height = height;
  f.axonCount = axons;
  f.litCount = litCount;
  lastLit.edges = world.edges;
  lastLit.litCount = litCount;
  lastLit.litEdge = f.litEdge;
  lastLit.litHop = f.litHop;
}

/** The cells on screen, far to near, and the drawn counts the probe reads. Needs `width` and `height` set. */
function buildDrawOrder(f: NeuralFrame, evidence: ReadonlyMap<string, "current" | "stale" | "unknown"> | null, nodes: readonly { id: string }[], n: number): void {
  const { cellX: sx, cellY: sy, cellR: sr, cellAlpha: sa, width, height } = f;
  let drawCount = 0;
  for (let i = 0; i < n; i += 1) {
    const r = sr[i];
    if (sa[i] <= 0.01 || sx[i] < -r * 4 || sy[i] < -r * 4 || sx[i] > width + r * 4 || sy[i] > height + r * 4) continue;
    f.drawOrder[drawCount] = i;
    drawCount += 1;
  }
  if (drawOrderView.buffer !== f.drawOrder.buffer || drawOrderView.length !== drawCount) drawOrderView = f.drawOrder.subarray(0, drawCount);
  farFirstDepth = f.cellU;
  drawOrderView.sort(farFirst);
  litDrawnStateCounts.current = 0;
  litDrawnStateCounts.stale = 0;
  litDrawnStateCounts.unknown = 0;
  for (let k = 0; k < drawCount; k += 1) {
    const i = f.drawOrder[k];
    if (evidence === null || !evidence.has(nodes[i].id)) litDrawnStateCounts.unknown += 1;
    else litDrawnStateCounts[f.cellStale[i] ? "stale" : "current"] += 1;
  }
  f.drawCount = drawCount;
  passState.drawnNodeCount = drawCount;
}
