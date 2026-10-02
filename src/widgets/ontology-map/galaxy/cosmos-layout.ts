import type { TreeInputEdge } from "../model/containment-tree";
import { buildCosmosModel, type CosmosGalaxyModel, type CosmosInputNode, type CosmosModel } from "./cosmos-model";
import { classifyGalaxy, galaxyForm, hash01, GALAXY_RADIUS_UNIT, type GalaxyForm } from "./cosmos-morphology";
import { relaxDiscs, relaxGalaxies, separatePoints, settleGalaxies, type CosmosLink, type SettleResult, type SettleTuning } from "./cosmos-physics";

export const STAR_KIND_NUCLEUS = 0;
export const STAR_KIND_CAPABILITY = 1;
export const STAR_KIND_ELEMENT = 2;
export const STAR_KIND_PROJECT = 3;

const CLUSTER_UNIT = 4.4;

export const MIN_STAR_SPACING = 5.5;

interface CosmosCluster {
  id: string;
  label: string;
  u: number;
  v: number;
  radius: number;
  starCount: number;
}

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

interface CosmosCore {
  id: string | null;
  label: string;
  radius: number;
  starIds: string[];
  starX: Float32Array;
  starY: Float32Array;
  starKind: Uint8Array;
  starMagnitude: Float32Array;
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
  timings: { modelMs: number; settleMs: number; placeMs: number; totalMs: number };
}

const TAU = Math.PI * 2;

export function visualRadius(galaxy: Pick<CosmosGalaxy, "radius" | "extent">): number {
  return Math.min(galaxy.radius, Math.max(galaxy.radius * 0.35, galaxy.extent * 1.08));
}

function projectDisc(galaxy: Pick<CosmosGalaxy, "x" | "y" | "tilt" | "angle">, u: number, v: number, theta = 0): { x: number; y: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const ru = u * c - v * s;
  const rv = (u * s + v * c) * galaxy.tilt;
  const ca = Math.cos(galaxy.angle);
  const sa = Math.sin(galaxy.angle);
  return { x: galaxy.x + ru * ca - rv * sa, y: galaxy.y + ru * sa + rv * ca };
}

export function armPoint(form: GalaxyForm, arm: number, t: number, phase: number): { u: number; v: number; heading: number } {
  const t0 = 0.12;
  const tt = t0 + (1 - t0) * Math.min(1, Math.max(0, t));
  const b = Math.tan(form.pitch);
  const theta = phase + (arm * TAU) / Math.max(1, form.arms) + (form.spin * Math.log(tt / t0)) / b;
  const r = form.radius * tt;
  return { u: Math.cos(theta) * r, v: Math.sin(theta) * r, heading: theta + form.spin * (Math.PI / 2 - form.pitch) };
}

interface Placed {
  ids: string[];
  u: number[];
  v: number[];
  kind: number[];
  cluster: number[];
}

function placeClusters(galaxy: CosmosGalaxyModel, form: GalaxyForm): CosmosCluster[] {
  const n = galaxy.clusters.length;
  const radius = new Float64Array(n);
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const phase = hash01(galaxy.id, "arm-phase") * TAU;
  let dominant = -1;
  let dominantStars = -1;
  galaxy.clusters.forEach((c, i) => {
    radius[i] = CLUSTER_UNIT * Math.sqrt(c.stars.length + 1);
    if (c.stars.length > dominantStars) {
      dominantStars = c.stars.length;
      dominant = i;
    }
  });
  const clumps = Math.min(3, 1 + Math.floor(n / 3));
  galaxy.clusters.forEach((c, i) => {
    const size = Math.min(1, c.stars.length / 40);
    if (form.shape === "spiral") {
      const arm = Math.floor(hash01(c.id, "arm") * form.arms);
      const t = (0.06 + 0.9 * hash01(c.id, "arm-t")) * (1 - 0.3 * size);
      const p = armPoint(form, arm, t, phase);
      const half = form.radius * (0.03 + 0.06 * t);
      const off = (hash01(c.id, "arm-offset") - 0.5) * 2 * half;
      ax[i] = p.u + Math.cos(p.heading + Math.PI / 2) * off;
      ay[i] = p.v + Math.sin(p.heading + Math.PI / 2) * off;
    } else if (form.shape === "elliptical") {
      if (i === dominant) {
        ax[i] = 0;
        ay[i] = 0;
        return;
      }
      const r = form.radius * 0.82 * hash01(c.id, "shell") ** 0.8;
      const a = hash01(c.id, "shell-angle") * TAU;
      ax[i] = Math.cos(a) * r;
      ay[i] = Math.sin(a) * r * form.axisRatio;
    } else {
      const clump = Math.floor(hash01(c.id, "clump") * clumps);
      const ca = hash01(`${galaxy.id}#${clump}`, "clump-angle") * TAU;
      const cr = form.radius * 0.45 * Math.sqrt(hash01(`${galaxy.id}#${clump}`, "clump-radius"));
      const a = hash01(c.id, "clump-offset-angle") * TAU;
      const r = form.radius * 0.32 * Math.sqrt(hash01(c.id, "clump-offset"));
      ax[i] = Math.cos(ca) * cr + Math.cos(a) * r;
      ay[i] = Math.sin(ca) * cr + Math.sin(a) * r;
    }
  });
  const ux = Float64Array.from(ax);
  const uy = Float64Array.from(ay);
  relaxDiscs(ux, uy, ax, ay, radius, MIN_STAR_SPACING * 1.4);
  return galaxy.clusters.map((c, i) => ({
    id: c.id,
    label: c.label,
    u: ux[i]!,
    v: uy[i]!,
    radius: radius[i]!,
    starCount: c.stars.length,
  }));
}

function placeField(id: string, form: GalaxyForm, galaxyId: string, phase: number): { u: number; v: number } {
  const h1 = hash01(id, "field-1");
  const h2 = hash01(id, "field-2");
  const h3 = hash01(id, "field-3");
  if (form.shape === "spiral") {
    if (h1 < 0.32) {
      const r = form.radius * 0.2 * h2 ** 0.7;
      return { u: Math.cos(h3 * TAU) * r, v: Math.sin(h3 * TAU) * r };
    }
    const arm = Math.floor(hash01(id, "field-arm") * form.arms);
    const t = h2;
    const p = armPoint(form, arm, t, phase);
    const off = (h3 - 0.5) * 2 * form.radius * (0.05 + 0.1 * t);
    return { u: p.u + Math.cos(p.heading + Math.PI / 2) * off, v: p.v + Math.sin(p.heading + Math.PI / 2) * off };
  }
  if (form.shape === "elliptical") {
    const r = form.radius * 0.95 * h2 ** 1.25;
    return { u: Math.cos(h3 * TAU) * r, v: Math.sin(h3 * TAU) * r * form.axisRatio };
  }
  const clumps = 3;
  const clump = Math.floor(h1 * clumps);
  const ca = hash01(`${galaxyId}#${clump}`, "clump-angle") * TAU;
  const cr = form.radius * 0.45 * Math.sqrt(hash01(`${galaxyId}#${clump}`, "clump-radius"));
  const r = form.radius * 0.5 * Math.sqrt(h2);
  return { u: Math.cos(ca) * cr + Math.cos(h3 * TAU) * r, v: Math.sin(ca) * cr + Math.sin(h3 * TAU) * r };
}

function placeGalaxyStars(galaxy: CosmosGalaxyModel, form: GalaxyForm, clusters: readonly CosmosCluster[]): Placed {
  const placed: Placed = { ids: [galaxy.id], u: [0], v: [0], kind: [STAR_KIND_NUCLEUS], cluster: [-1] };
  const phase = hash01(galaxy.id, "arm-phase") * TAU;
  clusters.forEach((cluster, ci) => {
    placed.ids.push(cluster.id);
    placed.u.push(cluster.u);
    placed.v.push(cluster.v);
    placed.kind.push(STAR_KIND_CAPABILITY);
    placed.cluster.push(ci);
    for (const star of galaxy.clusters[ci]!.stars) {
      const r = cluster.radius * hash01(star, "cluster-r") ** 0.65;
      const a = hash01(star, "cluster-a") * TAU;
      placed.ids.push(star);
      placed.u.push(cluster.u + Math.cos(a) * r);
      placed.v.push(cluster.v + Math.sin(a) * r);
      placed.kind.push(STAR_KIND_ELEMENT);
      placed.cluster.push(ci);
    }
  });
  for (const star of galaxy.field) {
    const p = placeField(star, form, galaxy.id, phase);
    placed.ids.push(star);
    placed.u.push(p.u);
    placed.v.push(p.v);
    placed.kind.push(STAR_KIND_ELEMENT);
    placed.cluster.push(-1);
  }
  const px = Float64Array.from(placed.u);
  const py = Float64Array.from(placed.v);
  separatePoints(px, py, MIN_STAR_SPACING / form.tilt);
  for (let i = 0; i < px.length; i += 1) {
    if (placed.kind[i] === STAR_KIND_ELEMENT) {
      placed.u[i] = px[i]!;
      placed.v[i] = py[i]!;
    }
  }
  return placed;
}

function placeCore(model: CosmosModel, extraIds: readonly string[]): CosmosCore {
  const halo = [...model.halo, ...extraIds];
  const radius = Math.max(GALAXY_RADIUS_UNIT * 3.2, GALAXY_RADIUS_UNIT * Math.sqrt(halo.length + 6) * 0.9);
  const ids: string[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const kinds: number[] = [];
  if (model.project) {
    ids.push(model.project.id);
    xs.push(0);
    ys.push(0);
    kinds.push(STAR_KIND_PROJECT);
  }
  for (const id of halo) {
    const r = radius * (0.32 + 0.68 * Math.sqrt(hash01(id, "halo-r")));
    const a = hash01(id, "halo-a") * TAU;
    ids.push(id);
    xs.push(Math.cos(a) * r);
    ys.push(Math.sin(a) * r * 0.86);
    kinds.push(model.kinds.get(id) === "capability" ? STAR_KIND_CAPABILITY : model.kinds.get(id) === "project" ? STAR_KIND_PROJECT : STAR_KIND_ELEMENT);
  }
  const px = Float64Array.from(xs);
  const py = Float64Array.from(ys);
  separatePoints(px, py, MIN_STAR_SPACING);
  for (let i = model.project ? 1 : 0; i < px.length; i += 1) {
    xs[i] = px[i]!;
    ys[i] = py[i]!;
  }
  return {
    id: model.project?.id ?? null,
    label: model.project?.label ?? "",
    radius,
    starIds: ids,
    starX: Float32Array.from(xs),
    starY: Float32Array.from(ys),
    starKind: Uint8Array.from(kinds),
    starMagnitude: Float32Array.from(ids.map((id) => model.magnitudes.get(id) ?? 0)),
  };
}

export interface CosmosPlacementRecord {
  version: 1;
  centres: Record<string, [number, number]>;
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

export function computeCosmosLayout(
  nodes: readonly CosmosInputNode[],
  edges: readonly TreeInputEdge[],
  options: { tuning?: Partial<SettleTuning>; placement?: CosmosPlacementRecord | null } = {},
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
  const exactBodies = model.galaxies.map((g, i) => ({ id: g.id, radius: forms[i]!.radius }));
  const recorded = options.placement?.version === 1 ? options.placement.centres : null;
  const known = recorded ? model.galaxies.filter((g) => recorded[g.id]).length : 0;
  let settle: SettleResult;
  if (recorded && known > 0) {
    const n = model.galaxies.length;
    const startX = new Float64Array(n);
    const startY = new Float64Array(n);
    const fixed = new Uint8Array(n);
    let reach = core.radius;
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
      for (const link of exactLinks) {
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
    const relaxed = relaxGalaxies(startX, startY, exactBodies, exactLinks, { coreRadius: core.radius, tuning: options.tuning, fixed });
    settle = { x: relaxed.x, y: relaxed.y, keyframes: relaxed.frames.slice(-1), iterations: 160, targetRadius: reach };
  } else {
    const baseBodies = model.galaxies.map((g) => {
      const shape = classifyGalaxy(g);
      const factor = shape === "elliptical" ? 0.8 : shape === "irregular" ? 0.95 : 1;
      const bucket = 2 ** (Math.round(2 * Math.log2(g.members + 6)) / 2);
      return { id: g.id, radius: GALAXY_RADIUS_UNIT * Math.sqrt(bucket) * factor };
    });
    const haloBucket = 2 ** (Math.round(2 * Math.log2(model.halo.length + extra.length + 6)) / 2);
    const baseCore = Math.max(GALAXY_RADIUS_UNIT * 3.2, GALAXY_RADIUS_UNIT * Math.sqrt(haloBucket) * 0.9);
    const base = settleGalaxies(baseBodies, baseLinks, { coreRadius: baseCore, tuning: options.tuning });
    const relaxed = relaxGalaxies(base.x, base.y, exactBodies, exactLinks, { coreRadius: core.radius, tuning: options.tuning });
    settle = {
      x: relaxed.x,
      y: relaxed.y,
      keyframes: [...base.keyframes, ...relaxed.frames],
      iterations: base.iterations + 160,
      targetRadius: base.targetRadius,
    };
  }
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
  const galaxies: CosmosGalaxy[] = model.galaxies.map((g, index) => {
    const form = forms[index]!;
    const clusters = placeClusters(g, form);
    const placed = placeGalaxyStars(g, form, clusters);
    const galaxy: CosmosGalaxy = {
      ...form,
      id: g.id,
      label: g.label,
      index,
      x: settle.x[index]!,
      y: settle.y[index]!,
      members: g.members,
      clusters,
      starIds: placed.ids,
      starU: Float32Array.from(placed.u),
      starV: Float32Array.from(placed.v),
      starKind: Uint8Array.from(placed.kind),
      starMagnitude: Float32Array.from(placed.ids.map((id) => model.magnitudes.get(id) ?? 0)),
      starCluster: Int32Array.from(placed.cluster),
      extent: placed.u.reduce((max, u, i) => Math.max(max, Math.hypot(u, placed.v[i]!)), form.radius * 0.3),
    };
    placed.ids.forEach((id, i) => {
      const p = projectDisc(galaxy, placed.u[i]!, placed.v[i]!);
      points.set(id, p);
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
  const t3 = performance.now();
  return {
    galaxies,
    filaments,
    core,
    points,
    galaxyOf,
    bounds: { minX, minY, maxX, maxY },
    settle,
    placement: {
      version: 1,
      centres: Object.fromEntries(galaxies.map((g) => [g.id, [Math.round(g.x * 100) / 100, Math.round(g.y * 100) / 100] as [number, number]])),
    },
    timings: { modelMs: t1 - t0, settleMs: t2 - t1, placeMs: t3 - t2, totalMs: t3 - t0 },
  };
}
