import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

import type { Box, DialModel, Point } from "../dial/types";
import { GOLDEN_ANGLE, byId, seedAngle, seedUnit } from "./seed";
import type { FlatGraphCluster, FlatGraphFrame, FlatGraphItem, FlatGraphLayout, FlatGraphLayoutTokens, FlatGraphPins, FlatGraphTitle } from "./types";

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

interface Body { id: string; x: number; y: number; r: number; fixed: boolean }
interface Spring { a: string; b: string; weight: number }

export function directItemId(domainId: string): string {
  return `${domainId}::direct`;
}

/** Synchronous ForceAtlas2 over sorted bodies and springs: identical input gives identical output. */
function runForceAtlas2(bodies: readonly Body[], springs: readonly Spring[], iterations: number): Map<string, Point> {
  if (bodies.every((b) => b.fixed)) return new Map(bodies.map((b) => [b.id, { x: b.x, y: b.y }]));
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
  if (graph.size > 0 && iterations > 0) forceAtlas2.assign(graph, { iterations, settings: FORCE_SETTINGS, getEdgeWeight: "weight" });
  const out = new Map<string, Point>();
  graph.forEachNode((id, attr) => out.set(id, { x: attr.x as number, y: attr.y as number }));
  return out;
}

/**
 * ForceAtlas2 costs O(iterations · n²) and a fit runs it once per pass. A cluster past
 * `FULL_ITERATION_BODIES` gets the iterations that keep that size's pair work, down to one pass.
 */
function budgetedIterations(iterations: number, bodyCount: number): number {
  if (bodyCount <= FULL_ITERATION_BODIES) return iterations;
  return Math.min(iterations, Math.max(1, Math.round(iterations * (FULL_ITERATION_BODIES / bodyCount) ** 2)));
}

/** Pairwise separation in sorted order; fixed bodies never move. O(rounds · n²). */
function separate(bodies: Body[], gap: number, rounds: number): void {
  for (let round = 0; round < rounds; round += 1) {
    let moved = false;
    for (let i = 0; i < bodies.length; i += 1) {
      const p = bodies[i]!;
      for (let j = i + 1; j < bodies.length; j += 1) {
        const q = bodies[j]!;
        if (p.fixed && q.fixed) continue;
        const need = p.r + q.r + gap;
        let dx = q.x - p.x;
        let dy = q.y - p.y;
        const squared = dx * dx + dy * dy;
        if (squared >= need * need) continue;
        let d = Math.sqrt(squared);
        if (d < 1e-6) {
          const a = seedAngle(`${p.id}|${q.id}`);
          dx = Math.cos(a);
          dy = Math.sin(a);
          d = 1;
        }
        const push = need - d;
        const ux = dx / d;
        const uy = dy / d;
        const pShare = p.fixed ? 0 : q.fixed ? 1 : 0.5;
        const qShare = 1 - pShare;
        p.x -= ux * push * pShare;
        p.y -= uy * push * pShare;
        q.x += ux * push * qShare;
        q.y += uy * push * qShare;
        moved = true;
      }
    }
    if (!moved) return;
  }
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
  model: DialModel,
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
  for (const dep of model.capabilityDependencies) {
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

/** How far a point is from a box; zero inside it. */
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

function placeDomains(
  model: DialModel,
  order: readonly string[],
  radii: ReadonlyMap<string, number>,
  pins: FlatGraphPins | null,
  tokens: FlatGraphLayoutTokens,
  aspect: number,
): Map<string, Point> {
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
  const placed = order.length > 1 || hasHub ? runForceAtlas2(bodies, springs, tokens.domainIterations) : new Map<string, Point>();
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
 * Cost: O(P·(I·D² + I·n²)) for P passes, D domains and n items per domain; elements are O(E).
 */
export function layoutFlatGraph(model: DialModel, order: readonly string[], tokens: FlatGraphLayoutTokens, pins: FlatGraphPins | null, frame: FlatGraphFrame | null = null): FlatGraphLayout {
  const nameRows = frame?.compactTitles ? { ...frame, titles: frame.compactTitles } : null;
  if (nameRows === null) return fitGraph(model, order, tokens, pins, frame).layout;
  // Pinned positions cannot answer a title reservation, so a pinned rebuild keeps the remembered choice.
  if (pins !== null && pins.positions.size > 0) {
    return { ...fitGraph(model, order, tokens, pins, pins.compactTitles ? nameRows : frame).layout, compactTitles: pins.compactTitles };
  }
  const full = fitGraph(model, order, tokens, pins, frame);
  const compact = fitGraph(model, order, tokens, pins, nameRows);
  if (full.titlesHold && full.shown <= compact.shown * COMPACT_TITLE_GAIN) return full.layout;
  return { ...(compact.shown <= full.shown ? compact : full).layout, compactTitles: true };
}

/** One fit of the graph to the frame's titles: whether the fitted scale keeps every title block clear, and the world units it shows per px. */
function fitGraph(model: DialModel, order: readonly string[], tokens: FlatGraphLayoutTokens, pins: FlatGraphPins | null, frame: FlatGraphFrame | null): { layout: FlatGraphLayout; titlesHold: boolean; shown: number } {
  const area = frame?.areaPx ?? null;
  const aspect = area ? Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, area.width / area.height)) : tokens.aspect;
  const shownOf = (l: FlatGraphLayout) => area === null ? 1 : Math.max(1, (l.extent.maxX - l.extent.minX) / area.width, (l.extent.maxY - l.extent.minY) / area.height);
  let worldPerPx = 1;
  let layout = placeGraph(model, order, tokens, pins, frame, aspect, worldPerPx, worldPerPx);
  let shown = shownOf(layout);
  let before = { at: worldPerPx, shown };
  for (let pass = 1; pass < TITLE_PASSES && shown > worldPerPx; pass += 1) {
    const slope = pass === 1 ? 0 : (shown - before.shown) / Math.max(1e-6, worldPerPx - before.at);
    const outgrown = slope >= MAX_TITLE_SLOPE;
    if (outgrown && pass > FIRST_SECANT_PASS) break;
    const fixedPoint = outgrown ? shown : (shown - slope * worldPerPx) / (1 - slope);
    before = { at: worldPerPx, shown };
    worldPerPx = Math.max(shown, fixedPoint) * TITLE_PASS_MARGIN;
    layout = placeGraph(model, order, tokens, pins, frame, aspect, worldPerPx, worldPerPx);
    shown = shownOf(layout);
  }
  const titlesHold = shown <= worldPerPx;
  for (let pass = 0, memberScale = worldPerPx; pass < MEMBER_PASSES && shown > memberScale; pass += 1) {
    memberScale = shown * TITLE_PASS_MARGIN;
    layout = placeGraph(model, order, tokens, pins, frame, aspect, worldPerPx, memberScale);
    shown = shownOf(layout);
  }
  return { layout, titlesHold, shown };
}

function placeGraph(
  model: DialModel,
  order: readonly string[],
  tokens: FlatGraphLayoutTokens,
  pins: FlatGraphPins | null,
  frame: FlatGraphFrame | null,
  aspect: number,
  worldPerPx: number,
  memberWorldPerPx: number,
): FlatGraphLayout {
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
  const domainIds = order.filter((id) => model.domainById.has(id));
  const itemsByDomain = new Map(domainIds.map((id) => [id, itemsOf(model, id)] as const));
  const estimates = new Map(domainIds.map((id) => [id, estimateFootprint(itemsByDomain.get(id)!, tokens)] as const));
  const centres = placeDomains(model, domainIds, estimates, pins, tokens, aspect);
  const degree = crossDegree(model);
  const partnersOf = new Map<string, Map<string, number>>(domainIds.map((id) => [id, new Map()]));
  for (const f of model.flows) {
    partnersOf.get(f.a)?.set(f.b, (partnersOf.get(f.a)?.get(f.b) ?? 0) + f.total);
    partnersOf.get(f.b)?.set(f.a, (partnersOf.get(f.b)?.get(f.a) ?? 0) + f.total);
  }
  const locals = new Map<string, LocalCluster>();
  for (const id of domainIds) {
    const c = centres.get(id)!;
    const outward = model.projectId !== null && Math.hypot(c.x, c.y) > 1e-6 ? Math.atan2(c.y, c.x) : seedAngle(id);
    const partners = [...partnersOf.get(id)!].sort(([a], [b]) => byId(a, b)).map(([other, weight]) => {
      const o = centres.get(other)!;
      return { domainId: other, angle: Math.atan2(o.y - c.y, o.x - c.x), weight };
    });
    locals.set(id, layoutCluster(model, id, itemsByDomain.get(id)!, outward, partners, degree, pinned, pinned.has(id) ? c : null, titleAt(id, memberWorldPerPx), roomOf(id), memberClearance, tokens));
  }
  spreadDomains(centres, new Map(domainIds.map((id) => [id, locals.get(id)!.footprint])), pinned, model.projectId !== null, Math.max(tokens.hubClearance, (frame?.hubPx ?? 0) * worldPerPx), tokens, aspect);

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
