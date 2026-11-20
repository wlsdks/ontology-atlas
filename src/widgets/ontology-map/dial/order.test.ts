import { afterEach, describe, expect, it } from "vitest";

import type { DirectedDomainFlow } from "../model/containment-tree";
import { circularDomainOrder, claimDialOrderFolder, rememberDialOrder, rememberedDialOrder } from "./order";
import type { DialDomain, DialModel } from "./types";

const pad = (i: number) => `d${String(i).padStart(2, "0")}`;

function modelOf(n: number, links: readonly [number, number, number][]): DialModel {
  const domains: DialDomain[] = Array.from({ length: n }, (_, i) => ({
    id: pad(i),
    label: pad(i),
    capabilityIds: [],
    directElementIds: [],
    elementCount: 0,
  }));
  const flows = new Map<string, DirectedDomainFlow>();
  for (const [x, y, count] of links) {
    const [a, b] = pad(x) < pad(y) ? [pad(x), pad(y)] : [pad(y), pad(x)];
    const key = `${a}\0${b}`;
    const flow = flows.get(key) ?? { key, a, b, ab: 0, ba: 0, total: 0, relatesOnly: false };
    if (pad(x) === a) flow.ab += count;
    else flow.ba += count;
    flow.total += count;
    flows.set(key, flow);
  }
  const sorted = [...flows.values()].sort((p, q) => q.total - p.total || (p.key < q.key ? -1 : 1));
  return {
    projectId: null,
    projectLabel: "",
    domains,
    domainById: new Map(domains.map((d) => [d.id, d])),
    capabilityById: new Map(),
    domainOf: new Map(),
    capabilityOf: new Map(),
    dependents: new Map(),
    flows: sorted,
    flowByKey: new Map(sorted.map((f) => [f.key, f])),
    capabilityDependencies: [],
    capabilityRelates: [],
    orphanIds: [],
  };
}

function ringCost(model: DialModel, order: readonly string[]): number {
  const pos = new Map(order.map((id, i) => [id, i]));
  let cost = 0;
  for (const f of model.flows) {
    const d = Math.abs(pos.get(f.a)! - pos.get(f.b)!);
    cost += (f.relatesOnly ? 0.5 : f.total) * Math.min(d, order.length - d);
  }
  return cost;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomLinks(n: number, count: number, seed: number): [number, number, number][] {
  const rand = seeded(seed);
  const out: [number, number, number][] = [];
  for (let k = 0; k < count; k += 1) {
    const x = Math.floor(rand() * n);
    const y = Math.floor(rand() * n);
    if (x !== y) out.push([x, y, 1 + Math.floor(rand() * 5)]);
  }
  return out;
}

function chainedLinks(n: number, count: number, seed: number): [number, number, number][] {
  const rand = seeded(seed);
  const out: [number, number, number][] = [];
  for (let k = 0; k < count; k += 1) {
    const x = Math.floor(rand() * n);
    const y = rand() < 0.7 ? (x + 1 + Math.floor(rand() * 3)) % n : Math.floor(rand() * n);
    if (x !== y) out.push([x, y, 1 + Math.floor(rand() * 5)]);
  }
  return out;
}

/** The search this order replaced: 2-opt and single moves, each priced by a full recount, from a greedy chain and the natural order. */
function referenceOrder(model: DialModel): string[] {
  const ids = model.domains.map((d) => d.id).sort();
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i] as const));
  const weight = Array.from({ length: n }, () => new Float64Array(n));
  const strength = new Float64Array(n);
  for (const f of model.flows) {
    const i = index.get(f.a)!;
    const j = index.get(f.b)!;
    weight[i]![j]! += f.total;
    weight[j]![i]! += f.total;
    strength[i]! += f.total;
    strength[j]! += f.total;
  }
  const pairs = model.flows.map((f) => [index.get(f.a)!, index.get(f.b)!, f.relatesOnly ? 0.5 : f.total] as const);
  const pos = new Int32Array(n);
  const cost = (order: readonly number[]) => {
    order.forEach((node, slot) => {
      pos[node] = slot;
    });
    let total = 0;
    for (const [i, j, w] of pairs) {
      const d = Math.abs(pos[i]! - pos[j]!);
      total += w * Math.min(d, n - d);
    }
    return total;
  };
  const search = (start: number[]) => {
    let order = start;
    let current = cost(order);
    for (let round = 0, improved = true; round < 20 && improved; round += 1) {
      improved = false;
      const consider = (next: number[]) => {
        const value = cost(next);
        if (value < current - 1e-9) [order, current, improved] = [next, value, true];
      };
      for (let a = 0; a < n - 1; a += 1) for (let b = a + 1; b < n; b += 1) consider(order.slice(0, a).concat(order.slice(a, b + 1).reverse(), order.slice(b + 1)));
      for (let from = 0; from < n; from += 1) {
        for (let to = 0; to < n; to += 1) {
          if (Math.abs(from - to) <= 1) continue;
          const next = order.slice();
          next.splice(to, 0, next.splice(from, 1)[0]!);
          consider(next);
        }
      }
    }
    return order;
  };
  let hub = 0;
  for (let k = 1; k < n; k += 1) if (strength[k]! > strength[hub]!) hub = k;
  const chain = [hub];
  while (chain.length < n) {
    const tail = chain[chain.length - 1]!;
    let best = -1;
    for (let k = 0; k < n; k += 1) if (!chain.includes(k) && (best < 0 || weight[tail]![k]! > weight[tail]![best]!)) best = k;
    chain.push(best);
  }
  const natural = Array.from({ length: n }, (_, i) => i);
  const [a, b] = [search(chain), search(natural)];
  return (cost(b) < cost(a) - 1e-9 ? b : a).map((k) => ids[k]!);
}

afterEach(() => rememberDialOrder([]));

describe("circularDomainOrder", () => {
  it("finds the brute-force optimum on 7 domains", () => {
    const model = modelOf(7, randomLinks(7, 14, 3));
    const { order } = circularDomainOrder(model, null);
    const ids = model.domains.map((d) => d.id);
    const best = Math.min(...permutations(ids).map((o) => ringCost(model, o)));
    expect(ringCost(model, order)).toBe(best);
    expect([...order].sort()).toEqual(ids);
  });

  it("returns a planted 15-domain ring as a cycle", () => {
    const links = Array.from({ length: 15 }, (_, i) => [i, (i + 1) % 15, 1] as [number, number, number]);
    const shuffled = modelOf(15, links);
    const { order } = circularDomainOrder(shuffled, null);
    for (let k = 0; k < 15; k += 1) {
      const a = Number(order[k]!.slice(1));
      const b = Number(order[(k + 1) % 15]!.slice(1));
      expect(Math.min((a - b + 15) % 15, (b - a + 15) % 15)).toBe(1);
    }
  });

  it("keeps the ring cost of the full-recount search it replaced on fixtures of 12 to 33 domains", () => {
    const ratios: number[] = [];
    for (const n of [12, 20, 33]) {
      for (const seed of [1, 2, 3, 4]) {
        for (const links of [randomLinks(n, n * 3, seed * 31 + n), chainedLinks(n, n * 3, seed * 31 + n)]) {
          const model = modelOf(n, links);
          ratios.push(ringCost(model, circularDomainOrder(model, null).order) / ringCost(model, referenceOrder(model)));
        }
      }
    }
    const mean = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    expect(mean, "mean ring cost against the old search").toBeLessThanOrEqual(1.02);
    expect(Math.max(...ratios), "worst ring cost against the old search").toBeLessThanOrEqual(1.1);
  });

  it("keeps the ring cost of the full-recount search on 80 domains linked densely and weakly", () => {
    const model = modelOf(80, randomLinks(80, 2600, 80));
    expect(ringCost(model, circularDomainOrder(model, null).order) / ringCost(model, referenceOrder(model))).toBeLessThanOrEqual(1);
  });

  it("grows its work linearly with domains and pairs", () => {
    const work = (n: number) => circularDomainOrder(modelOf(n, randomLinks(n, n * 10, n)), null).work;
    expect(work(1200) / work(300)).toBeLessThanOrEqual(5);
  });

  it("is deterministic", () => {
    const model = modelOf(20, randomLinks(20, 60, 11));
    expect(circularDomainOrder(model, null)).toEqual(circularDomainOrder(model, null));
  });

  it("keeps a remembered order within 1.1x of the optimum", () => {
    const model = modelOf(6, [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 4, 4], [4, 5, 4], [5, 0, 4], [0, 3, 1]]);
    const fresh = circularDomainOrder(model, null).order;
    const shifted = [...fresh.slice(2), ...fresh.slice(0, 2)];
    expect(circularDomainOrder(model, shifted).order).toEqual(shifted);
    const scrambled = [fresh[0]!, fresh[3]!, fresh[1]!, fresh[4]!, fresh[2]!, fresh[5]!];
    expect(circularDomainOrder(model, scrambled).order).toEqual(fresh);
  });

  it("inserts an added domain into the remembered order", () => {
    const before = modelOf(5, [[0, 1, 3], [1, 2, 3], [2, 3, 3], [3, 4, 3], [4, 0, 3]]);
    const remembered = circularDomainOrder(before, null).order;
    const after = modelOf(6, [[0, 1, 3], [1, 2, 3], [2, 3, 3], [3, 4, 3], [4, 0, 3], [5, 2, 1]]);
    const { order } = circularDomainOrder(after, remembered);
    expect(order.filter((id) => id !== "d05")).toEqual(remembered);
    const at = order.indexOf("d05");
    expect([order[(at + 5) % 6], order[(at + 1) % 6]]).toContain("d02");
  });

  it("puts the hub first and the smaller of its neighbours clockwise", () => {
    const model = modelOf(4, [[2, 0, 5], [2, 1, 4], [2, 3, 3], [0, 3, 1]]);
    const { order } = circularDomainOrder(model, null);
    expect(order[0]).toBe("d02");
    expect(order[1]! < order[3]!).toBe(true);
  });

  it("remembers one order in a module slot", () => {
    rememberDialOrder(["b", "a"]);
    expect(rememberedDialOrder()).toEqual(["b", "a"]);
  });

  it("inserts two new domains by the cost of placed pairs only, ignoring another folder's ids", () => {
    const model = modelOf(5, [[1, 2, 4], [1, 3, 4], [2, 3, 3], [3, 4, 3]]);
    const expected = ["d00", "d04", "d03", "d01", "d02"];
    expect(circularDomainOrder(model, ["d00", "d01", "d02"]).order).toEqual(expected);
    expect(circularDomainOrder(model, ["zz-a", "d00", "zz-b", "d01", "d02"]).order).toEqual(expected);
    expect(ringCost(model, expected)).toBe(ringCost(model, circularDomainOrder(model, null).order));
  });

  it("forgets the module-level order when another folder opens", () => {
    claimDialOrderFolder("folder-a");
    rememberDialOrder(["d01", "d00"]);
    claimDialOrderFolder("folder-a");
    expect(rememberedDialOrder()).toEqual(["d01", "d00"]);
    claimDialOrderFolder("folder-b");
    expect(rememberedDialOrder()).toBeNull();
    rememberDialOrder(["d02"]);
    claimDialOrderFolder("folder-b");
    expect(rememberedDialOrder()).toEqual(["d02"]);
  });
});
