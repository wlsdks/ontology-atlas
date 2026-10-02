import type { CosmosGalaxyModel, CosmosModel } from "./cosmos-model";
import { hash01, GALAXY_RADIUS_UNIT, type GalaxyForm } from "./cosmos-morphology";
import { relaxDiscs, separatePoints } from "./cosmos-physics";

export const STAR_KIND_NUCLEUS = 0;
export const STAR_KIND_CAPABILITY = 1;
export const STAR_KIND_ELEMENT = 2;
export const STAR_KIND_PROJECT = 3;

export const MIN_STAR_SPACING = 5.5;

const CLUSTER_UNIT = 4.4;
const TAU = Math.PI * 2;
const PLACEMENT_CACHE_LIMIT = 2048;

export interface CosmosCluster {
  id: string;
  label: string;
  u: number;
  v: number;
  radius: number;
  starCount: number;
}

export interface CosmosCore {
  id: string | null;
  label: string;
  radius: number;
  starIds: string[];
  starX: Float32Array;
  starY: Float32Array;
  starKind: Uint8Array;
  starMagnitude: Float32Array;
}

export interface PlacedGalaxy {
  clusters: CosmosCluster[];
  ids: string[];
  u: Float32Array;
  v: Float32Array;
  kind: Uint8Array;
  cluster: Int32Array;
  extent: number;
}

export function projectDisc(
  galaxy: { x: number; y: number; tilt: number; angle: number },
  u: number,
  v: number,
  theta = 0,
): { x: number; y: number } {
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
    const p = armPoint(form, arm, h2, phase);
    const off = (h3 - 0.5) * 2 * form.radius * (0.05 + 0.1 * h2);
    return { u: p.u + Math.cos(p.heading + Math.PI / 2) * off, v: p.v + Math.sin(p.heading + Math.PI / 2) * off };
  }
  if (form.shape === "elliptical") {
    const r = form.radius * 0.95 * h2 ** 1.25;
    return { u: Math.cos(h3 * TAU) * r, v: Math.sin(h3 * TAU) * r * form.axisRatio };
  }
  const clump = Math.floor(h1 * 3);
  const ca = hash01(`${galaxyId}#${clump}`, "clump-angle") * TAU;
  const cr = form.radius * 0.45 * Math.sqrt(hash01(`${galaxyId}#${clump}`, "clump-radius"));
  const r = form.radius * 0.5 * Math.sqrt(h2);
  return { u: Math.cos(ca) * cr + Math.cos(h3 * TAU) * r, v: Math.sin(ca) * cr + Math.sin(h3 * TAU) * r };
}

function placeGalaxyStars(galaxy: CosmosGalaxyModel, form: GalaxyForm): PlacedGalaxy {
  const clusters = placeClusters(galaxy, form);
  const ids = [galaxy.id];
  const u = [0];
  const v = [0];
  const kind = [STAR_KIND_NUCLEUS];
  const owner = [-1];
  const phase = hash01(galaxy.id, "arm-phase") * TAU;
  clusters.forEach((cluster, ci) => {
    ids.push(cluster.id);
    u.push(cluster.u);
    v.push(cluster.v);
    kind.push(STAR_KIND_CAPABILITY);
    owner.push(ci);
    for (const star of galaxy.clusters[ci]!.stars) {
      const r = cluster.radius * hash01(star, "cluster-r") ** 0.65;
      const a = hash01(star, "cluster-a") * TAU;
      ids.push(star);
      u.push(cluster.u + Math.cos(a) * r);
      v.push(cluster.v + Math.sin(a) * r);
      kind.push(STAR_KIND_ELEMENT);
      owner.push(ci);
    }
  });
  for (const star of galaxy.field) {
    const p = placeField(star, form, galaxy.id, phase);
    ids.push(star);
    u.push(p.u);
    v.push(p.v);
    kind.push(STAR_KIND_ELEMENT);
    owner.push(-1);
  }
  const px = Float64Array.from(u);
  const py = Float64Array.from(v);
  separatePoints(px, py, MIN_STAR_SPACING / form.tilt);
  for (let i = 0; i < px.length; i += 1) {
    if (kind[i] === STAR_KIND_ELEMENT) {
      u[i] = px[i]!;
      v[i] = py[i]!;
    }
  }
  return {
    clusters,
    ids,
    u: Float32Array.from(u),
    v: Float32Array.from(v),
    kind: Uint8Array.from(kind),
    cluster: Int32Array.from(owner),
    extent: u.reduce((max, uu, i) => Math.max(max, Math.hypot(uu, v[i]!)), form.radius * 0.3),
  };
}

const placements = new Map<string, PlacedGalaxy>();

function galaxyPlacementKey(galaxy: CosmosGalaxyModel): string {
  const clusters = galaxy.clusters.map((c) => `${c.id}:${c.stars.join(",")}`).join(";");
  return `${galaxy.id}|${galaxy.members}|${galaxy.cohesion.toFixed(6)}|${galaxy.concentration.toFixed(6)}|${clusters}|${galaxy.field.join(",")}`;
}

export function placeGalaxy(galaxy: CosmosGalaxyModel, form: GalaxyForm): { placed: PlacedGalaxy; fresh: boolean } {
  const key = galaxyPlacementKey(galaxy);
  const cached = placements.get(key);
  if (cached) {
    const clusters = cached.clusters.map((c, i) => ({ ...c, label: galaxy.clusters[i]!.label }));
    return { placed: { ...cached, clusters }, fresh: false };
  }
  const placed = placeGalaxyStars(galaxy, form);
  if (placements.size >= PLACEMENT_CACHE_LIMIT) placements.delete(placements.keys().next().value!);
  placements.set(key, placed);
  return { placed, fresh: true };
}

export function placeCore(model: CosmosModel, extraIds: readonly string[]): CosmosCore {
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
    const kind = model.kinds.get(id);
    ids.push(id);
    xs.push(Math.cos(a) * r);
    ys.push(Math.sin(a) * r * 0.86);
    kinds.push(kind === "capability" ? STAR_KIND_CAPABILITY : kind === "project" ? STAR_KIND_PROJECT : STAR_KIND_ELEMENT);
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
