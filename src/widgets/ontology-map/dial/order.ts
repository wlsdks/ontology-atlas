import type { DialModel } from "./dial-shapes";

const EXHAUSTIVE_MAX = 9;
const HYSTERESIS = 1.1;
const RELATES_WEIGHT = 0.5;
const EPS = 1e-9;
/** Slot and pair terms the local search may evaluate per domain and pair of its input, so its work is linear in n + P. */
const SEARCH_WORK_PER_INPUT = 256;
/** Terms every search may spend, so a sparse ring of 80 domains still converges; 120 domains cost about 40 ms. */
const SEARCH_WORK_FLOOR = 1 << 22;
/** Subspace iterations of the spectral seed; 80 dense domains settle their ring cost by 100. */
const SPECTRAL_ITERATIONS = 100;

/** `work` counts slot and pair terms evaluated, the unit every bound below is stated in. */
export interface DialOrder { order: string[]; work: number }

let remembered: readonly string[] | null = null;
let rememberedFolder: string | null = null;

export function rememberDialOrder(order: readonly string[]): void {
  remembered = [...order];
}

export function claimDialOrderFolder(folder: string): void {
  if (rememberedFolder !== null && rememberedFolder !== folder) remembered = null;
  rememberedFolder = folder;
}

export function rememberedDialOrder(): readonly string[] | null {
  return remembered;
}

/** Domain pairs as a symmetric weighted adjacency list (CSR); duplicate pairs merge. O(n + P). */
export interface Adjacency { n: number; pairs: number; start: Int32Array; to: Int32Array; weight: Float64Array }

export function adjacencyOf(n: number, raw: readonly { i: number; j: number; w: number }[]): Adjacency {
  const merged = new Map<number, number>();
  for (const { i, j, w } of raw) {
    if (i === j) continue;
    const key = i < j ? i * n + j : j * n + i;
    merged.set(key, (merged.get(key) ?? 0) + w);
  }
  const degree = new Int32Array(n + 1);
  for (const key of merged.keys()) {
    degree[Math.floor(key / n)]! += 1;
    degree[key % n]! += 1;
  }
  const start = new Int32Array(n + 1);
  for (let k = 0; k < n; k += 1) start[k + 1] = start[k]! + degree[k]!;
  const fill = start.slice(0, n);
  const to = new Int32Array(start[n]!);
  const weight = new Float64Array(start[n]!);
  for (const key of [...merged.keys()].sort((x, y) => x - y)) {
    const i = Math.floor(key / n);
    const j = key % n;
    const w = merged.get(key)!;
    to[fill[i]!] = j;
    weight[fill[i]!] = w;
    fill[i]! += 1;
    to[fill[j]!] = i;
    weight[fill[j]!] = w;
    fill[j]! += 1;
  }
  return { n, pairs: merged.size, start, to, weight };
}

function ringDistance(a: number, b: number, m: number): number {
  const d = a > b ? a - b : b - a;
  return d < m - d ? d : m - d;
}

/**
 * A circular arrangement of every domain with its total weighted ring distance kept current. Each
 * move prices only the pairs that touch what moved and charges them to `work`.
 */
export class Ring {
  private readonly adj: Adjacency;
  readonly at: Int32Array;
  readonly pos: Int32Array;
  work = 0;

  constructor(adj: Adjacency, order: readonly number[]) {
    this.adj = adj;
    this.at = Int32Array.from(order);
    this.pos = new Int32Array(adj.n);
    order.forEach((node, slot) => {
      this.pos[node] = slot;
    });
  }

  /** O(n + P). */
  cost(): number {
    const { n, start, to, weight } = this.adj;
    let total = 0;
    for (let u = 0; u < n; u += 1) {
      for (let e = start[u]!; e < start[u + 1]!; e += 1) {
        if (to[e]! > u) total += weight[e]! * ringDistance(this.pos[u]!, this.pos[to[e]!]!, n);
      }
    }
    this.work += this.adj.n + this.adj.pairs;
    return total;
  }

  /** Cost change of `node` standing at `slot` instead, its partners held: O(deg). */
  private shift(node: number, slot: number, skip: number): number {
    const { n, start, to, weight } = this.adj;
    const from = this.pos[node]!;
    let delta = 0;
    for (let e = start[node]!; e < start[node + 1]!; e += 1) {
      const other = to[e]!;
      if (other === skip) continue;
      const at = this.pos[other]!;
      delta += weight[e]! * (ringDistance(slot, at, n) - ringDistance(from, at, n));
    }
    this.work += 1 + start[node + 1]! - start[node]!;
    return delta;
  }

  /** Swaps the domains in `slot` and the slot after it; returns the cost change. O(deg u + deg v). */
  stepForward(slot: number): number {
    const next = (slot + 1) % this.adj.n;
    const u = this.at[slot]!;
    const v = this.at[next]!;
    const delta = this.shift(u, next, v) + this.shift(v, slot, u);
    this.place(u, next);
    this.place(v, slot);
    return delta;
  }

  private place(node: number, slot: number): void {
    this.at[slot] = node;
    this.pos[node] = slot;
  }

  /** Steps `node` backward `steps` slots without pricing. O(steps). */
  stepBack(node: number, steps: number): void {
    const { n } = this.adj;
    for (let k = 0; k < steps; k += 1) {
      const slot = this.pos[node]!;
      const before = (slot - 1 + n) % n;
      const other = this.at[before]!;
      this.place(node, before);
      this.place(other, slot);
    }
  }

  /** Cost change of reversing the arc of `length` slots from `from`: only pairs leaving the arc change. O(Σ deg in arc). */
  reversalDelta(from: number, length: number): number {
    const { n, start, to, weight } = this.adj;
    let delta = 0;
    for (let k = 0; k < length; k += 1) {
      const node = this.at[(from + k) % n]!;
      const was = (from + k) % n;
      const now = (from + length - 1 - k) % n;
      for (let e = start[node]!; e < start[node + 1]!; e += 1) {
        const at = this.pos[to[e]!]!;
        if ((at - from + n) % n < length) continue;
        delta += weight[e]! * (ringDistance(now, at, n) - ringDistance(was, at, n));
      }
      this.work += 1 + start[node + 1]! - start[node]!;
    }
    return delta;
  }

  reverse(from: number, length: number): void {
    const { n } = this.adj;
    for (let k = 0; k < length >> 1; k += 1) {
      const a = (from + k) % n;
      const b = (from + length - 1 - k) % n;
      const u = this.at[a]!;
      const v = this.at[b]!;
      this.place(v, a);
      this.place(u, b);
    }
  }

  order(): number[] {
    return Array.from(this.at);
  }
}

/** Moves `node` to its best slot by stepping it once round the ring and keeping the best step. O(n·deg + P). */
function relocate(ring: Ring, node: number, budget: number): boolean {
  const n = ring.at.length;
  let total = 0;
  let best = 0;
  let bestStep = 0;
  let step = 0;
  while (step < n - 1 && ring.work < budget) {
    total += ring.stepForward(ring.pos[node]!);
    step += 1;
    if (total < best - EPS) {
      best = total;
      bestStep = step;
    }
  }
  ring.stepBack(node, step - bestStep);
  return bestStep > 0;
}

/** Reverses every arc up to half the ring once, keeping each reversal that lowers the cost. O(n² · deg) per sweep. */
function reverseArcs(ring: Ring, budget: number): boolean {
  const n = ring.at.length;
  let improved = false;
  for (let length = 2; length <= n >> 1; length += 1) {
    for (let from = 0; from < n; from += 1) {
      if (ring.work >= budget) return improved;
      if (ring.reversalDelta(from, length) < -EPS) {
        ring.reverse(from, length);
        improved = true;
      }
    }
  }
  return improved;
}

/** Relocation and arc-reversal sweeps on `ring` until neither improves or `budget` terms are spent. */
function localSearch(ring: Ring, budget: number): void {
  const n = ring.at.length;
  const limit = ring.work + budget;
  for (let improved = true; improved && ring.work < limit;) {
    improved = false;
    for (let node = 0; node < n && ring.work < limit; node += 1) improved = relocate(ring, node, limit) || improved;
    improved = reverseArcs(ring, limit) || improved;
  }
}

/** A cosine-like triangle wave of period `4n` at `quarterSlot`: integer steps and one division, so every engine agrees. */
function triangleWave(quarterSlot: number, n: number): number {
  return (Math.abs((quarterSlot % (4 * n)) - 2 * n) - n) / n;
}

/**
 * Orders domains by angle in the plane of the lazy random walk's two leading non-constant eigenvectors,
 * found by subspace iteration from `chain` laid round a circle; angle compares by half-plane, then
 * cross-product sign, never a transcendental. O(SPECTRAL_ITERATIONS · (n + P) + n log n).
 */
function spectralSeed(adj: Adjacency, chain: readonly number[]): { order: number[]; work: number } {
  const { n, start, to, weight } = adj;
  const degree = new Float64Array(n);
  let total = 0;
  for (let u = 0; u < n; u += 1) {
    for (let e = start[u]!; e < start[u + 1]!; e += 1) degree[u]! += weight[e]!;
    total += degree[u]!;
  }
  if (total === 0) return { order: chain.slice(), work: 0 };
  let basis = [new Float64Array(n), new Float64Array(n)] as const;
  let walked = [new Float64Array(n), new Float64Array(n)] as const;
  chain.forEach((node, slot) => {
    basis[0][node] = triangleWave(4 * slot, n);
    basis[1][node] = triangleWave(4 * slot + 3 * n, n);
  });
  for (let round = 0; round < SPECTRAL_ITERATIONS; round += 1) {
    for (let c = 0; c < 2; c += 1) {
      const x = basis[c]!;
      const y = walked[c]!;
      for (let u = 0; u < n; u += 1) {
        let reach = 0;
        for (let e = start[u]!; e < start[u + 1]!; e += 1) reach += weight[e]! * x[to[e]!]!;
        y[u] = degree[u]! > 0 ? 0.5 * (x[u]! + reach / degree[u]!) : x[u]!;
      }
      degreeOrthonormalise(y, c === 0 ? [] : [walked[0]], degree, total);
    }
    [basis, walked] = [walked, basis];
  }
  const [x, y] = basis;
  const half = Int8Array.from({ length: n }, (_, u) => (x[u] === 0 && y[u] === 0 ? 2 : y[u]! > 0 || (y[u] === 0 && x[u]! > 0) ? 0 : 1));
  const order = Array.from({ length: n }, (_, u) => u).sort((a, b) => half[a]! - half[b]! || Math.sign(x[b]! * y[a]! - y[b]! * x[a]!) || a - b);
  return { order, work: SPECTRAL_ITERATIONS * 2 * (n + start[n]!) };
}

/** Removes the constant vector and every vector in `against` from `y` under the degree inner product, then scales it to unit length. O(n). */
function degreeOrthonormalise(y: Float64Array, against: readonly Float64Array[], degree: Float64Array, total: number): void {
  const n = y.length;
  let mean = 0;
  for (let u = 0; u < n; u += 1) mean += degree[u]! * y[u]!;
  mean /= total;
  for (let u = 0; u < n; u += 1) y[u]! -= mean;
  for (const z of against) {
    let dot = 0;
    for (let u = 0; u < n; u += 1) dot += degree[u]! * y[u]! * z[u]!;
    for (let u = 0; u < n; u += 1) y[u]! -= dot * z[u]!;
  }
  let norm = 0;
  for (let u = 0; u < n; u += 1) norm += degree[u]! * y[u]! * y[u]!;
  norm = Math.sqrt(norm) || 1;
  for (let u = 0; u < n; u += 1) y[u]! /= norm;
}

/** Chains each domain to its heaviest unplaced partner, else the lowest unplaced index. O(n + P). */
function greedyChain(adj: Adjacency, startAt: number): number[] {
  const { n, start, to, weight } = adj;
  const placed = new Uint8Array(n);
  placed[startAt] = 1;
  const order = [startAt];
  let lowestFree = 0;
  while (order.length < n) {
    const tail = order[order.length - 1]!;
    let best = -1;
    let bestW = 0;
    for (let e = start[tail]!; e < start[tail + 1]!; e += 1) {
      const k = to[e]!;
      if (placed[k] || weight[e]! < bestW || (weight[e]! === bestW && k > best)) continue;
      best = k;
      bestW = weight[e]!;
    }
    if (best < 0) {
      while (placed[lowestFree]) lowestFree += 1;
      best = lowestFree;
    }
    placed[best] = 1;
    order.push(best);
  }
  return order;
}

function heapPermutations(n: number, visit: (order: number[]) => void): void {
  const order = Array.from({ length: n }, (_, i) => i);
  visit(order);
  const c = new Array<number>(n).fill(0);
  let i = 1;
  while (i < n) {
    if (c[i]! < i) {
      const a = i % 2 === 0 ? 0 : c[i]!;
      [order[a], order[i]] = [order[i]!, order[a]!];
      visit(order);
      c[i]! += 1;
      i = 1;
    } else {
      c[i] = 0;
      i += 1;
    }
  }
}

/** Ring cost of a partial order, counting only pairs with both ends placed. O(len + P). */
function partialCost(adj: Adjacency, order: readonly number[], pos: Int32Array, stamp: Int32Array, round: number): number {
  const m = order.length;
  order.forEach((node, slot) => {
    pos[node] = slot;
    stamp[node] = round;
  });
  let total = 0;
  for (const u of order) {
    for (let e = adj.start[u]!; e < adj.start[u + 1]!; e += 1) {
      const v = adj.to[e]!;
      if (v > u && stamp[v] === round) total += adj.weight[e]! * ringDistance(pos[u]!, pos[v]!, m);
    }
  }
  return total;
}

/**
 * Orders n domains round a circle to minimise Σ weight × ring distance over P weighted pairs: every
 * order up to `EXHAUSTIVE_MAX`, else three seeds whose local search shares a budget of slot and pair
 * terms, `SEARCH_WORK_FLOOR` + `SEARCH_WORK_PER_INPUT` × (n + P). O(n log n + P) beside that budget.
 */
export function circularDomainOrder(model: DialModel, previous: readonly string[] | null): DialOrder {
  const ids = model.domains.map((d) => d.id).sort();
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i] as const));
  const raw: { i: number; j: number; w: number }[] = [];
  const strength = new Float64Array(n);
  for (const f of model.flows) {
    const i = index.get(f.a);
    const j = index.get(f.b);
    if (i === undefined || j === undefined) continue;
    raw.push({ i, j, w: f.relatesOnly ? RELATES_WEIGHT : f.total });
    strength[i]! += f.total;
    strength[j]! += f.total;
  }
  if (n === 0) return { order: [], work: 0 };
  const adj = adjacencyOf(n, raw);
  const budget = SEARCH_WORK_FLOOR + SEARCH_WORK_PER_INPUT * (n + adj.pairs);
  let work = 0;

  let hub = 0;
  for (let k = 1; k < n; k += 1) if (strength[k]! > strength[hub]!) hub = k;

  let order: number[];
  if (n <= EXHAUSTIVE_MAX) {
    const rest = Array.from({ length: n }, (_, i) => i).filter((i) => i !== hub);
    let best: number[] = [hub, ...rest];
    let bestCost = Infinity;
    heapPermutations(n - 1, (perm) => {
      const ring = new Ring(adj, [hub, ...perm.map((k) => rest[k]!)]);
      const value = ring.cost();
      work += ring.work;
      if (value < bestCost - EPS) {
        bestCost = value;
        best = ring.order();
      }
    });
    order = best;
  } else {
    const natural = Array.from({ length: n }, (_, i) => i).sort((x, y) =>
      model.domainById.get(ids[x]!)!.label.localeCompare(model.domainById.get(ids[y]!)!.label, undefined, { numeric: true }) || x - y,
    );
    const chain = greedyChain(adj, hub);
    const spectral = spectralSeed(adj, chain);
    work += spectral.work;
    const rings = [spectral.order, chain, natural].map((seed) => new Ring(adj, seed));
    const seedCost = new Map(rings.map((ring) => [ring, ring.cost()] as const));
    rings.sort((a, b) => seedCost.get(a)! - seedCost.get(b)!);
    let best: number[] = natural;
    let bestCost = Infinity;
    let spent = 0;
    for (const ring of rings) {
      const before = ring.work;
      if (adj.pairs > 0) localSearch(ring, budget - spent);
      spent += ring.work - before;
      const value = ring.cost();
      if (value < bestCost - EPS) {
        bestCost = value;
        best = ring.order();
      }
    }
    for (const ring of rings) work += ring.work;
    const at = best.indexOf(hub);
    order = best.slice(at).concat(best.slice(0, at));
  }
  if (n > 2 && ids[order[1]!]! > ids[order[n - 1]!]!) order = [order[0]!, ...order.slice(1).reverse()];

  if (previous && previous.length > 0) {
    const kept = previous.map((id) => index.get(id)).filter((k): k is number => k !== undefined);
    const inserted = insertMissing(adj, kept, budget);
    work += inserted.work;
    if (inserted.order !== null) {
      const pos = new Int32Array(n);
      const stamp = new Int32Array(n);
      if (partialCost(adj, inserted.order, pos, stamp, 1) <= HYSTERESIS * partialCost(adj, order, pos, stamp, 2) + EPS) order = inserted.order;
      work += 2 * adj.pairs;
    }
  }
  return { order: order.map((k) => ids[k]!), work };
}

/**
 * Inserts each domain missing from `kept` where the placed pairs cost least, in index order. Each
 * trial is O(n + P); past `budget` terms it gives up and returns null.
 */
function insertMissing(adj: Adjacency, kept: readonly number[], budget: number): { order: number[] | null; work: number } {
  const keptSet = new Set(kept);
  const pos = new Int32Array(adj.n);
  const stamp = new Int32Array(adj.n);
  let round = 0;
  let work = 0;
  let candidate = [...kept];
  for (let k = 0; k < adj.n; k += 1) {
    if (keptSet.has(k)) continue;
    let bestAt = candidate.length;
    let bestCost = Infinity;
    for (let at = 0; at <= candidate.length; at += 1) {
      if (work >= budget) return { order: null, work };
      round += 1;
      const value = partialCost(adj, candidate.slice(0, at).concat([k], candidate.slice(at)), pos, stamp, round);
      work += candidate.length + 1 + adj.pairs;
      if (value < bestCost - EPS) {
        bestCost = value;
        bestAt = at;
      }
    }
    candidate = candidate.slice(0, bestAt).concat([k], candidate.slice(bestAt));
  }
  return { order: candidate, work };
}
