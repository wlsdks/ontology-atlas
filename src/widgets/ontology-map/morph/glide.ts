import { SPRING, springSettleMs } from "@/shared/motion/spring";
import { STAGGER } from "@/shared/motion/tokens";

const ANCESTOR_WALK_DEPTH = 16;
const DISTANCE_CAP = 3;
const POLAR_FLOOR_PX = 2;
const WIDE_TURN = (150 * Math.PI) / 180;
const VELOCITY_PROBE_MS = 2;
const STAGGER_MS = STAGGER * 1000;
const STIFFNESS = SPRING.canvas.stiffness;
const ZETA = SPRING.canvas.dampingRatio;
const SETTLE_MS_AT_UNIT_MASS = springSettleMs(SPRING.canvas);

export interface GlideTracks {
  ids: readonly string[];
  x0: Float64Array;
  y0: Float64Array;
  x1: Float64Array;
  y1: Float64Array;
}

export interface GlideOptions {
  parentOf: ReadonlyMap<string, string>;
  anchorId?: string | null;
  massOf?: (id: string) => number;
  carried?: ReadonlyMap<string, { vx: number; vy: number }>;
}

export interface Glide {
  order: Int32Array;
  parent: Int32Array;
  distance: Int32Array;
  delayMs: Float64Array;
  omega: Float64Array;
  polar: Uint8Array;
  r0: Float64Array;
  r1: Float64Array;
  a0: Float64Array;
  turn: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  durationMs: number;
}

export interface GlideFrame {
  x: Float64Array;
  y: Float64Array;
  p: Float64Array;
}

const finite = (value: number) => (Number.isFinite(value) ? value : 0);

function treeParents(ids: readonly string[], parentOf: ReadonlyMap<string, string>): Int32Array {
  const index = new Map<string, number>();
  ids.forEach((id, i) => index.set(id, i));
  const parent = new Int32Array(ids.length).fill(-1);
  ids.forEach((id, i) => {
    let current = parentOf.get(id);
    for (let depth = 0; current !== undefined && depth < ANCESTOR_WALK_DEPTH; depth += 1) {
      const hit = index.get(current);
      if (hit !== undefined && hit !== i) {
        parent[i] = hit;
        return;
      }
      current = parentOf.get(current);
    }
  });
  return parent;
}

function reroot(ids: readonly string[], treeParent: Int32Array, anchorId: string | null) {
  const n = ids.length;
  const adjacency: number[][] = Array.from({ length: n }, () => []);
  const roots: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const p = treeParent[i]!;
    if (p < 0) roots.push(i);
    else {
      adjacency[i]!.push(p);
      adjacency[p]!.push(i);
    }
  }
  const parent = new Int32Array(n).fill(-1);
  const distance = new Int32Array(n).fill(-1);
  const order = new Int32Array(n);
  let written = 0;
  const walk = (start: number, startDistance: number) => {
    if (distance[start]! >= 0) return;
    distance[start] = startDistance;
    order[written++] = start;
    for (let head = written - 1; head < written; head += 1) {
      const at = order[head]!;
      for (const next of adjacency[at]!) {
        if (distance[next]! >= 0) continue;
        distance[next] = distance[at]! + 1;
        parent[next] = at;
        order[written++] = next;
      }
    }
  };
  const anchor = anchorId === null ? -1 : ids.indexOf(anchorId);
  if (anchor >= 0) walk(anchor, 0);
  else if (roots.length > 0) {
    const size = new Int32Array(n).fill(1);
    for (let i = 0; i < n; i += 1) {
      for (let p = treeParent[i]!, depth = 0; p >= 0 && depth < n; p = treeParent[p]!, depth += 1) size[p]! += 1;
    }
    walk(roots.reduce((best, root) => (size[root]! > size[best]! ? root : best)), 0);
  }
  for (const root of roots) walk(root, 1);
  for (let i = 0; i < n; i += 1) walk(i, 1);
  return { parent, distance, order };
}

const shortestTurn = (from: number, to: number) => {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
};

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values.length === 0 ? 0 : values[Math.floor(values.length / 2)]!;
}

export function planGlide(tracks: GlideTracks, options: GlideOptions): Glide {
  const { ids, x0, y0, x1, y1 } = tracks;
  const n = ids.length;
  const { parent, distance, order } = reroot(ids, treeParents(ids, options.parentOf), options.anchorId ?? null);
  const glide: Glide = {
    order,
    parent,
    distance,
    delayMs: new Float64Array(n),
    omega: new Float64Array(n),
    polar: new Uint8Array(n),
    r0: new Float64Array(n),
    r1: new Float64Array(n),
    a0: new Float64Array(n),
    turn: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    durationMs: n === 0 ? SETTLE_MS_AT_UNIT_MASS : 0,
  };
  const turnsByParent = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const mass = Math.min(2, Math.max(1, 1 + finite(options.massOf?.(ids[i]!) ?? 0)));
    glide.delayMs[i] = Math.min(DISTANCE_CAP, distance[i]!) * STAGGER_MS;
    glide.omega[i] = Math.sqrt(STIFFNESS / mass);
    glide.durationMs = Math.max(glide.durationMs, glide.delayMs[i]! + SETTLE_MS_AT_UNIT_MASS * Math.sqrt(mass));
    const carried = options.carried?.get(ids[i]!);
    glide.vx[i] = finite(carried?.vx ?? 0);
    glide.vy[i] = finite(carried?.vy ?? 0);
    const p = parent[i]!;
    if (p < 0) continue;
    const ox0 = x0[i]! - x0[p]!;
    const oy0 = y0[i]! - y0[p]!;
    const ox1 = x1[i]! - x1[p]!;
    const oy1 = y1[i]! - y1[p]!;
    const r0 = Math.hypot(ox0, oy0);
    const r1 = Math.hypot(ox1, oy1);
    if (!(Math.min(r0, r1) >= POLAR_FLOOR_PX)) continue;
    glide.polar[i] = 1;
    glide.r0[i] = r0;
    glide.r1[i] = r1;
    glide.a0[i] = Math.atan2(oy0, ox0);
    glide.turn[i] = shortestTurn(glide.a0[i]!, Math.atan2(oy1, ox1));
    const siblings = turnsByParent.get(p);
    if (siblings) siblings.push(glide.turn[i]!);
    else turnsByParent.set(p, [glide.turn[i]!]);
  }
  const senseOf = new Map<number, number>();
  for (const [p, turns] of turnsByParent) senseOf.set(p, Math.sign(median(turns)));
  for (let i = 0; i < n; i += 1) {
    const turn = glide.turn[i]!;
    if (!glide.polar[i] || Math.abs(turn) < WIDE_TURN) continue;
    const sense = senseOf.get(parent[i]!) ?? 0;
    if (sense > 0 && turn < 0) glide.turn[i] = turn + 2 * Math.PI;
    else if (sense < 0 && turn > 0) glide.turn[i] = turn - 2 * Math.PI;
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    const at = order[i]!;
    const p = parent[at]!;
    if (p < 0) continue;
    glide.vx[at] = glide.vx[at]! - glide.vx[p]!;
    glide.vy[at] = glide.vy[at]! - glide.vy[p]!;
  }
  return glide;
}

function springStep(omega: number, tSec: number): number {
  if (tSec <= 0) return 0;
  const wd = omega * Math.sqrt(1 - ZETA * ZETA);
  const decay = Math.exp(-ZETA * omega * tSec);
  return 1 - decay * (Math.cos(wd * tSec) + ((ZETA * omega) / wd) * Math.sin(wd * tSec));
}

function springImpulse(omega: number, tSec: number): number {
  if (tSec <= 0) return 0;
  const wd = omega * Math.sqrt(1 - ZETA * ZETA);
  return (Math.exp(-ZETA * omega * tSec) * Math.sin(wd * tSec)) / wd;
}

export function createGlideFrame(n: number): GlideFrame {
  return { x: new Float64Array(n), y: new Float64Array(n), p: new Float64Array(n) };
}

export function sampleGlide(glide: Glide, tracks: GlideTracks, atMs: number, frame: GlideFrame = createGlideFrame(tracks.ids.length)): GlideFrame {
  const { x0, y0, x1, y1 } = tracks;
  const t = Math.max(0, finite(atMs));
  const tSec = t / 1000;
  for (let k = 0; k < glide.order.length; k += 1) {
    const i = glide.order[k]!;
    const omega = glide.omega[i]!;
    const p = springStep(omega, (t - glide.delayMs[i]!) / 1000);
    const carry = springImpulse(omega, tSec);
    frame.p[i] = p;
    const parent = glide.parent[i]!;
    let x: number;
    let y: number;
    if (parent < 0) {
      x = x0[i]! + (x1[i]! - x0[i]!) * p;
      y = y0[i]! + (y1[i]! - y0[i]!) * p;
    } else if (glide.polar[i]) {
      const r = glide.r0[i]! + (glide.r1[i]! - glide.r0[i]!) * p;
      const a = glide.a0[i]! + glide.turn[i]! * p;
      x = frame.x[parent]! + r * Math.cos(a);
      y = frame.y[parent]! + r * Math.sin(a);
    } else {
      const ox0 = x0[i]! - x0[parent]!;
      const oy0 = y0[i]! - y0[parent]!;
      x = frame.x[parent]! + ox0 + (x1[i]! - x1[parent]! - ox0) * p;
      y = frame.y[parent]! + oy0 + (y1[i]! - y1[parent]! - oy0) * p;
    }
    frame.x[i] = x + glide.vx[i]! * carry;
    frame.y[i] = y + glide.vy[i]! * carry;
  }
  return frame;
}

export function glideVelocity(glide: Glide, tracks: GlideTracks, atMs: number): Map<string, { vx: number; vy: number }> {
  const n = tracks.ids.length;
  const later = sampleGlide(glide, tracks, atMs);
  const earlier = sampleGlide(glide, tracks, Math.max(0, atMs - VELOCITY_PROBE_MS));
  const span = (Math.max(0, atMs) - Math.max(0, atMs - VELOCITY_PROBE_MS)) / 1000;
  const velocity = new Map<string, { vx: number; vy: number }>();
  for (let i = 0; i < n; i += 1) {
    velocity.set(tracks.ids[i]!, span > 0 ? { vx: (later.x[i]! - earlier.x[i]!) / span, vy: (later.y[i]! - earlier.y[i]!) / span } : { vx: 0, vy: 0 });
  }
  return velocity;
}

export function conceptDegrees(edges: readonly { source: string; target: string }[]): ReadonlyMap<string, number> {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}
