/**
 * The hex board's **lattice router** (spec §4). Routes never cross a tile — not by a check made
 * afterwards, but because the graph they are searched on has no edge over an occupied face.
 *
 * Nodes (unit space, cell circumradius 1):
 * - hex vertices — the gutter lattice between faces;
 * - centres of **empty** cells — the moat;
 * - face-edge midpoints of occupied cells — terminals, open only to the route that starts or
 *   ends on that tile.
 *
 * Edges (cost = length × weight): seams along cell edges (1.0 in the moat, 1.05 beside a tile,
 * 1.35 in the gutter between two tiles); empty centre ↔ its vertices (1.0); empty centre ↔ empty
 * neighbour centre (0.85, straight runs through the moat); terminal ↔ empty neighbour centre
 * (0.75, a perpendicular arrival); terminal ↔ its own edge's vertices (1.9, tangential; 5.0 when
 * the edge is shared with another tile).
 *
 * Search is Dijkstra from a set of terminals to a set of terminals. Routes drawn in one pass
 * share a `use` ledger: an edge already used by the same bundle costs ×0.5, so arrows into one
 * region share a trunk; by another bundle ×`otherPenalty`, so unrelated flows spread out.
 *
 * Everything is scale-free: every node sits at a fixed multiple of the cell radius, so the
 * lattice is built once per board and drawn at any R.
 */

import { axialToUnit, hexKey, HEX_NEIGHBORS, SQRT3 } from "./hex-grid";
import type { HexBoardLayout } from "./hex-board";

type NodeKind = "v" | "c" | "m";

export interface HexLattice {
  xs: Float64Array;
  ys: Float64Array;
  kind: NodeKind[];
  /** Adjacency: [neighbour, cost, edge id]. */
  adj: [number, number, number][][];
  /** Terminal node → the tile ids whose edge it sits on (two on a shared seam). */
  terminalOwners: (string[] | null)[];
  /** Tile id → its six terminal nodes. */
  terminalsOf: Map<string, number[]>;
  edgeCount: number;
  buildMs: number;
}

export interface HexRoute {
  /** Node indices, source terminal first. */
  nodes: readonly number[];
  /** Unit-space polyline. */
  points: { x: number; y: number }[];
  /** The tile the route arrives at (the arrival notch points into it). */
  targetId: string;
  sourceId: string;
}

const APO = SQRT3 / 2;

/**
 * Build the lattice over the board plus a margin of `pad` rings, so a route may run round the
 * board's edge when that is the only way.
 */
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

  // The window: every cell within `pad` rings of an occupied one.
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

/** A binary min-heap over (cost, node). */
class Heap {
  private d: number[] = [];
  private n: number[] = [];
  get size() {
    return this.d.length;
  }
  push(cost: number, id: number) {
    const d = this.d;
    const n = this.n;
    d.push(cost);
    n.push(id);
    let k = d.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (d[p]! <= d[k]!) break;
      [d[p], d[k]] = [d[k]!, d[p]!];
      [n[p], n[k]] = [n[k]!, n[p]!];
      k = p;
    }
  }
  pop(): [number, number] {
    const d = this.d;
    const n = this.n;
    const top: [number, number] = [d[0]!, n[0]!];
    const ld = d.pop()!;
    const ln = n.pop()!;
    if (d.length) {
      d[0] = ld;
      n[0] = ln;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < d.length && d[l]! < d[m]!) m = l;
        if (r < d.length && d[r]! < d[m]!) m = r;
        if (m === k) break;
        [d[m], d[k]] = [d[k]!, d[m]!];
        [n[m], n[k]] = [n[k]!, n[m]!];
        k = m;
      }
    }
    return top;
  }
}

/**
 * One routing pass: routes share its ledger, so later routes bundle with (or spread away from)
 * earlier ones. Build one per drawn state, not per frame.
 */
export class HexRouter {
  private use = new Map<number, Map<string, number>>();
  constructor(
    readonly lattice: HexLattice,
    private otherPenalty = 1.15,
  ) {}

  private search(src: ReadonlySet<number>, dst: ReadonlySet<number>, bundle: string): number[] | null {
    const L = this.lattice;
    const n = L.xs.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const heap = new Heap();
    for (const i of src) {
      dist[i] = 0;
      heap.push(0, i);
    }
    while (heap.size) {
      const [d, u] = heap.pop();
      if (d > dist[u]!) continue;
      if (dst.has(u)) {
        const path: number[] = [];
        for (let v = u; v !== -1; v = prev[v]!) path.push(v);
        return path.reverse();
      }
      for (const [v, w, e] of L.adj[u]!) {
        // Other tiles' terminals are closed: a route never touches a tile it does not serve.
        if (L.kind[v] === "m" && !dst.has(v) && !src.has(v)) continue;
        const used = this.use.get(e);
        let m = 1;
        if (used) m = used.has(bundle) ? 0.5 : this.otherPenalty;
        const nd = d + w * m;
        if (nd < dist[v]!) {
          dist[v] = nd;
          prev[v] = u;
          heap.push(nd, v);
        }
      }
    }
    return null;
  }

  private record(path: readonly number[], bundle: string) {
    const L = this.lattice;
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const e = L.adj[a]!.find(([v]) => v === b)?.[2];
      if (e === undefined) continue;
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

  /** From any of `from`'s tiles to any of `to`'s. */
  route(from: Iterable<string>, to: Iterable<string>, bundle: string): HexRoute | null {
    const fromIds = new Set(from);
    const toIds = new Set(to);
    const dst = this.terminals(toIds);
    // A seam two neighbours share is an arrival, never a departure: leaving from it would be
    // a route of no length and no direction.
    const src = new Set([...this.terminals(fromIds)].filter((t) => !dst.has(t)));
    if (!src.size || !dst.size) return null;
    const path = this.search(src, dst, bundle);
    if (!path || path.length < 2) return null;
    this.record(path, bundle);
    const L = this.lattice;
    return {
      nodes: path,
      points: path.map((i) => ({ x: L.xs[i]!, y: L.ys[i]! })),
      sourceId: L.terminalOwners[path[0]!]?.find((id) => fromIds.has(id)) ?? "",
      targetId: L.terminalOwners[path[path.length - 1]!]?.find((id) => toIds.has(id)) ?? "",
    };
  }
}

/**
 * Where a count pill sits on a canal (spec §4): on a moat centre, or a vertex touching at most
 * one tile, as near the route's middle as possible and at least `minGap` (unit space) from any
 * pill already placed.
 */
export function pickPillSpot(
  layout: HexBoardLayout,
  lattice: HexLattice,
  route: Pick<HexRoute, "nodes">,
  placed: readonly { x: number; y: number }[],
  minGap: number,
  /** The pill's half-extent over R: no part of the pill may sit over a tile's face. */
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
    // Moat centres first, then vertices; nearest the middle of the route within each.
    .sort((a, b) => Number(a.k !== "c") - Number(b.k !== "c") || Math.abs(a.i - mid) - Math.abs(b.i - mid) || a.i - b.i);
  for (const { id } of cands) {
    const x = lattice.xs[id]!;
    const y = lattice.ys[id]!;
    if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= minGap)) return { x, y };
  }
  return null;
}
