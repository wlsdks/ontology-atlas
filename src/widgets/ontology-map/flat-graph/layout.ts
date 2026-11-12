import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

import type { Box, DialModel, Point } from "../dial/types";
import { assignDomainHues } from "./hue";
import { GOLDEN_ANGLE, byId, seedAngle, seedUnit } from "./seed";
import type { FlatGraphCluster, FlatGraphItem, FlatGraphLayout, FlatGraphLayoutTokens, FlatGraphPins } from "./types";

const HUB_ID = "\u0000hub";
const TITLE_LEFT = "\u0000title-left";
const TITLE_RIGHT = "\u0000title-right";
const ANCHOR_PREFIX = "\u0000anchor:";
const PACKING = 0.62;
const SEED_JITTER = 0.25;
const ADJACENT_REACH = 1.6;
const PUSH_ROUNDS = 80;
const CLUSTER_SPREAD = 0.8;
const COMPACT_ROUNDS = 40;
const COMPACT_PULL = 0.04;
const COMPACT_SEPARATIONS = 6;
const MAX_STRETCH = 2;

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

/** Pairwise separation in sorted order; fixed bodies never move. O(rounds · n²). */
function separate(bodies: Body[], gap: number, rounds: number): void {
  for (let round = 0; round < rounds; round += 1) {
    let moved = false;
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const p = bodies[i]!;
        const q = bodies[j]!;
        if (p.fixed && q.fixed) continue;
        const need = p.r + q.r + gap;
        let dx = q.x - p.x;
        let dy = q.y - p.y;
        let d = Math.hypot(dx, dy);
        if (d >= need) continue;
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
  tokens: FlatGraphLayoutTokens,
): LocalCluster {
  const reach = new Map(items.map((it) => [it.id, Math.max(tokens.capSpacing / 2, elementFanRadius(it.elementIds.length, tokens))]));
  const ranked = [...items].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || byId(a.id, b.id));
  const estimate = estimateFootprint(items, tokens);
  const bodies: Body[] = [{ id: domainId, x: 0, y: 0, r: tokens.domainClearance, fixed: true }];
  bodies.push({ id: TITLE_LEFT, x: -tokens.titleHalfPx / 2, y: tokens.titleDropPx, r: tokens.titleHalfPx / 2, fixed: true });
  bodies.push({ id: TITLE_RIGHT, x: tokens.titleHalfPx / 2, y: tokens.titleDropPx, r: tokens.titleHalfPx / 2, fixed: true });
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
  const placed = runForceAtlas2(bodies, springs, ranked.length > 0 ? tokens.capabilityIterations : 0);
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
  separate(relaxed, 0, tokens.relaxRounds);
  const offsets = new Map<string, Point>();
  let footprint = Math.hypot(tokens.titleHalfPx, tokens.titleDropPx) + tokens.titleHalfPx / 2;
  footprint = Math.max(footprint, tokens.domainClearance);
  for (const b of relaxed) {
    if (!members.has(b.id)) continue;
    offsets.set(b.id, { x: b.x, y: b.y });
    footprint = Math.max(footprint, Math.hypot(b.x, b.y) + reach.get(b.id)!);
  }
  return { items, offsets, reach, footprint };
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
): Map<string, Point> {
  const pinned = pins?.positions ?? new Map<string, Point>();
  const seeds = circularSeed(order, radii, tokens);
  for (const [id, at] of pins?.seeds ?? []) if (seeds.has(id)) seeds.set(id, { x: at.x / tokens.aspect, y: at.y });
  const hasHub = model.projectId !== null;
  const bodies: Body[] = order.map((id) => {
    const pin = pinned.get(id);
    const at = pin ?? seeds.get(id)!;
    return { id, x: pin ? at.x / tokens.aspect : at.x, y: at.y, r: radii.get(id)!, fixed: !!pin };
  });
  if (hasHub) bodies.push({ id: HUB_ID, x: 0, y: 0, r: tokens.hubClearance, fixed: true });
  const springs: Spring[] = hasHub ? order.map((id) => ({ a: HUB_ID, b: id, weight: 1 })) : [];
  for (const f of model.flows) springs.push({ a: f.a, b: f.b, weight: tokens.flowWeight * Math.log1p(f.total) });
  const placed = order.length > 1 || hasHub ? runForceAtlas2(bodies, springs, tokens.domainIterations) : new Map<string, Point>();
  return new Map(order.map((id) => {
    const pin = pinned.get(id);
    if (pin) return [id, { ...pin }] as const;
    const at = placed.get(id) ?? seeds.get(id)!;
    return [id, { x: at.x * tokens.aspect, y: at.y }] as const;
  }));
}

function spreadDomains(
  centres: Map<string, Point>,
  footprints: ReadonlyMap<string, number>,
  pinned: ReadonlyMap<string, Point>,
  hasHub: boolean,
  tokens: FlatGraphLayoutTokens,
): void {
  const ids = [...centres.keys()].sort(byId);
  const anyPinned = ids.some((id) => pinned.has(id));
  if (!anyPinned) {
    let s = 0;
    for (let i = 0; i < ids.length; i += 1) {
      const p = centres.get(ids[i]!)!;
      const fp = footprints.get(ids[i]!)!;
      if (hasHub) s = Math.max(s, (fp + tokens.hubClearance) / Math.max(1e-6, Math.hypot(p.x, p.y)));
      for (let j = i + 1; j < ids.length; j += 1) {
        const q = centres.get(ids[j]!)!;
        s = Math.max(s, (fp + footprints.get(ids[j]!)! + tokens.clusterGap) / Math.max(1e-6, Math.hypot(q.x - p.x, q.y - p.y)));
      }
    }
    if (s > 0 && Number.isFinite(s)) for (const p of centres.values()) { p.x *= s; p.y *= s; }
  }
  const bodies: Body[] = ids.map((id) => ({ id, ...centres.get(id)!, r: footprints.get(id)!, fixed: pinned.has(id) }));
  if (hasHub) bodies.push({ id: HUB_ID, x: 0, y: 0, r: tokens.hubClearance, fixed: true });
  if (!anyPinned) {
    for (let round = 0; round < COMPACT_ROUNDS; round += 1) {
      for (const b of bodies) if (!b.fixed) { b.x *= 1 - COMPACT_PULL; b.y *= 1 - COMPACT_PULL * tokens.aspect; }
      separate(bodies, tokens.clusterGap, COMPACT_SEPARATIONS);
    }
  }
  separate(bodies, tokens.clusterGap, PUSH_ROUNDS);
  if (!anyPinned) stretchToAspect(bodies.filter((b) => b.id !== HUB_ID), tokens.aspect);
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

/**
 * Places a domain graph in world space. Domains go through ForceAtlas2 around the project, each
 * domain's capabilities through a local ForceAtlas2 with partner domains as weak far anchors, and
 * elements on a closed-form golden-angle fan. A pinned id keeps its position and enters every pass
 * fixed. Cost: O(I·D²) for domains plus O(I·n²) per domain of n items; elements are O(E).
 */
export function layoutFlatGraph(model: DialModel, order: readonly string[], tokens: FlatGraphLayoutTokens, pins: FlatGraphPins | null): FlatGraphLayout {
  const pinned = pins?.positions ?? new Map<string, Point>();
  const domainIds = order.filter((id) => model.domainById.has(id));
  const itemsByDomain = new Map(domainIds.map((id) => [id, itemsOf(model, id)] as const));
  const estimates = new Map(domainIds.map((id) => [id, estimateFootprint(itemsByDomain.get(id)!, tokens)] as const));
  const centres = placeDomains(model, domainIds, estimates, pins, tokens);
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
    locals.set(id, layoutCluster(model, id, itemsByDomain.get(id)!, outward, partners, degree, pinned, pinned.has(id) ? c : null, tokens));
  }
  spreadDomains(centres, new Map(domainIds.map((id) => [id, locals.get(id)!.footprint])), pinned, model.projectId !== null, tokens);

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
    grow(extent, { x: centre.x - tokens.titleHalfPx / 2, y: centre.y + tokens.titleDropPx }, tokens.titleHalfPx / 2);
    grow(extent, { x: centre.x + tokens.titleHalfPx / 2, y: centre.y + tokens.titleDropPx }, tokens.titleHalfPx / 2);
    clusters.push({ domainId: id, centre, footprint: local.footprint, hue: 0, items: local.items });
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

  const adjacent = (a: string, b: string): boolean => {
    const ia = domainIds.indexOf(a);
    const ib = domainIds.indexOf(b);
    const n = domainIds.length;
    if (n > 2 && (Math.abs(ia - ib) === 1 || Math.abs(ia - ib) === n - 1)) return true;
    const p = centres.get(a)!;
    const q = centres.get(b)!;
    const reach = (locals.get(a)!.footprint + locals.get(b)!.footprint + tokens.clusterGap) * ADJACENT_REACH;
    return Math.hypot(p.x - q.x, p.y - q.y) < reach;
  };
  const hueByDomain = assignDomainHues(domainIds, adjacent, pins?.hueByDomain ?? null);
  const hued = clusters.map((c) => ({ ...c, hue: hueByDomain.get(c.domainId) ?? 0 }));
  return { positions, itemAt, clusters: hued, clusterByDomain: new Map(hued.map((c) => [c.domainId, c])), hueByDomain, orphanIds, extent };
}
