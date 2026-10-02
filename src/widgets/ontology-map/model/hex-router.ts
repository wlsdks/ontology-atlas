/**
 * The hex board's lattice router (spec §4). Routes never cross a tile because the search
 * graph has no edge over an occupied face. Nodes: hex vertices (the gutter), empty cell
 * centres (the moat), and occupied cells' edge midpoints (terminals open only to their own
 * route). Edge cost is length × weight: seams 1.0 in the moat, 1.05 beside a tile, 1.35
 * between tiles; empty centre ↔ vertices 1.0, ↔ empty neighbour 0.85; terminal ↔ empty
 * neighbour 0.75, ↔ own vertices 1.9 (5.0 on a shared edge). Multi-source Dijkstra on a
 * binary heap, O((V + E) log V). A shared ledger makes same-bundle edges cost ×0.5 and
 * other-bundle edges ×`otherPenalty`. Scale-free: built once per board.
 */

import { axialToUnit, hexKey, HEX_NEIGHBORS, SQRT3 } from "./hex-grid";
import type { HexBoardLayout } from "./hex-board";

type NodeKind = "v" | "c" | "m";

export interface HexLattice {
  xs: Float64Array;
  ys: Float64Array;
  kind: NodeKind[];
  /** [neighbour, cost, edge id] */
  adj: [number, number, number][][];
  /** Two tiles on a shared seam. */
  terminalOwners: (string[] | null)[];
  terminalsOf: Map<string, number[]>;
  edgeCount: number;
  buildMs: number;
}

export interface HexRoute {
  /** Source terminal first. */
  nodes: readonly number[];
  points: { x: number; y: number }[];
  /** The arrival notch points into it. */
  targetId: string;
  sourceId: string;
  /**
   * The open lattice had no way to the target, so this runs as far toward it as it can; drawn
   * as a stub pointing at the target, never as an arrival.
   */
  stub?: boolean;
}

/**
 * Keeps routes out of the chrome: a closed node is never entered, and a tile whose every
 * terminal is closed can neither send nor receive.
 */
export function closedNodes(lattice: HexLattice, open: (x: number, y: number) => boolean): Uint8Array {
  const n = lattice.xs.length;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) if (!open(lattice.xs[i]!, lattice.ys[i]!)) out[i] = 1;
  return out;
}

const APO = SQRT3 / 2;

/** The margin lets a route run round the board's edge when that is the only way. */
export function buildHexLattice(layout: HexBoardLayout, pad = 2): HexLattice {
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const xs: number[] = [];
  const ys: number[] = [];
  const kind: NodeKind[] = [];
  const adj: [number, number, number][][] = [];
  const terminalOwners: (string[] | null)[] = [];
  const ids = new Map<string, number>();
  const edgeSeen = new Set<string>();
  let edgeCount = 0;
  const node = (x: number, y: number, k: NodeKind): number => {
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)}${k === "v" ? "" : k}`;
    let i = ids.get(key);
    if (i === undefined) {
      i = xs.length;
      ids.set(key, i);
      xs.push(x);
      ys.push(y);
      kind.push(k);
      adj.push([]);
      terminalOwners.push(null);
    }
    return i;
  };
  const link = (a: number, b: number, w: number) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    const L = Math.hypot(xs[a]! - xs[b]!, ys[a]! - ys[b]!);
    const id = edgeCount++;
    adj[a]!.push([b, L * w, id]);
    adj[b]!.push([a, L * w, id]);
  };

  let qMin = Infinity;
  let qMax = -Infinity;
  let rMin = Infinity;
  let rMax = -Infinity;
  for (const t of layout.tiles) {
    qMin = Math.min(qMin, t.q);
    qMax = Math.max(qMax, t.q);
    rMin = Math.min(rMin, t.r);
    rMax = Math.max(rMax, t.r);
  }
  const occ = layout.occupied;
  const inWindow = (q: number, r: number) => q >= qMin - pad && q <= qMax + pad && r >= rMin - pad && r <= rMax + pad;
  const terminalsOf = new Map<string, number[]>();

  for (let q = qMin - pad; q <= qMax + pad; q += 1) {
    for (let r = rMin - pad; r <= rMax + pad; r += 1) {
      const here = occ.get(hexKey(q, r)) ?? null;
      const { x, y } = axialToUnit(q, r);
      const V = Array.from({ length: 6 }, (_, i) => node(x + Math.cos((i * Math.PI) / 3), y + Math.sin((i * Math.PI) / 3), "v"));
      HEX_NEIGHBORS.forEach(([dq, dr], i) => {
        const nq = q + dq;
        const nr = r + dr;
        const there = occ.get(hexKey(nq, nr)) ?? null;
        const nOcc = (here ? 1 : 0) + (there ? 1 : 0);
        link(V[i]!, V[(i + 1) % 6]!, nOcc === 0 ? 1.0 : nOcc === 1 ? 1.05 : 1.35);
        if (here) {
          const a = ((i + 0.5) * Math.PI) / 3;
          const m = node(x + APO * Math.cos(a), y + APO * Math.sin(a), "m");
          const owners = (terminalOwners[m] ??= []);
          if (!owners.includes(here)) owners.push(here);
          const list = terminalsOf.get(here);
          if (list) {
            if (!list.includes(m)) list.push(m);
          } else terminalsOf.set(here, [m]);
          const wm = there ? 5 : 1.9;
          link(m, V[i]!, wm);
          link(m, V[(i + 1) % 6]!, wm);
          if (!there && inWindow(nq, nr)) {
            const c = axialToUnit(nq, nr);
            link(m, node(c.x, c.y, "c"), 0.75);
          }
        }
      });
      if (!here) {
        const c = node(x, y, "c");
        for (const v of V) link(c, v, 1.0);
        for (const [dq, dr] of HEX_NEIGHBORS) {
          const nq = q + dq;
          const nr = r + dr;
          if (!occ.has(hexKey(nq, nr)) && inWindow(nq, nr)) {
            const n = axialToUnit(nq, nr);
            link(c, node(n.x, n.y, "c"), 0.85);
          }
        }
      }
    }
  }
  const t1 = typeof performance !== "undefined" ? performance.now() : 0;
  return {
    xs: Float64Array.from(xs),
    ys: Float64Array.from(ys),
    kind,
    adj,
    terminalOwners,
    terminalsOf,
    edgeCount,
    buildMs: t1 - t0,
  };
}

interface Csr {
  start: Int32Array;
  to: Int32Array;
  cost: Float64Array;
  edge: Int32Array;
  terminal: Uint8Array;
}

interface Scratch {
  stamp: number;
  seen: Uint32Array;
  dist: Float64Array;
  prev: Int32Array;
  src: Uint32Array;
  dst: Uint32Array;
  heapCost: Float64Array;
  heapNode: Int32Array;
}

const csrs = new WeakMap<HexLattice, Csr>();
const scratches = new WeakMap<HexLattice, Scratch>();

function csrOf(L: HexLattice): Csr {
  let csr = csrs.get(L);
  if (csr) return csr;
  const n = L.adj.length;
  const start = new Int32Array(n + 1);
  for (let i = 0; i < n; i += 1) start[i + 1] = start[i]! + L.adj[i]!.length;
  const to = new Int32Array(start[n]!);
  const cost = new Float64Array(start[n]!);
  const edge = new Int32Array(start[n]!);
  const terminal = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (L.kind[i] === "m") terminal[i] = 1;
    let k = start[i]!;
    for (const [v, w, e] of L.adj[i]!) {
      to[k] = v;
      cost[k] = w;
      edge[k] = e;
      k += 1;
    }
  }
  csr = { start, to, cost, edge, terminal };
  csrs.set(L, csr);
  return csr;
}

function scratchOf(L: HexLattice): Scratch {
  let s = scratches.get(L);
  if (!s) {
    const n = L.xs.length;
    s = {
      stamp: 0,
      seen: new Uint32Array(n),
      dist: new Float64Array(n),
      prev: new Int32Array(n),
      src: new Uint32Array(n),
      dst: new Uint32Array(n),
      heapCost: new Float64Array(1024),
      heapNode: new Int32Array(1024),
    };
    scratches.set(L, s);
  }
  s.stamp += 1;
  return s;
}

/** Routes share one ledger, so build one per drawn state, not per frame. */
export class HexRouter {
  private use = new Map<number, Map<string, number>>();
  private used: Uint8Array | null = null;
  constructor(
    readonly lattice: HexLattice,
    private otherPenalty = 1.15,
    /**
     * The padding rings can lie under the toolbar, INDEX, inspector or legend on screen;
     * without closing them the cheapest way round ran under the toolbar.
     */
    private readonly blocked: Uint8Array | null = null,
  ) {}

  private search(
    src: ReadonlySet<number>,
    dst: ReadonlySet<number>,
    bundle: string,
    /** When the target is unreachable, the reached node nearest this point. */
    toward?: { x: number; y: number },
  ): { path: number[]; stub: boolean } | null {
    const L = this.lattice;
    const { start, to, cost, edge, terminal } = csrOf(L);
    const s = scratchOf(L);
    const stamp = s.stamp;
    const { seen, dist, prev } = s;
    const inSrc = s.src;
    const inDst = s.dst;
    for (const i of dst) inDst[i] = stamp;
    for (const i of src) inSrc[i] = stamp;
    let heapCost = s.heapCost;
    let heapNode = s.heapNode;
    let size = 0;
    const push = (c: number, id: number) => {
      if (size === heapCost.length) {
        const nextCost = new Float64Array(size * 2);
        const nextNode = new Int32Array(size * 2);
        nextCost.set(heapCost);
        nextNode.set(heapNode);
        s.heapCost = heapCost = nextCost;
        s.heapNode = heapNode = nextNode;
      }
      let k = size;
      size += 1;
      heapCost[k] = c;
      heapNode[k] = id;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapCost[p]! <= heapCost[k]!) break;
        const pc = heapCost[p]!;
        heapCost[p] = heapCost[k]!;
        heapCost[k] = pc;
        const pn = heapNode[p]!;
        heapNode[p] = heapNode[k]!;
        heapNode[k] = pn;
        k = p;
      }
    };
    for (const i of src) {
      seen[i] = stamp;
      dist[i] = 0;
      prev[i] = -1;
      push(0, i);
    }
    const blocked = this.blocked;
    const used = this.used;
    const walk = (end: number) => {
      const path: number[] = [];
      for (let v = end; v !== -1; v = prev[v]!) path.push(v);
      return path.reverse();
    };
    let best = -1;
    let bestD = Infinity;
    while (size > 0) {
      const d = heapCost[0]!;
      const u = heapNode[0]!;
      size -= 1;
      if (size > 0) {
        heapCost[0] = heapCost[size]!;
        heapNode[0] = heapNode[size]!;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < size && heapCost[l]! < heapCost[m]!) m = l;
          if (r < size && heapCost[r]! < heapCost[m]!) m = r;
          if (m === k) break;
          const mc = heapCost[m]!;
          heapCost[m] = heapCost[k]!;
          heapCost[k] = mc;
          const mn = heapNode[m]!;
          heapNode[m] = heapNode[k]!;
          heapNode[k] = mn;
          k = m;
        }
      }
      if (d > dist[u]!) continue;
      if (inDst[u] === stamp) return { path: walk(u), stub: false };
      if (toward && !terminal[u]) {
        const h = Math.hypot(L.xs[u]! - toward.x, L.ys[u]! - toward.y);
        if (h < bestD) {
          bestD = h;
          best = u;
        }
      }
      for (let k = start[u]!, end = start[u + 1]!; k < end; k += 1) {
        const v = to[k]!;
        if (blocked && blocked[v]) continue;
        // A route never touches a tile it does not serve.
        if (terminal[v] && inDst[v] !== stamp && inSrc[v] !== stamp) continue;
        let m = 1;
        if (used && used[edge[k]!]) m = this.use.get(edge[k]!)!.has(bundle) ? 0.5 : this.otherPenalty;
        const nd = d + cost[k]! * m;
        if (seen[v] !== stamp || nd < dist[v]!) {
          seen[v] = stamp;
          dist[v] = nd;
          prev[v] = u;
          push(nd, v);
        }
      }
    }
    if (best === -1) return null;
    return { path: walk(best), stub: true };
  }

  private record(path: readonly number[], bundle: string) {
    const { start, to, edge } = csrOf(this.lattice);
    const used = (this.used ??= new Uint8Array(this.lattice.edgeCount));
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      let e = -1;
      for (let k = start[a]!, end = start[a + 1]!; k < end; k += 1) {
        if (to[k] === b) {
          e = edge[k]!;
          break;
        }
      }
      if (e === -1) continue;
      used[e] = 1;
      let m = this.use.get(e);
      if (!m) this.use.set(e, (m = new Map()));
      m.set(bundle, (m.get(bundle) ?? 0) + 1);
    }
  }

  private terminals(ids: Iterable<string>): Set<number> {
    const out = new Set<number>();
    for (const id of ids) for (const t of this.lattice.terminalsOf.get(id) ?? []) out.add(t);
    return out;
  }

  route(from: Iterable<string>, to: Iterable<string>, bundle: string): HexRoute | null {
    const fromIds = new Set(from);
    const toIds = new Set(to);
    const blocked = this.blocked;
    const L = this.lattice;
    const allDst = this.terminals(toIds);
    const dst = new Set([...allDst].filter((t) => !blocked?.[t]));
    // A seam two neighbours share is an arrival, never a departure, or the route has no length.
    const src = new Set([...this.terminals(fromIds)].filter((t) => !allDst.has(t) && !blocked?.[t]));
    if (!src.size || !allDst.size) return null;
    let tx = 0;
    let ty = 0;
    for (const t of allDst) {
      tx += L.xs[t]!;
      ty += L.ys[t]!;
    }
    const toward = { x: tx / allDst.size, y: ty / allDst.size };
    const found = this.search(src, dst, bundle, toward);
    if (!found || found.path.length < 2) return null;
    const { path, stub } = found;
    if (stub) {
      // A stub must end at least one cell radius nearer the target than it started.
      const start = path[0]!;
      const end = path[path.length - 1]!;
      const d0 = Math.hypot(L.xs[start]! - toward.x, L.ys[start]! - toward.y);
      const d1 = Math.hypot(L.xs[end]! - toward.x, L.ys[end]! - toward.y);
      if (path.length < 3 || d0 - d1 < 1) return null;
    }
    this.record(path, bundle);
    return {
      nodes: path,
      points: path.map((i) => ({ x: L.xs[i]!, y: L.ys[i]! })),
      sourceId: L.terminalOwners[path[0]!]?.find((id) => fromIds.has(id)) ?? "",
      targetId: stub ? ([...toIds][0] ?? "") : (L.terminalOwners[path[path.length - 1]!]?.find((id) => toIds.has(id)) ?? ""),
      ...(stub ? { stub: true } : {}),
    };
  }
}

export function layCanals(
  layout: HexBoardLayout,
  lattice: HexLattice,
  blocked: Uint8Array | null,
  limit: number,
): (HexRoute & { count: number; twoWay: boolean })[] {
  const router = new HexRouter(lattice, 1.8, blocked);
  const regionById = new Map(layout.regions.map((r) => [r.domainId, r] as const));
  const out: (HexRoute & { count: number; twoWay: boolean })[] = [];
  for (const canal of layout.canals) {
    if (out.length >= limit) break;
    const a = regionById.get(canal.fromDomain);
    const b = regionById.get(canal.toDomain);
    if (!a || !b) continue;
    const route = router.route([a.domainId, ...a.capabilityIds], [b.domainId, ...b.capabilityIds], `${a.domainId}>${b.domainId}`);
    if (route) out.push({ ...route, count: canal.count, twoWay: canal.twoWay });
  }
  return out;
}

export interface HexRouteJob<Role extends string = string> {
  from: readonly string[];
  to: readonly string[];
  bundle: string;
  role: Role;
}

export class HexRouteRun<Role extends string = string> {
  readonly routes: (HexRoute & { role: Role })[] = [];
  private next = 0;
  private readonly router: HexRouter;
  constructor(
    lattice: HexLattice,
    readonly jobs: readonly HexRouteJob<Role>[],
    otherPenalty: number,
    blocked: Uint8Array | null,
  ) {
    this.router = new HexRouter(lattice, otherPenalty, blocked);
  }

  get done(): boolean {
    return this.next >= this.jobs.length;
  }

  advance(deadline: number, clock: () => number = () => performance.now()): boolean {
    while (this.next < this.jobs.length) {
      const job = this.jobs[this.next]!;
      this.next += 1;
      const route = this.router.route(job.from, job.to, job.bundle);
      if (route) this.routes.push({ ...route, role: job.role });
      if (clock() >= deadline) break;
    }
    return this.done;
  }
}

/**
 * On a moat centre or a vertex touching at most one tile, near the route's middle and at
 * least `minGap` from any placed pill.
 */
export function pickPillSpot(
  layout: HexBoardLayout,
  lattice: HexLattice,
  route: Pick<HexRoute, "nodes">,
  placed: readonly { x: number; y: number }[],
  minGap: number,
  /** No part of the pill may sit over a tile's face. */
  clearance = 0,
): { x: number; y: number } | null {
  const nearest = (x: number, y: number) => {
    let d = Infinity;
    let n = 0;
    for (const t of layout.tiles) {
      const h = Math.hypot(t.x - x, t.y - y);
      d = Math.min(d, h);
      if (h < 1.02) n += 1;
    }
    return { d, n };
  };
  const mid = (route.nodes.length - 1) / 2;
  const cands = route.nodes
    .map((id, i) => ({ id, i, k: lattice.kind[id] }))
    .filter(({ id, k }) => {
      if (k !== "c" && k !== "v") return false;
      const { d, n } = nearest(lattice.xs[id]!, lattice.ys[id]!);
      if (k === "v" && n > 1) return false;
      return d >= SQRT3 / 2 + clearance;
    })
    .sort((a, b) => Number(a.k !== "c") - Number(b.k !== "c") || Math.abs(a.i - mid) - Math.abs(b.i - mid) || a.i - b.i);
  for (const { id } of cands) {
    const x = lattice.xs[id]!;
    const y = lattice.ys[id]!;
    if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= minGap)) return { x, y };
  }
  return null;
}
