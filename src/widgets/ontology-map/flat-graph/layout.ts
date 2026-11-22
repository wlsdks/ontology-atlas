import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
// @ts-expect-error -- the package types only its one-shot API; these are the internals `assign` runs.
import forceAtlas2Helpers from "graphology-layout-forceatlas2/helpers.js";
// @ts-expect-error -- see above.
import forceAtlas2Iterate from "graphology-layout-forceatlas2/iterate.js";

import type { Box, DialCapabilityDependency, DialModel, Point } from "../dial/dial-shapes";
import { GOLDEN_ANGLE, byId, seedAngle, seedUnit } from "./seed";
import { separate, type Body } from "./separate";
import type { FlatGraphCluster, FlatGraphFrame, FlatGraphItem, FlatGraphLayout, FlatGraphLayoutTokens, FlatGraphPins, FlatGraphTitle } from "./flat-graph-shapes";

const HUB_ID = "\u0000hub";
const TITLE_LEFT = "\u0000title-left";
const TITLE_RIGHT = "\u0000title-right";
const ANCHOR_PREFIX = "\u0000anchor:";
const PACKING = 0.62;
const SEED_JITTER = 0.25;
const PUSH_ROUNDS = 80;
const CLUSTER_SPREAD = 0.8;
const COMPACT_ROUNDS = 40;
const COMPACT_PULL = 0.04;
const COMPACT_SEPARATIONS = 6;
const FULL_ITERATION_BODIES = 64;
const MAX_STRETCH = 2;
const MIN_ASPECT = 0.6;
const MAX_ASPECT = 2.6;
/** Layout passes that grow the title reservation until it covers the names at the fitted scale. */
const TITLE_PASSES = 6;
const TITLE_PASS_MARGIN = 1.04;
/** A steeper secant means the titles alone outgrow the area: a larger reservation only shrinks the fit, so the passes stop. */
const MAX_TITLE_SLOPE = 0.9;
/** Captions that fit still rest when the name rows alone show the picture this many times larger. */
const COMPACT_TITLE_GAIN = 1.25;
/** The first secant starts from an unscaled guess, so the passes never stop on it. */
const FIRST_SECANT_PASS = 2;
/** Passes that keep members off the titles at the shown scale where the reservation could not reach it. */
const MEMBER_PASSES = 4;
const TITLE_CLEAR_ROUNDS = 8;
const TITLE_CLEAR_SEPARATIONS = 6;
/**
 * Shares of its title's room a member star is spread to, widest first; the first whose settled star
 * still ends inside the room is taken, so a spread never enlarges its cluster's footprint.
 */
const STAR_ROOM_SHARES = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4];

/** The angle step, in radians, at which a fan looks for the first bearing clear of a title. */
const FAN_STEP = Math.PI / 90;

const FORCE_SETTINGS = {
  gravity: 1,
  scalingRatio: 2,
  slowDown: 2,
  adjustSizes: true,
  strongGravityMode: false,
  barnesHutOptimize: false,
  linLogMode: false,
  outboundAttractionDistribution: false,
  edgeWeightInfluence: 1,
} as const;

interface Spring { a: string; b: string; weight: number }

/** A computation cut into steps: each `yield` is a point where a driver may give the browser a turn. */
export type LayoutSteps<T> = Generator<void, T, void>;

/** The title scales a picture was fitted at, in the area it was fitted to. */
export interface FittedScales { worldPerPx: number; memberWorldPerPx: number; areaWidthPx: number | undefined; areaHeightPx: number | undefined }
export interface FittedLayout extends FlatGraphLayout { fittedAt?: FittedScales }
/** Pins whose `fittedAt` is set cover every domain, so the rebuild places once at those scales. */
export interface RememberedPins extends FlatGraphPins { fittedAt?: FittedScales | null }

export function fittedScalesOf(layout: FlatGraphLayout): FittedScales | null {
  return (layout as FittedLayout).fittedAt ?? null;
}

/** Runs every step at once and returns the result: the synchronous form of any `LayoutSteps`. */
export function drainSteps<T>(steps: LayoutSteps<T>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

type ForceMatrices = { nodes: Float32Array; edges: Float32Array };
type EdgeWeightOf = (edge: string, attr: { weight?: unknown }) => number;
const STEPPED_SETTINGS = { ...FORCE_SETTINGS, barnesHutTheta: 0.5 };
const fa2 = {
  toMatrices: (forceAtlas2Helpers as { graphToByteArrays: (graph: Graph, weightOf: EdgeWeightOf) => ForceMatrices }).graphToByteArrays,
  writeBack: (forceAtlas2Helpers as { assignLayoutChanges: (graph: Graph, nodes: Float32Array, reducer: null) => void }).assignLayoutChanges,
  iterate: forceAtlas2Iterate as (settings: typeof STEPPED_SETTINGS, nodes: Float32Array, edges: Float32Array) => void,
};
const weightOf: EdgeWeightOf = (_edge, attr) => (typeof attr.weight === "number" && !Number.isNaN(attr.weight) ? attr.weight : 1);

export function directItemId(domainId: string): string {
  return `${domainId}::direct`;
}

/** Synchronous ForceAtlas2 over sorted bodies and springs: identical input gives identical output. */
export function runForceAtlas2(bodies: readonly Body[], springs: readonly Spring[], iterations: number): Map<string, Point> {
  const graph = forceGraph(bodies, springs);
  if (graph === null) return new Map(bodies.map((b) => [b.id, { x: b.x, y: b.y }]));
  if (graph.size > 0 && iterations > 0) forceAtlas2.assign(graph, { iterations, settings: FORCE_SETTINGS, getEdgeWeight: "weight" });
  return positionsOf(graph);
}

/** `runForceAtlas2` with a step after every iteration, over the matrices `assign` builds, so the result is equal. */
export function* steppedForceAtlas2(bodies: readonly Body[], springs: readonly Spring[], iterations: number): LayoutSteps<Map<string, Point>> {
  const graph = forceGraph(bodies, springs);
  if (graph === null) return new Map(bodies.map((b) => [b.id, { x: b.x, y: b.y }]));
  if (graph.size > 0 && iterations > 0) {
    const matrices = fa2.toMatrices(graph, weightOf);
    for (let i = 0; i < iterations; i += 1) {
      fa2.iterate(STEPPED_SETTINGS, matrices.nodes, matrices.edges);
      yield;
    }
    fa2.writeBack(graph, matrices.nodes, null);
  }
  return positionsOf(graph);
}

function positionsOf(graph: Graph): Map<string, Point> {
  const out = new Map<string, Point>();
  graph.forEachNode((id, attr) => out.set(id, { x: attr.x as number, y: attr.y as number }));
  return out;
}

/** The graph of sorted bodies and merged springs ForceAtlas2 runs on; null when no body can move. */
function forceGraph(bodies: readonly Body[], springs: readonly Spring[]): Graph | null {
  if (bodies.every((b) => b.fixed)) return null;
  const graph = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
  for (const b of [...bodies].sort((p, q) => byId(p.id, q.id))) graph.addNode(b.id, { x: b.x, y: b.y, size: b.r, fixed: b.fixed });
  const merged = new Map<string, Spring>();
  for (const s of springs) {
    if (s.a === s.b || !graph.hasNode(s.a) || !graph.hasNode(s.b)) continue;
    const [a, b] = s.a < s.b ? [s.a, s.b] : [s.b, s.a];
    const key = `${a}\u0000${b}`;
    const hit = merged.get(key);
    if (hit) hit.weight += s.weight;
    else merged.set(key, { a, b, weight: s.weight });
  }
  for (const key of [...merged.keys()].sort(byId)) {
    const s = merged.get(key)!;
    graph.addEdge(s.a, s.b, { weight: s.weight });
  }
  return graph;
}

/**
 * ForceAtlas2 costs O(iterations · n²) and a fit runs it once per pass. A cluster past
 * `FULL_ITERATION_BODIES` gets the iterations that keep that size's pair work, down to one pass.
 */
function budgetedIterations(iterations: number, bodyCount: number): number {
  if (bodyCount <= FULL_ITERATION_BODIES) return iterations;
  return Math.min(iterations, Math.max(1, Math.round(iterations * (FULL_ITERATION_BODIES / bodyCount) ** 2)));
}

function elementFanRadius(count: number, tokens: Pick<FlatGraphLayoutTokens, "elementHole" | "elementPitch">): number {
  return count === 0 ? 0 : tokens.elementHole + tokens.elementPitch * Math.sqrt(count / Math.PI / PACKING);
}

function itemsOf(model: DialModel, domainId: string): FlatGraphItem[] {
  const d = model.domainById.get(domainId)!;
  const items: FlatGraphItem[] = [...d.capabilityIds].sort(byId).map((id) => ({
    id, domainId, direct: false, elementIds: [...(model.capabilityById.get(id)?.elementIds ?? [])].sort(byId),
  }));
  if (d.directElementIds.length > 0) items.push({ id: directItemId(domainId), domainId, direct: true, elementIds: [...d.directElementIds].sort(byId) });
  return items;
}

function crossDegree(model: DialModel): Map<string, number> {
  const degree = new Map<string, number>();
  for (const dep of model.capabilityDependencies) {
    degree.set(dep.from, (degree.get(dep.from) ?? 0) + 1);
    degree.set(dep.to, (degree.get(dep.to) ?? 0) + 1);
  }
  return degree;
}

interface LocalCluster { items: FlatGraphItem[]; offsets: Map<string, Point>; reach: Map<string, number>; footprint: number }

function estimateFootprint(items: readonly FlatGraphItem[], tokens: FlatGraphLayoutTokens): number {
  let area = Math.PI * tokens.domainClearance ** 2;
  for (const it of items) area += (Math.PI * (Math.max(tokens.capSpacing / 2, elementFanRadius(it.elementIds.length, tokens)) + tokens.capSpacing / 2) ** 2) / PACKING;
  return Math.sqrt(area / Math.PI);
}

function layoutCluster(
  dependencies: readonly DialCapabilityDependency[],
  domainId: string,
  items: FlatGraphItem[],
  outward: number,
  partners: readonly { domainId: string; angle: number; weight: number }[],
  degree: ReadonlyMap<string, number>,
  pinned: ReadonlyMap<string, Point>,
  centre: Point | null,
  title: Box,
  room: number,
  memberClearance: number,
  tokens: FlatGraphLayoutTokens,
): LocalCluster {
  const reach = new Map(items.map((it) => [it.id, Math.max(tokens.capSpacing / 2, elementFanRadius(it.elementIds.length, tokens))]));
  const ranked = [...items].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || byId(a.id, b.id));
  const estimate = estimateFootprint(items, tokens);
  const bodies: Body[] = [{ id: domainId, x: 0, y: 0, r: Math.max(tokens.domainClearance, title.minY), fixed: true }];
  const titleW = title.maxX - title.minX;
  const titleMidY = (title.minY + title.maxY) / 2;
  const titleR = Math.max(titleW / 4, (title.maxY - title.minY) / 2);
  bodies.push({ id: TITLE_LEFT, x: title.minX + titleW / 4, y: titleMidY, r: titleR, fixed: true });
  bodies.push({ id: TITLE_RIGHT, x: title.maxX - titleW / 4, y: titleMidY, r: titleR, fixed: true });
  let anyPinned = false;
  ranked.forEach((it, k) => {
    const pin = centre && pinned.get(it.id);
    if (pin) anyPinned = true;
    const radius = tokens.domainClearance + (estimate - tokens.domainClearance) * Math.sqrt((k + 0.5) / ranked.length);
    const angle = outward + k * GOLDEN_ANGLE + (seedUnit(it.id) - 0.5) * SEED_JITTER;
    bodies.push({
      id: it.id,
      x: pin ? pin.x - centre.x : Math.cos(angle) * radius,
      y: pin ? pin.y - centre.y : Math.sin(angle) * radius,
      r: reach.get(it.id)! + tokens.capSpacing / 2,
      fixed: !!pin,
    });
  });
  const springs: Spring[] = items.map((it) => ({ a: domainId, b: it.id, weight: 1 }));
  const members = new Set(items.map((it) => it.id));
  const anchorOf = new Map<string, string>();
  for (const p of partners) {
    const id = `${ANCHOR_PREFIX}${p.domainId}`;
    anchorOf.set(p.domainId, id);
    bodies.push({ id, x: Math.cos(p.angle) * estimate * tokens.anchorReach, y: Math.sin(p.angle) * estimate * tokens.anchorReach, r: 1, fixed: true });
  }
  for (const dep of dependencies) {
    const inside = members.has(dep.from) ? dep.from : members.has(dep.to) ? dep.to : null;
    if (inside === null) continue;
    const other = inside === dep.from ? dep.to : dep.from;
    if (members.has(other)) {
      springs.push({ a: dep.from, b: dep.to, weight: tokens.anchorWeight * 2 });
      continue;
    }
    const otherDomain = inside === dep.from ? dep.toDomain : dep.fromDomain;
    const anchor = anchorOf.get(otherDomain);
    if (anchor) springs.push({ a: inside, b: anchor, weight: tokens.anchorWeight });
  }
  const placed = runForceAtlas2(bodies, springs, ranked.length > 0 ? budgetedIterations(tokens.capabilityIterations, bodies.length) : 0);
  const movable = bodies.filter((b) => !b.fixed && members.has(b.id));
  for (const b of movable) {
    const at = placed.get(b.id)!;
    b.x = at.x;
    b.y = at.y;
  }
  if (!anyPinned && movable.length > 0) {
    const rms = Math.sqrt(movable.reduce((s, b) => s + b.x * b.x + b.y * b.y, 0) / movable.length);
    const target = estimate * CLUSTER_SPREAD + tokens.domainClearance / 2;
    if (rms > 1e-6) {
      const s = target / rms;
      for (const b of movable) {
        b.x *= s;
        b.y *= s;
      }
    }
  }
  const relaxed = bodies.filter((b) => !b.id.startsWith(ANCHOR_PREFIX));
  const clearance = (b: Body) => Math.max(b.r, memberClearance);
  const memberBodies = relaxed.filter((b) => members.has(b.id));
  const clearTitle = () => {
    fanClearOf(memberBodies, title, clearance);
    separate(relaxed, 0, tokens.relaxRounds);
    for (let round = 0; round < TITLE_CLEAR_ROUNDS && clearBox(memberBodies, title, clearance); round += 1) separate(relaxed, 0, TITLE_CLEAR_SEPARATIONS);
    clearBox(memberBodies, title, clearance);
  };
  const snapshot = () => movable.map((b) => ({ x: b.x, y: b.y, r: b.r }));
  const restore = (to: readonly { x: number; y: number; r: number }[]) => movable.forEach((b, i) => Object.assign(b, to[i]));
  const natural = snapshot();
  clearTitle();
  if (!anyPinned && starReach(movable, reach) < room) {
    const settled = snapshot();
    let taken = false;
    for (const share of STAR_ROOM_SHARES) {
      restore(natural);
      if (starReach(movable, reach) >= room * share) break;
      scaleStarTo(movable, reach, room * share);
      for (const m of movable) m.r = Math.max(m.r, memberClearance);
      clearTitle();
      taken = starReach(movable, reach) <= room;
      if (taken) break;
    }
    if (!taken) restore(settled);
  }
  const offsets = new Map<string, Point>();
  let footprint = Math.max(tokens.domainClearance, room);
  for (const b of relaxed) {
    if (!members.has(b.id)) continue;
    offsets.set(b.id, { x: b.x, y: b.y });
    footprint = Math.max(footprint, Math.hypot(b.x, b.y) + reach.get(b.id)!);
  }
  return { items, offsets, reach, footprint };
}

/** How far a member star reaches from its domain: the farthest member's centre plus its own reach. O(n). */
function starReach(members: readonly Body[], reach: ReadonlyMap<string, number>): number {
  let outer = 0;
  for (const b of members) outer = Math.max(outer, Math.hypot(b.x, b.y) + reach.get(b.id)!);
  return outer;
}

/**
 * Scales a member star about its domain so the member that reaches farthest ends at `room`. A title
 * is a fixed size on screen, so on a crowded overview the circle it reserves outgrows the star, and
 * the star takes that room instead of leaving it empty. O(n).
 */
function scaleStarTo(members: readonly Body[], reach: ReadonlyMap<string, number>, room: number): void {
  let far: Body | null = null;
  let outer = 0;
  for (const b of members) {
    const at = Math.hypot(b.x, b.y) + reach.get(b.id)!;
    if (at > outer) {
      outer = at;
      far = b;
    }
  }
  if (far === null) return;
  const s = (room - reach.get(far.id)!) / Math.hypot(far.x, far.y);
  for (const b of members) {
    b.x *= s;
    b.y *= s;
  }
}

function distanceToBox(x: number, y: number, box: Box): number {
  return Math.hypot(x - Math.min(box.maxX, Math.max(box.minX, x)), y - Math.min(box.maxY, Math.max(box.minY, y)));
}

/**
 * Turns a star into a fan that leaves the title's wedge open. Each movable body keeps its distance
 * from the domain and its bearing from straight up is compressed into the arc that clears the box
 * at that distance; a body farther out than the box's far side keeps its bearing. O(n / FAN_STEP).
 */
function fanClearOf(bodies: readonly Body[], box: Box, clearance: (b: Body) => number): void {
  for (const b of bodies) {
    if (b.fixed) continue;
    const distance = Math.hypot(b.x, b.y);
    if (distance <= 1e-6) continue;
    const r = clearance(b);
    let open = Math.PI;
    while (open > FAN_STEP && distanceToBox(Math.sin(open) * distance, -Math.cos(open) * distance, box) < r) open -= FAN_STEP;
    const bearing = Math.atan2(b.x, -b.y) * (open / Math.PI);
    b.x = Math.sin(bearing) * distance;
    b.y = -Math.cos(bearing) * distance;
  }
}

/**
 * Pushes each movable body out of a fixed box the shortest way, keeping `clearance(body)` from its
 * edge; reports whether any moved. O(n).
 */
function clearBox(bodies: readonly Body[], box: Box, clearance: (b: Body) => number): boolean {
  let moved = false;
  for (const b of bodies) {
    if (b.fixed) continue;
    const r = clearance(b);
    const nx = Math.min(box.maxX, Math.max(box.minX, b.x));
    const ny = Math.min(box.maxY, Math.max(box.minY, b.y));
    const d = Math.hypot(b.x - nx, b.y - ny);
    if (d >= r) continue;
    if (d > 1e-6) {
      b.x = nx + ((b.x - nx) / d) * r;
      b.y = ny + ((b.y - ny) / d) * r;
    } else {
      const exits = [b.y - box.minY, box.maxY - b.y, b.x - box.minX, box.maxX - b.x];
      const way = exits.indexOf(Math.min(...exits));
      if (way === 0) b.y = box.minY - r;
      else if (way === 1) b.y = box.maxY + r;
      else if (way === 2) b.x = box.minX - r;
      else b.x = box.maxX + r;
    }
    moved = true;
  }
  return moved;
}

function circularSeed(order: readonly string[], radii: ReadonlyMap<string, number>, tokens: FlatGraphLayoutTokens): Map<string, Point> {
  const total = order.reduce((s, id) => s + 2 * radii.get(id)! + tokens.clusterGap, 0);
  const maxR = Math.max(0, ...order.map((id) => radii.get(id)!));
  const ring = Math.max(tokens.hubClearance + maxR, total / (Math.PI * 2));
  return new Map(order.map((id, k) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * k) / Math.max(1, order.length);
    return [id, { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring }] as const;
  }));
}

function* placeDomains(
  model: DialModel,
  order: readonly string[],
  radii: ReadonlyMap<string, number>,
  pins: FlatGraphPins | null,
  tokens: FlatGraphLayoutTokens,
  aspect: number,
): LayoutSteps<Map<string, Point>> {
  const pinned = pins?.positions ?? new Map<string, Point>();
  const seeds = circularSeed(order, radii, tokens);
  for (const [id, at] of pins?.seeds ?? []) if (seeds.has(id)) seeds.set(id, { x: at.x / aspect, y: at.y });
  const hasHub = model.projectId !== null;
  const bodies: Body[] = order.map((id) => {
    const pin = pinned.get(id);
    const at = pin ?? seeds.get(id)!;
    return { id, x: pin ? at.x / aspect : at.x, y: at.y, r: radii.get(id)!, fixed: !!pin };
  });
  if (hasHub) bodies.push({ id: HUB_ID, x: 0, y: 0, r: tokens.hubClearance, fixed: true });
  const springs: Spring[] = hasHub ? order.map((id) => ({ a: HUB_ID, b: id, weight: 1 })) : [];
  for (const f of model.flows) springs.push({ a: f.a, b: f.b, weight: tokens.flowWeight * Math.log1p(f.total) });
  const placed = order.length > 1 || hasHub ? yield* steppedForceAtlas2(bodies, springs, tokens.domainIterations) : new Map<string, Point>();
  return new Map(order.map((id) => {
    const pin = pinned.get(id);
    if (pin) return [id, { ...pin }] as const;
    const at = placed.get(id) ?? seeds.get(id)!;
    return [id, { x: at.x * aspect, y: at.y }] as const;
  }));
}

function spreadDomains(
  centres: Map<string, Point>,
  footprints: ReadonlyMap<string, number>,
  pinned: ReadonlyMap<string, Point>,
  hasHub: boolean,
  hubClearance: number,
  tokens: FlatGraphLayoutTokens,
  aspect: number,
): void {
  const ids = [...centres.keys()].sort(byId);
  const anyPinned = ids.some((id) => pinned.has(id));
  if (!anyPinned) {
    let s = 0;
    for (let i = 0; i < ids.length; i += 1) {
      const p = centres.get(ids[i]!)!;
      const fp = footprints.get(ids[i]!)!;
      if (hasHub) s = Math.max(s, (fp + hubClearance) / Math.max(1e-6, Math.hypot(p.x, p.y)));
      for (let j = i + 1; j < ids.length; j += 1) {
        const q = centres.get(ids[j]!)!;
        s = Math.max(s, (fp + footprints.get(ids[j]!)! + tokens.clusterGap) / Math.max(1e-6, Math.hypot(q.x - p.x, q.y - p.y)));
      }
    }
    if (s > 0 && Number.isFinite(s)) for (const p of centres.values()) { p.x *= s; p.y *= s; }
  }
  const bodies: Body[] = ids.map((id) => ({ id, ...centres.get(id)!, r: footprints.get(id)!, fixed: pinned.has(id) }));
  if (hasHub) bodies.push({ id: HUB_ID, x: 0, y: 0, r: hubClearance, fixed: true });
  if (!anyPinned) {
    for (let round = 0; round < COMPACT_ROUNDS; round += 1) {
      for (const b of bodies) if (!b.fixed) { b.x *= 1 - COMPACT_PULL; b.y *= 1 - COMPACT_PULL * aspect; }
      separate(bodies, tokens.clusterGap, COMPACT_SEPARATIONS);
    }
  }
  separate(bodies, tokens.clusterGap, PUSH_ROUNDS);
  if (!anyPinned) stretchToAspect(bodies.filter((b) => b.id !== HUB_ID), aspect);
  for (const b of bodies) if (b.id !== HUB_ID) centres.set(b.id, { x: b.x, y: b.y });
}

/**
 * Spreads cluster centres about the hub along the short axis until the footprint box has the
 * overview's aspect, so the fit fills the free canvas. Stretching only lengthens every distance,
 * so separation holds. O(n).
 */
function stretchToAspect(bodies: Body[], aspect: number): void {
  if (bodies.length < 2) return;
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const span = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const b of bodies) {
    grow(box, b, b.r);
    grow(span, b, 0);
  }
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const spanX = span.maxX - span.minX;
  const spanY = span.maxY - span.minY;
  const fx = w < aspect * h && spanX > 1e-6 ? Math.min(MAX_STRETCH, 1 + (aspect * h - w) / spanX) : 1;
  const fy = w > aspect * h && spanY > 1e-6 ? Math.min(MAX_STRETCH, 1 + (w / aspect - h) / spanY) : 1;
  for (const b of bodies) {
    b.x *= fx;
    b.y *= fy;
  }
}

function fanElements(positions: Map<string, Point>, at: Point, outward: number, elementIds: readonly string[], tokens: FlatGraphLayoutTokens): void {
  const room = elementFanRadius(elementIds.length, tokens);
  const hole = tokens.elementHole;
  elementIds.forEach((id, j) => {
    const r = elementIds.length === 1 ? hole : Math.sqrt(hole * hole + (room * room - hole * hole) * ((j + 0.5) / elementIds.length));
    const angle = outward + j * GOLDEN_ANGLE;
    positions.set(id, { x: at.x + Math.cos(angle) * r, y: at.y + Math.sin(angle) * r });
  });
}

function cornersOf(extent: Box, offset: number): Point[] {
  return [
    { x: extent.maxX + offset, y: extent.maxY + offset },
    { x: extent.minX - offset, y: extent.maxY + offset },
    { x: extent.maxX + offset, y: extent.minY - offset },
    { x: extent.minX - offset, y: extent.minY - offset },
  ];
}

/**
 * The corner whose orphan disc keeps the most room from every cluster; ties go to the first. An
 * empty corner inside the extent wins over one outside it, so orphans do not widen the overview.
 */
function orphanCorner(extent: Box, clusters: readonly FlatGraphCluster[], radius: number, gap: number): Point {
  const roomAt = (p: Point) => Math.min(Infinity, ...clusters.map((c) => Math.hypot(c.centre.x - p.x, c.centre.y - p.y) - c.footprint));
  const pick = (corners: readonly Point[]) => {
    let best = corners[0]!;
    let bestRoom = -Infinity;
    for (const corner of corners) {
      const room = roomAt(corner);
      if (room > bestRoom + 1e-6) {
        best = corner;
        bestRoom = room;
      }
    }
    return { best, bestRoom };
  };
  const inside = pick(cornersOf(extent, -(radius + gap)));
  return inside.bestRoom >= radius + gap ? inside.best : pick(cornersOf(extent, radius + gap)).best;
}

function grow(box: Box, p: Point, r: number): void {
  box.minX = Math.min(box.minX, p.x - r);
  box.maxX = Math.max(box.maxX, p.x + r);
  box.minY = Math.min(box.minY, p.y - r);
  box.maxY = Math.max(box.maxY, p.y + r);
}

function fallbackTitle(tokens: FlatGraphLayoutTokens): FlatGraphTitle {
  return { halfWidthPx: tokens.titleHalfPx, topPx: tokens.titleDropPx - tokens.titleHalfPx / 2, bottomPx: tokens.titleDropPx + tokens.titleHalfPx / 2 };
}

/**
 * Places a domain graph in world space. Domains go through ForceAtlas2 around the project, each
 * domain's capabilities through a local ForceAtlas2 with partner domains as weak far anchors, and
 * elements on a closed-form golden-angle fan. A pinned id keeps its position and enters every pass
 * fixed. With a frame, the clusters spread to its aspect and every domain's title block is kept
 * clear at the scale the fit will show, re-run at most `TITLE_PASSES` + `MEMBER_PASSES` times as it settles;
 * the graph is fitted once more to the name rows alone, and that picture wins when the full titles
 * outgrow the area or it shows clearly larger.
 * Cost: O(I·D²) for the domains once, then O(P·D·(I·b² + R·n²)) for P ≤ 20 passes over D clusters
 * of b bodies and n members with R separation rounds; elements are O(E). An input equal to the
 * last call's returns a copy of that layout after an O(input) comparison.
 */
export function layoutFlatGraph(model: DialModel, order: readonly string[], tokens: FlatGraphLayoutTokens, pins: RememberedPins | null, frame: FlatGraphFrame | null = null): FittedLayout {
  return drainSteps(layoutFlatGraphSteps(model, order, tokens, pins, frame));
}

/**
 * `layoutFlatGraph` cut at every cluster and domain ForceAtlas2 iteration. A run left unfinished is
 * resumed by the next call with equal inputs, so a superseded build's work is never repeated.
 */
export function* layoutFlatGraphSteps(model: DialModel, order: readonly string[], tokens: FlatGraphLayoutTokens, pins: RememberedPins | null, frame: FlatGraphFrame | null = null): LayoutSteps<FittedLayout> {
  const inputs = layoutInputs(model, order, tokens, pins, frame);
  // A fresh identity: name and line caches key on the layout and must see a retitle the fit ignores.
  if (lastLayout !== null && sameInputs(lastLayout.inputs, inputs)) return { ...lastLayout.layout };
  if (openRun === null || !sameInputs(openRun.inputs, inputs)) openRun = { inputs, steps: fitLayout(model, order, tokens, pins, frame), layout: null };
  const run = openRun;
  while (run.layout === null) {
    const step = run.steps.next();
    if (step.done) {
      run.layout = step.value;
      lastLayout = { inputs, layout: step.value };
      if (openRun === run) openRun = null;
      return step.value;
    }
    yield;
  }
  return { ...run.layout };
}

type LayoutInput = string | number | boolean | null;

/** The last layout and every value it read: a folder that grows only in kinds the graph does not draw lays out once. */
let lastLayout: { inputs: LayoutInput[]; layout: FittedLayout } | null = null;
/** The layout being stepped, kept for the next call with equal inputs; a call with other inputs drops it. */
let openRun: { inputs: LayoutInput[]; steps: LayoutSteps<FittedLayout>; layout: FittedLayout | null } | null = null;

/** Every value `fitLayout` reads, in a fixed order with list lengths. O(D + C + E + flows + dependencies). */
function layoutInputs(model: DialModel, order: readonly string[], tokens: FlatGraphLayoutTokens, pins: RememberedPins | null, frame: FlatGraphFrame | null): LayoutInput[] {
  const out: LayoutInput[] = [model.projectId];
  const list = (values: readonly LayoutInput[]) => {
    out.push(values.length);
    for (const v of values) out.push(v);
  };
  list(order);
  for (const id of order) {
    const d = model.domainById.get(id);
    if (!d) {
      out.push(null);
      continue;
    }
    list(d.capabilityIds);
    list(d.directElementIds);
    for (const cap of d.capabilityIds) list(model.capabilityById.get(cap)?.elementIds ?? []);
  }
  out.push(model.flows.length);
  for (const f of model.flows) out.push(f.a, f.b, f.total);
  out.push(model.capabilityDependencies.length);
  for (const dep of model.capabilityDependencies) out.push(dep.from, dep.to, dep.fromDomain, dep.toDomain);
  list(model.orphanIds);
  for (const key of Object.keys(tokens).sort()) out.push(key, tokens[key as keyof FlatGraphLayoutTokens]);
  for (const points of [pins?.positions, pins?.seeds]) {
    out.push(points?.size ?? null);
    for (const [id, at] of points ?? []) out.push(id, at.x, at.y);
  }
  const fitted = pins?.fittedAt;
  out.push(fitted?.worldPerPx ?? null, fitted?.memberWorldPerPx ?? null, fitted?.areaWidthPx ?? null, fitted?.areaHeightPx ?? null);
  out.push(pins?.compactTitles ?? null, frame?.areaPx?.width ?? null, frame?.areaPx?.height ?? null, frame?.capDiscPx ?? null, frame?.hubPx ?? null);
  for (const titles of [frame?.titles, frame?.compactTitles]) {
    out.push(titles?.size ?? null);
    for (const [id, t] of titles ?? []) out.push(id, t.halfWidthPx, t.topPx, t.bottomPx);
  }
  return out;
}

function sameInputs(a: readonly LayoutInput[], b: readonly LayoutInput[]): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k += 1) if (a[k] !== b[k]) return false;
  return true;
}

function* fitLayout(model: DialModel, order: readonly string[], tokens: FlatGraphLayoutTokens, pins: RememberedPins | null, frame: FlatGraphFrame | null): LayoutSteps<FittedLayout> {
  const area = frame?.areaPx ?? null;
  const aspect = area ? Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, area.width / area.height)) : tokens.aspect;
  const basis = yield* graphBasis(model, order, tokens, pins, aspect);
  const nameRows = frame?.compactTitles ? { ...frame, titles: frame.compactTitles } : null;
  const titled = pins?.compactTitles && nameRows ? nameRows : frame;
  const fittedAt = pins?.fittedAt;
  // A refit from pinned positions starts at the fitted extent and overshoots the scale the picture was fitted at.
  if (fittedAt && fittedAt.areaWidthPx === area?.width && fittedAt.areaHeightPx === area?.height) {
    return { ...(yield* placeGraph(basis, tokens, pins, titled, fittedAt.worldPerPx, fittedAt.memberWorldPerPx)), compactTitles: pins.compactTitles, fittedAt };
  }
  if (nameRows === null) return (yield* fitGraph(basis, tokens, pins, frame)).layout;
  // Pinned positions cannot answer a title reservation, so a pinned rebuild keeps the remembered choice.
  if (pins !== null && pins.positions.size > 0) {
    return { ...(yield* fitGraph(basis, tokens, pins, titled)).layout, compactTitles: pins.compactTitles };
  }
  const full = yield* fitGraph(basis, tokens, pins, frame);
  const compact = yield* fitGraph(basis, tokens, pins, nameRows);
  if (full.titlesHold && full.shown <= compact.shown * COMPACT_TITLE_GAIN) return full.layout;
  return { ...(compact.shown <= full.shown ? compact : full).layout, compactTitles: true };
}

/** One fit of the graph to the frame's titles: whether the fitted scale keeps every title block clear, and the world units it shows per px. */
function* fitGraph(basis: GraphBasis, tokens: FlatGraphLayoutTokens, pins: FlatGraphPins | null, frame: FlatGraphFrame | null): LayoutSteps<{ layout: FittedLayout; titlesHold: boolean; shown: number }> {
  const area = frame?.areaPx ?? null;
  const shownOf = (l: FlatGraphLayout) => area === null ? 1 : Math.max(1, (l.extent.maxX - l.extent.minX) / area.width, (l.extent.maxY - l.extent.minY) / area.height);
  let worldPerPx = 1;
  let layout = yield* placeGraph(basis, tokens, pins, frame, worldPerPx, worldPerPx);
  let shown = shownOf(layout);
  let before = { at: worldPerPx, shown };
  for (let pass = 1; pass < TITLE_PASSES && shown > worldPerPx; pass += 1) {
    const slope = pass === 1 ? 0 : (shown - before.shown) / Math.max(1e-6, worldPerPx - before.at);
    const outgrown = slope >= MAX_TITLE_SLOPE;
    if (outgrown && pass > FIRST_SECANT_PASS) break;
    const fixedPoint = outgrown ? shown : (shown - slope * worldPerPx) / (1 - slope);
    before = { at: worldPerPx, shown };
    worldPerPx = Math.max(shown, fixedPoint) * TITLE_PASS_MARGIN;
    layout = yield* placeGraph(basis, tokens, pins, frame, worldPerPx, worldPerPx);
    shown = shownOf(layout);
  }
  const titlesHold = shown <= worldPerPx;
  let memberWorldPerPx = worldPerPx;
  for (let pass = 0; pass < MEMBER_PASSES && shown > memberWorldPerPx; pass += 1) {
    memberWorldPerPx = shown * TITLE_PASS_MARGIN;
    layout = yield* placeGraph(basis, tokens, pins, frame, worldPerPx, memberWorldPerPx);
    shown = shownOf(layout);
  }
  const fittedAt = { worldPerPx, memberWorldPerPx, areaWidthPx: area?.width, areaHeightPx: area?.height };
  return { layout: { ...layout, fittedAt }, titlesHold, shown };
}

/** What every pass of one layout shares: the domains' own placement and each cluster's inputs. O(D² · I + C + deps). */
interface GraphBasis {
  model: DialModel;
  aspect: number;
  domainIds: string[];
  itemsByDomain: Map<string, FlatGraphItem[]>;
  centres: Map<string, Point>;
  outwardByDomain: Map<string, number>;
  partnersByDomain: Map<string, { domainId: string; angle: number; weight: number }[]>;
  dependenciesByDomain: Map<string, DialCapabilityDependency[]>;
  degree: Map<string, number>;
}

function* graphBasis(model: DialModel, order: readonly string[], tokens: FlatGraphLayoutTokens, pins: FlatGraphPins | null, aspect: number): LayoutSteps<GraphBasis> {
  const domainIds = order.filter((id) => model.domainById.has(id));
  const itemsByDomain = new Map(domainIds.map((id) => [id, itemsOf(model, id)] as const));
  const estimates = new Map(domainIds.map((id) => [id, estimateFootprint(itemsByDomain.get(id)!, tokens)] as const));
  yield;
  const centres = yield* placeDomains(model, domainIds, estimates, pins, tokens, aspect);
  const weights = new Map<string, Map<string, number>>(domainIds.map((id) => [id, new Map()]));
  for (const f of model.flows) {
    weights.get(f.a)?.set(f.b, (weights.get(f.a)?.get(f.b) ?? 0) + f.total);
    weights.get(f.b)?.set(f.a, (weights.get(f.b)?.get(f.a) ?? 0) + f.total);
  }
  const outwardByDomain = new Map<string, number>();
  const partnersByDomain = new Map<string, { domainId: string; angle: number; weight: number }[]>();
  for (const id of domainIds) {
    const c = centres.get(id)!;
    outwardByDomain.set(id, model.projectId !== null && Math.hypot(c.x, c.y) > 1e-6 ? Math.atan2(c.y, c.x) : seedAngle(id));
    partnersByDomain.set(id, [...weights.get(id)!].sort(([a], [b]) => byId(a, b)).map(([other, weight]) => {
      const o = centres.get(other)!;
      return { domainId: other, angle: Math.atan2(o.y - c.y, o.x - c.x), weight };
    }));
  }
  const domainOfItem = new Map<string, string>();
  for (const [id, items] of itemsByDomain) for (const it of items) domainOfItem.set(it.id, id);
  const dependenciesByDomain = new Map<string, DialCapabilityDependency[]>(domainIds.map((id) => [id, []]));
  for (const dep of model.capabilityDependencies) {
    const from = domainOfItem.get(dep.from);
    const to = domainOfItem.get(dep.to);
    if (from !== undefined) dependenciesByDomain.get(from)!.push(dep);
    if (to !== undefined && to !== from) dependenciesByDomain.get(to)!.push(dep);
  }
  return { model, aspect, domainIds, itemsByDomain, centres, outwardByDomain, partnersByDomain, dependenciesByDomain, degree: crossDegree(model) };
}

function* placeGraph(
  basis: GraphBasis,
  tokens: FlatGraphLayoutTokens,
  pins: FlatGraphPins | null,
  frame: FlatGraphFrame | null,
  worldPerPx: number,
  memberWorldPerPx: number,
): LayoutSteps<FlatGraphLayout> {
  const { model, aspect, domainIds, itemsByDomain } = basis;
  const pinned = pins?.positions ?? new Map<string, Point>();
  const titleAt = (id: string, scale: number): Box => {
    const t = frame?.titles.get(id) ?? fallbackTitle(tokens);
    return { minX: -t.halfWidthPx * scale, maxX: t.halfWidthPx * scale, minY: t.topPx * scale, maxY: t.bottomPx * scale };
  };
  const titleOf = (id: string) => titleAt(id, worldPerPx);
  const roomOf = (id: string) => {
    const t = titleOf(id);
    return Math.max(Math.hypot(t.minX, t.minY), Math.hypot(t.maxX, t.minY), Math.hypot(t.minX, t.maxY), Math.hypot(t.maxX, t.maxY));
  };
  const memberClearance = (frame?.capDiscPx ?? 0) * memberWorldPerPx;
  const centres = new Map([...basis.centres].map(([id, at]) => [id, { ...at }] as const));
  const locals = new Map<string, LocalCluster>();
  for (const id of domainIds) {
    const c = centres.get(id)!;
    locals.set(id, layoutCluster(basis.dependenciesByDomain.get(id)!, id, itemsByDomain.get(id)!, basis.outwardByDomain.get(id)!, basis.partnersByDomain.get(id)!, basis.degree, pinned, pinned.has(id) ? c : null, titleAt(id, memberWorldPerPx), roomOf(id), memberClearance, tokens));
    yield;
  }
  spreadDomains(centres, new Map(domainIds.map((id) => [id, locals.get(id)!.footprint])), pinned, model.projectId !== null, Math.max(tokens.hubClearance, (frame?.hubPx ?? 0) * worldPerPx), tokens, aspect);
  yield;

  const positions = new Map<string, Point>();
  const itemAt = new Map<string, Point>();
  if (model.projectId !== null) positions.set(model.projectId, { x: 0, y: 0 });
  const hubReach = model.projectId !== null ? tokens.domainClearance : 0;
  const extent: Box = { minX: -hubReach, minY: -hubReach, maxX: hubReach, maxY: hubReach };
  const clusters: FlatGraphCluster[] = [];
  for (const id of domainIds) {
    const centre = centres.get(id)!;
    const local = locals.get(id)!;
    positions.set(id, centre);
    for (const it of local.items) {
      const offset = local.offsets.get(it.id)!;
      const at = { x: centre.x + offset.x, y: centre.y + offset.y };
      itemAt.set(it.id, at);
      if (!it.direct) positions.set(it.id, at);
      const outward = Math.hypot(offset.x, offset.y) > 1e-6 ? Math.atan2(offset.y, offset.x) : seedAngle(it.id);
      fanElements(positions, at, outward, it.elementIds, tokens);
      grow(extent, at, local.reach.get(it.id)!);
    }
    grow(extent, centre, tokens.domainClearance / 2);
    const title = titleOf(id);
    grow(extent, { x: centre.x + title.minX, y: centre.y + title.minY }, 0);
    grow(extent, { x: centre.x + title.maxX, y: centre.y + title.maxY }, 0);
    clusters.push({ domainId: id, centre, footprint: local.footprint, items: local.items });
  }

  const orphanIds = model.orphanIds.filter((id) => !positions.has(id) && id !== model.projectId).sort(byId);
  if (orphanIds.length > 0) {
    const pitch = tokens.orphanPitch;
    const radius = pitch * Math.sqrt(orphanIds.length);
    const centre = orphanCorner(extent, clusters, radius, tokens.clusterGap);
    orphanIds.forEach((id, k) => {
      const r = pitch * Math.sqrt(k + 0.5);
      positions.set(id, { x: centre.x + Math.cos(k * GOLDEN_ANGLE) * r, y: centre.y + Math.sin(k * GOLDEN_ANGLE) * r });
    });
    grow(extent, centre, radius + pitch);
  }

  return { positions, itemAt, clusters, clusterByDomain: new Map(clusters.map((c) => [c.domainId, c])), orphanIds, extent, compactTitles: false };
}
