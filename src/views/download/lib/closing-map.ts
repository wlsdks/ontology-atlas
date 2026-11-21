import type { FilmScene } from './film/film-scene';

/**
 * The closing map's geometry: the containment tree drawn as curves that leave each container
 * outward, and every other relation bundled along that tree (Holten's hierarchical edge
 * bundling), so relations gather into a few strands through their shared containers instead of
 * cutting across clusters. Everything is sampled once per layout into flat arrays, so a frame
 * only reads numbers.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Route {
  from: number;
  to: number;
  xy: Float32Array;
  len: Float32Array;
}

export const BUNDLE_BETA = 0.82;
const SAMPLES_PER_SEGMENT = 10;

function ancestry(scene: FilmScene, i: number): number[] {
  const out = [i];
  let at = i;
  for (let guard = 0; guard < 16; guard += 1) {
    const up = scene.nodes[at]!.parent;
    if (up === at) break;
    out.push(up);
    at = up;
  }
  return out;
}

export function treePath(scene: FilmScene, a: number, b: number): number[] {
  const up = ancestry(scene, a);
  const down = ancestry(scene, b);
  const shared = new Set(down);
  const meet = up.findIndex((i) => shared.has(i));
  if (meet < 0) return [a, b];
  const tail = down.slice(0, down.indexOf(up[meet]!)).reverse();
  return [...up.slice(0, meet + 1), ...tail];
}

function sampleQuad(out: number[], a: Point, c: Point, b: Point, skipFirst: boolean) {
  for (let k = skipFirst ? 1 : 0; k <= SAMPLES_PER_SEGMENT; k += 1) {
    const t = k / SAMPLES_PER_SEGMENT;
    const u = 1 - t;
    out.push(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y);
  }
}

function toRoute(from: number, to: number, flat: number[]): Route {
  const xy = new Float32Array(flat);
  const len = new Float32Array(xy.length / 2);
  for (let k = 1; k < len.length; k += 1) {
    len[k] = len[k - 1]! + Math.hypot(xy[k * 2]! - xy[k * 2 - 2]!, xy[k * 2 + 1]! - xy[k * 2 - 1]!);
  }
  return { from, to, xy, len };
}

/**
 * A smooth route through `points`, straightened toward the chord by `1 - beta`: a quadratic
 * through each midpoint, which passes near every container without kinking at any.
 */
export function bundleRoute(from: number, to: number, points: readonly Point[], beta = BUNDLE_BETA): Route {
  const n = points.length - 1;
  const a = points[0]!;
  const b = points[n]!;
  const p = points.map((q, k) => ({
    x: beta * q.x + (1 - beta) * (a.x + ((b.x - a.x) * k) / Math.max(1, n)),
    y: beta * q.y + (1 - beta) * (a.y + ((b.y - a.y) * k) / Math.max(1, n)),
  }));
  const flat: number[] = [];
  if (n <= 1) {
    sampleQuad(flat, a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b, false);
    return toRoute(from, to, flat);
  }
  const mid = (k: number) => ({ x: (p[k]!.x + p[k + 1]!.x) / 2, y: (p[k]!.y + p[k + 1]!.y) / 2 });
  for (let k = 1; k < n; k += 1) {
    const start = k === 1 ? p[0]! : mid(k - 1);
    const end = k === n - 1 ? p[n]! : mid(k);
    sampleQuad(flat, start, p[k]!, end, k > 1);
  }
  return toRoute(from, to, flat);
}

export function branchRoute(child: number, parent: number, at: readonly Point[], hub: Point, bend = 0.42): Route {
  const a = at[parent]!;
  const b = at[child]!;
  const ox = a.x - hub.x;
  const oy = a.y - hub.y;
  const n = Math.hypot(ox, oy);
  const reach = Math.hypot(b.x - a.x, b.y - a.y) * bend;
  const c = n < 1 ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: a.x + (ox / n) * reach, y: a.y + (oy / n) * reach };
  const flat: number[] = [];
  sampleQuad(flat, a, c, b, false);
  return toRoute(parent, child, flat);
}

export function pointAlong(route: Route, t: number, out: Point): Point {
  const total = route.len[route.len.length - 1]!;
  const want = Math.min(1, Math.max(0, t)) * total;
  let k = 1;
  while (k < route.len.length - 1 && route.len[k]! < want) k += 1;
  const l0 = route.len[k - 1]!;
  const span = route.len[k]! - l0 || 1;
  const f = Math.min(1, Math.max(0, (want - l0) / span));
  out.x = route.xy[k * 2 - 2]! + (route.xy[k * 2]! - route.xy[k * 2 - 2]!) * f;
  out.y = route.xy[k * 2 - 1]! + (route.xy[k * 2 + 1]! - route.xy[k * 2 - 1]!) * f;
  return out;
}

export function traceRoute(ctx: CanvasRenderingContext2D, route: Route, t0: number, t1: number, scratch: Point): void {
  if (t1 <= t0) return;
  const total = route.len[route.len.length - 1]!;
  const lo = t0 * total;
  const hi = t1 * total;
  pointAlong(route, t0, scratch);
  ctx.moveTo(scratch.x, scratch.y);
  for (let k = 1; k < route.len.length; k += 1) {
    const l = route.len[k]!;
    if (l <= lo) continue;
    if (l >= hi) break;
    ctx.lineTo(route.xy[k * 2]!, route.xy[k * 2 + 1]!);
  }
  pointAlong(route, t1, scratch);
  ctx.lineTo(scratch.x, scratch.y);
}

export function bundledRelations(scene: FilmScene): { from: number; to: number; path: number[]; crosses: boolean }[] {
  const seen = new Set<string>();
  const out: { from: number; to: number; path: number[]; crosses: boolean }[] = [];
  for (const edge of scene.edges) {
    const { from, to } = edge;
    if (from === to) continue;
    if (scene.nodes[to]!.parent === from || scene.nodes[from]!.parent === to) continue;
    const key = from < to ? `${from}:${to}` : `${to}:${from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const path = treePath(scene, from, to);
    if (path.length < 3) continue;
    out.push({ from, to, path, crosses: scene.nodes[from]!.cluster !== scene.nodes[to]!.cluster });
  }
  return out;
}
