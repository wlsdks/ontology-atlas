import { afterEach, describe, expect, it } from "vitest";

import type { DirectedDomainFlow } from "../model/containment-tree";
import { circularDomainOrder, rememberDialOrder, rememberedDialOrder } from "./order";
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

  it("stays within its evaluation budget", () => {
    expect(circularDomainOrder(modelOf(9, randomLinks(9, 30, 5)), null).evaluations).toBeLessThanOrEqual(40_320);
    expect(circularDomainOrder(modelOf(33, randomLinks(33, 120, 7)), null).evaluations).toBeLessThanOrEqual(50_000);
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
});
