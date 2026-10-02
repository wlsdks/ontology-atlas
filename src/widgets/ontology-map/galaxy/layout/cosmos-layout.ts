import type { TreeInputEdge } from "../../model/containment-tree";
import { buildCosmosModel, type CosmosInputNode, type CosmosModel } from "./cosmos-model";
import { classifyGalaxy, galaxyForm, hash01, GALAXY_RADIUS_UNIT, type GalaxyForm } from "./cosmos-morphology";
import { relaxGalaxies, settleGalaxies, type CosmosLink, type SettleResult } from "./cosmos-physics";
import { placeCore, placeGalaxy, projectDisc, type CosmosCluster, type CosmosCore } from "./cosmos-stars";

export { armPoint, MIN_STAR_SPACING, STAR_KIND_CAPABILITY, STAR_KIND_ELEMENT, STAR_KIND_NUCLEUS, STAR_KIND_PROJECT } from "./cosmos-stars";

export interface CosmosGalaxy extends GalaxyForm {
  id: string;
  label: string;
  index: number;
  x: number;
  y: number;
  members: number;
  clusters: CosmosCluster[];
  starIds: string[];
  starU: Float32Array;
  starV: Float32Array;
  starKind: Uint8Array;
  starMagnitude: Float32Array;
  starCluster: Int32Array;
  extent: number;
}

interface CosmosFilament {
  from: number;
  to: number;
  count: number;
  twoWay: boolean;
  bow: number;
}

export interface CosmosPlacementRecord {
  version: 1;
  centres: Record<string, [number, number]>;
}

export interface CosmosLayout {
  galaxies: CosmosGalaxy[];
  filaments: CosmosFilament[];
  core: CosmosCore;
  points: Map<string, { x: number; y: number }>;
  galaxyOf: Map<string, number>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  settle: SettleResult;
  placement: CosmosPlacementRecord;
  timings: { modelMs: number; settleMs: number; placeMs: number; totalMs: number; placedGalaxies: number };
}

const TAU = Math.PI * 2;

export function visualRadius(galaxy: Pick<CosmosGalaxy, "radius" | "extent">): number {
  return Math.min(galaxy.radius, Math.max(galaxy.radius * 0.35, galaxy.extent * 1.08));
}

function chooseBow(galaxies: readonly CosmosGalaxy[], from: number, to: number, coreRadius: number): number {
  const a = galaxies[from]!;
  const b = galaxies[to]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const x1 = a.x + ux * visualRadius(a);
  const y1 = a.y + uy * visualRadius(a);
  const x2 = b.x - ux * visualRadius(b);
  const y2 = b.y - uy * visualRadius(b);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  let px = -uy;
  let py = ux;
  if (px * mx + py * my < 0) {
    px = -px;
    py = -py;
  }
  const chord = Math.hypot(x2 - x1, y2 - y1);
  let best = 0.15;
  let bestCost = Infinity;
  for (const bow of [0.15, 0, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6]) {
    const cx = mx + px * bow * chord;
    const cy = my + py * bow * chord;
    let cost = Math.abs(bow) * 0.02 + (bow < 0 ? 0.01 : 0);
    for (let k = 1; k < 16; k += 1) {
      const t = k / 16;
      const x = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t * t * x2;
      const y = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2;
      for (const g of galaxies) {
        if (g.index === from || g.index === to) continue;
        const reach = visualRadius(g) * 1.08;
        const inside = reach - Math.hypot(x - g.x, y - g.y);
        if (inside > 0) cost += inside / reach;
      }
      const core = coreRadius * 1.15 - Math.hypot(x, y);
      if (core > 0) cost += (1.5 * core) / coreRadius;
    }
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = bow;
    }
  }
  return best;
}

function settleFromRecord(
  model: CosmosModel,
  forms: readonly GalaxyForm[],
  links: readonly CosmosLink[],
  coreRadius: number,
  recorded: Record<string, [number, number]>,
): SettleResult {
  const n = model.galaxies.length;
  const startX = new Float64Array(n);
  const startY = new Float64Array(n);
  const fixed = new Uint8Array(n);
  let reach = coreRadius;
  model.galaxies.forEach((g, i) => {
    const c = recorded[g.id];
    if (c) reach = Math.max(reach, Math.hypot(c[0], c[1]) + forms[i]!.radius);
  });
  model.galaxies.forEach((g, i) => {
    const c = recorded[g.id];
    if (c) {
      startX[i] = c[0];
      startY[i] = c[1];
      fixed[i] = 1;
      return;
    }
    let wx = 0;
    let wy = 0;
    let w = 0;
    for (const link of links) {
      const other = link.a === i ? link.b : link.b === i ? link.a : -1;
      const oc = other >= 0 ? recorded[model.galaxies[other]!.id] : undefined;
      if (!oc) continue;
      wx += oc[0] * link.weight;
      wy += oc[1] * link.weight;
      w += link.weight;
    }
    const angle = hash01(g.id, "orbit-angle") * TAU;
    const home = w > 0 ? { x: wx / w, y: wy / w } : { x: Math.cos(angle) * reach * 0.8, y: Math.sin(angle) * reach * 0.8 };
    startX[i] = home.x + Math.cos(angle) * forms[i]!.radius;
    startY[i] = home.y + Math.sin(angle) * forms[i]!.radius;
  });
  const bodies = model.galaxies.map((g, i) => ({ id: g.id, radius: forms[i]!.radius }));
  const relaxed = relaxGalaxies(startX, startY, bodies, links, { coreRadius, fixed });
  return { x: relaxed.x, y: relaxed.y, keyframes: relaxed.frames.slice(-1), iterations: 160, targetRadius: reach };
}

function settleFresh(
  model: CosmosModel,
  forms: readonly GalaxyForm[],
  baseLinks: readonly CosmosLink[],
  links: readonly CosmosLink[],
  coreRadius: number,
  haloCount: number,
): SettleResult {
  const baseBodies = model.galaxies.map((g) => {
    const shape = classifyGalaxy(g);
    const factor = shape === "elliptical" ? 0.8 : shape === "irregular" ? 0.95 : 1;
    const bucket = 2 ** (Math.round(2 * Math.log2(g.members + 6)) / 2);
    return { id: g.id, radius: GALAXY_RADIUS_UNIT * Math.sqrt(bucket) * factor };
  });
  const haloBucket = 2 ** (Math.round(2 * Math.log2(haloCount + 6)) / 2);
  const baseCore = Math.max(GALAXY_RADIUS_UNIT * 3.2, GALAXY_RADIUS_UNIT * Math.sqrt(haloBucket) * 0.9);
  const base = settleGalaxies(baseBodies, baseLinks, { coreRadius: baseCore });
  const bodies = model.galaxies.map((g, i) => ({ id: g.id, radius: forms[i]!.radius }));
  const relaxed = relaxGalaxies(base.x, base.y, bodies, links, { coreRadius });
  return {
    x: relaxed.x,
    y: relaxed.y,
    keyframes: [...base.keyframes, ...relaxed.frames],
    iterations: base.iterations + 160,
    targetRadius: base.targetRadius,
  };
}

const roundCentre = (x: number, y: number): [number, number] => [Math.round(x * 100) / 100, Math.round(y * 100) / 100];

export function computeCosmosLayout(
  nodes: readonly CosmosInputNode[],
  edges: readonly TreeInputEdge[],
  options: { placement?: CosmosPlacementRecord | null; fresh?: boolean } = {},
): CosmosLayout {
  const t0 = performance.now();
  const model = buildCosmosModel(nodes, edges);
  const t1 = performance.now();
  const forms = model.galaxies.map((g) => galaxyForm(g));
  const indexOf = new Map(model.galaxies.map((g, i) => [g.id, i]));
  const baseLinks: CosmosLink[] = [];
  const exactLinks: CosmosLink[] = [];
  const filaments: CosmosFilament[] = [];
  for (const flow of model.flows) {
    const a = indexOf.get(flow.fromDomain);
    const b = indexOf.get(flow.toDomain);
    if (a === undefined || b === undefined) continue;
    exactLinks.push({ a, b, weight: Math.min(1, Math.log2(1 + flow.count) / 5) });
    if (flow.count >= 2) baseLinks.push({ a, b, weight: Math.min(5, Math.floor(Math.log2(flow.count))) / 5 });
    filaments.push({ from: a, to: b, count: flow.count, twoWay: flow.twoWay, bow: 0.15 });
  }
  const placedIds = new Set<string>();
  if (model.project) placedIds.add(model.project.id);
  for (const id of model.halo) placedIds.add(id);
  for (const g of model.galaxies) {
    placedIds.add(g.id);
    for (const c of g.clusters) {
      placedIds.add(c.id);
      for (const s of c.stars) placedIds.add(s);
    }
    for (const s of g.field) placedIds.add(s);
  }
  const extra = nodes.filter((n) => !placedIds.has(n.id)).map((n) => n.id).sort();
  const core = placeCore(model, extra);
  const recorded = !options.fresh && options.placement?.version === 1 ? options.placement.centres : null;
  const known = recorded ? model.galaxies.some((g) => recorded[g.id]) : false;
  const settle =
    recorded && known
      ? settleFromRecord(model, forms, exactLinks, core.radius, recorded)
      : settleFresh(model, forms, baseLinks, exactLinks, core.radius, model.halo.length + extra.length);
  const t2 = performance.now();

  const points = new Map<string, { x: number; y: number }>();
  const galaxyOf = new Map<string, number>();
  core.starIds.forEach((id, i) => {
    points.set(id, { x: core.starX[i]!, y: core.starY[i]! });
    galaxyOf.set(id, -1);
  });
  let minX = -core.radius;
  let minY = -core.radius;
  let maxX = core.radius;
  let maxY = core.radius;
  let placedGalaxies = 0;
  const galaxies: CosmosGalaxy[] = model.galaxies.map((g, index) => {
    const form = forms[index]!;
    const { placed, fresh } = placeGalaxy(g, form);
    if (fresh) placedGalaxies += 1;
    const galaxy: CosmosGalaxy = {
      ...form,
      id: g.id,
      label: g.label,
      index,
      x: settle.x[index]!,
      y: settle.y[index]!,
      members: g.members,
      clusters: placed.clusters,
      starIds: placed.ids,
      starU: placed.u,
      starV: placed.v,
      starKind: placed.kind,
      starMagnitude: Float32Array.from(placed.ids, (id) => model.magnitudes.get(id) ?? 0),
      starCluster: placed.cluster,
      extent: placed.extent,
    };
    placed.ids.forEach((id, i) => {
      points.set(id, projectDisc(galaxy, placed.u[i]!, placed.v[i]!));
      galaxyOf.set(id, index);
    });
    const reach = form.radius * 1.15;
    minX = Math.min(minX, galaxy.x - reach);
    minY = Math.min(minY, galaxy.y - reach);
    maxX = Math.max(maxX, galaxy.x + reach);
    maxY = Math.max(maxY, galaxy.y + reach);
    return galaxy;
  });
  for (const f of filaments) f.bow = chooseBow(galaxies, f.from, f.to, core.radius);
  const centres: Record<string, [number, number]> = {};
  if (recorded) {
    for (const [id, c] of Object.entries(recorded)) if (!indexOf.has(id)) centres[id] = c;
  }
  for (const g of galaxies) centres[g.id] = roundCentre(g.x, g.y);
  const t3 = performance.now();
  return {
    galaxies,
    filaments,
    core,
    points,
    galaxyOf,
    bounds: { minX, minY, maxX, maxY },
    settle,
    placement: { version: 1, centres },
    timings: { modelMs: t1 - t0, settleMs: t2 - t1, placeMs: t3 - t2, totalMs: t3 - t0, placedGalaxies },
  };
}
