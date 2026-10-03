import type { DialModel } from "./types";

const EXHAUSTIVE_MAX = 9;
const SEARCH_ROUNDS = 20;
const HYSTERESIS = 1.1;
const RELATES_WEIGHT = 0.5;
const EPS = 1e-9;

interface Pair { i: number; j: number; w: number }

export interface DialOrder { order: string[]; evaluations: number }

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

function localSearch(start: number[], cost: (order: number[]) => number): number[] {
  let order = start;
  let current = cost(order);
  const n = order.length;
  for (let round = 0; round < SEARCH_ROUNDS; round += 1) {
    let improved = false;
    for (let a = 0; a < n - 1; a += 1) {
      for (let b = a + 1; b < n; b += 1) {
        const next = order.slice(0, a).concat(order.slice(a, b + 1).reverse(), order.slice(b + 1));
        const value = cost(next);
        if (value < current - EPS) {
          order = next;
          current = value;
          improved = true;
        }
      }
    }
    for (let from = 0; from < n; from += 1) {
      for (let to = 0; to < n; to += 1) {
        if (Math.abs(from - to) <= 1) continue;
        const next = order.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        const value = cost(next);
        if (value < current - EPS) {
          order = next;
          current = value;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return order;
}

function greedyChain(n: number, pairs: readonly Pair[], startAt: number): number[] {
  const weight = Array.from({ length: n }, () => new Float64Array(n));
  for (const p of pairs) {
    weight[p.i]![p.j]! += p.w;
    weight[p.j]![p.i]! += p.w;
  }
  const placed = new Set<number>([startAt]);
  const order = [startAt];
  while (order.length < n) {
    const tail = order[order.length - 1]!;
    let best = -1;
    let bestW = -1;
    for (let k = 0; k < n; k += 1) {
      if (placed.has(k)) continue;
      if (weight[tail]![k]! > bestW) {
        bestW = weight[tail]![k]!;
        best = k;
      }
    }
    placed.add(best);
    order.push(best);
  }
  return order;
}

export function circularDomainOrder(model: DialModel, previous: readonly string[] | null): DialOrder {
  const ids = model.domains.map((d) => d.id).sort();
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i] as const));
  const pairs: Pair[] = [];
  const strength = new Float64Array(n);
  for (const f of model.flows) {
    const i = index.get(f.a);
    const j = index.get(f.b);
    if (i === undefined || j === undefined) continue;
    pairs.push({ i, j, w: f.relatesOnly ? RELATES_WEIGHT : f.total });
    strength[i]! += f.total;
    strength[j]! += f.total;
  }
  let evaluations = 0;
  const pos = new Int32Array(n);
  const placedAt = new Int32Array(n);
  const cost = (order: readonly number[]) => {
    evaluations += 1;
    const m = order.length;
    order.forEach((node, slot) => {
      pos[node] = slot;
      placedAt[node] = evaluations;
    });
    let total = 0;
    for (const p of pairs) {
      if (placedAt[p.i] !== evaluations || placedAt[p.j] !== evaluations) continue;
      const d = Math.abs(pos[p.i]! - pos[p.j]!);
      total += p.w * Math.min(d, m - d);
    }
    return total;
  };
  if (n === 0) return { order: [], evaluations };

  let hub = 0;
  for (let k = 1; k < n; k += 1) if (strength[k]! > strength[hub]!) hub = k;

  let order: number[];
  if (n <= EXHAUSTIVE_MAX) {
    const rest = Array.from({ length: n }, (_, i) => i).filter((i) => i !== hub);
    let best: number[] = [hub, ...rest];
    let bestCost = Infinity;
    heapPermutations(n - 1, (perm) => {
      const candidate = [hub, ...perm.map((k) => rest[k]!)];
      const value = cost(candidate);
      if (value < bestCost - EPS) {
        bestCost = value;
        best = candidate;
      }
    });
    order = best;
  } else {
    const natural = Array.from({ length: n }, (_, i) => i).sort((x, y) =>
      model.domainById.get(ids[x]!)!.label.localeCompare(model.domainById.get(ids[y]!)!.label, undefined, { numeric: true }) || x - y,
    );
    let best: number[] = natural;
    let bestCost = Infinity;
    for (const start of [greedyChain(n, pairs, hub), natural]) {
      const candidate = localSearch(start, cost);
      const value = cost(candidate);
      if (value < bestCost - EPS) {
        bestCost = value;
        best = candidate;
      }
    }
    const at = best.indexOf(hub);
    order = best.slice(at).concat(best.slice(0, at));
  }
  if (n > 2 && ids[order[1]!]! > ids[order[n - 1]!]!) order = [order[0]!, ...order.slice(1).reverse()];

  if (previous && previous.length > 0) {
    const kept = previous.map((id) => index.get(id)).filter((k): k is number => k !== undefined);
    const keptSet = new Set(kept);
    let candidate = kept;
    for (let k = 0; k < n; k += 1) {
      if (keptSet.has(k)) continue;
      let bestAt = candidate.length;
      let bestCost = Infinity;
      for (let at = 0; at <= candidate.length; at += 1) {
        const trial = candidate.slice(0, at).concat([k], candidate.slice(at));
        const value = cost(trial);
        if (value < bestCost - EPS) {
          bestCost = value;
          bestAt = at;
        }
      }
      candidate = candidate.slice(0, bestAt).concat([k], candidate.slice(bestAt));
    }
    if (cost(candidate) <= HYSTERESIS * cost(order) + EPS) order = candidate;
  }
  return { order: order.map((k) => ids[k]!), evaluations };
}
