import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../model/containment-tree";
import { buildDialModel, resolveDialAttention } from "./dial-model";
import { aggregateLinks, domainOfEnd, ownLinkCount, resolveEnteredDomain, restBudget, type DialLink } from "./links";
import { resolveDialTokens } from "./tokens";
import type { DialModel } from "./types";

const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const TOKENS = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#ececf0" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));

function modelOf(domains: number, caps: number, deps: [string, string][], relates: [string, string][] = []): DialModel {
  const nodes: TreeInputNode[] = [{ id: "p", label: "P", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  for (let d = 0; d < domains; d += 1) {
    nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain" });
    edges.push({ source: "p", target: `d${d}`, kind: "contains", relationType: "contains" });
    for (let c = 0; c < caps; c += 1) {
      nodes.push({ id: `d${d}c${c}`, label: `Cap ${d}.${c}`, kind: "capability" });
      edges.push({ source: `d${d}`, target: `d${d}c${c}`, kind: "contains", relationType: "contains" });
    }
  }
  for (const [s, t] of deps) edges.push({ source: s, target: t, kind: "depends", relationType: "depends_on" });
  for (const [s, t] of relates) edges.push({ source: s, target: t, kind: "depends", relationType: "related_to" });
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  return buildDialModel({ tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)) });
}

function byDomainPair(model: DialModel, links: readonly DialLink[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of links) {
    if (l.relatesOnly) continue;
    const du = domainOfEnd(model, l.u);
    const dv = domainOfEnd(model, l.v);
    if (du === dv) continue;
    out.set(`${du}>${dv}`, (out.get(`${du}>${dv}`) ?? 0) + l.uv);
    out.set(`${dv}>${du}`, (out.get(`${dv}>${du}`) ?? 0) + l.vu);
  }
  for (const [k, v] of out) if (v === 0) out.delete(k);
  return out;
}

function flowPairs(model: DialModel): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of model.flows) {
    if (f.ab > 0) out.set(`${f.a}>${f.b}`, f.ab);
    if (f.ba > 0) out.set(`${f.b}>${f.a}`, f.ba);
  }
  return out;
}

const DEPS: [string, string][] = [
  ["d0c0", "d1c0"], ["d0c1", "d1c0"], ["d0c0", "d1c1"], ["d1c1", "d0c0"], ["d0", "d1"],
  ["d0c0", "d2c0"], ["d2c1", "d0c1"], ["d0c0", "d0c1"], ["d1c0", "d2c0"], ["d3c0", "d0c0"],
];

describe("aggregateLinks", () => {
  const model = modelOf(4, 2, DEPS, [["d2", "d3"]]);
  const rest = resolveDialAttention(model, null, null);

  it("draws one line per domain pair at rest, counted per direction", () => {
    const links = aggregateLinks(model, new Set(), rest);
    expect(links.every((l) => model.domainById.has(l.u) && model.domainById.has(l.v))).toBe(true);
    const d01 = links.find((l) => l.key === "d0\0d1")!;
    expect([d01.uv, d01.vu]).toEqual([4, 1]);
    expect(links.find((l) => l.key === "d2\0d3")).toMatchObject({ relatesOnly: true, total: 0 });
    expect(byDomainPair(model, links)).toEqual(flowPairs(model));
  });

  it("resolves the entered domain to its capabilities and keeps domain-level declarations at the chip", () => {
    const links = aggregateLinks(model, new Set(["d0"]), rest);
    expect(links.find((l) => l.key === "d0\0d1")).toMatchObject({ uv: 1, vu: 0 });
    expect(links.find((l) => l.key === "d0c0\0d1")).toMatchObject({ uv: 2, vu: 1 });
    expect(links.find((l) => l.key === "d0c0\0d0c1")).toMatchObject({ uv: 1 });
    expect(links.find((l) => l.key === "d1c0\0d2")).toBeUndefined();
    expect(byDomainPair(model, links)).toEqual(flowPairs(model));
  });

  it("takes an attended capability's own links out of its domain's line, never twice", () => {
    const attention = resolveDialAttention(model, "d0c1", null);
    const links = aggregateLinks(model, new Set(), attention);
    expect(links.find((l) => l.key === "d0c1\0d1")).toMatchObject({ uv: 1, vu: 0, attended: true });
    expect(links.find((l) => l.key === "d0\0d1")).toMatchObject({ uv: 3, vu: 1, attended: false });
    expect(links.find((l) => l.key === "d0c0\0d0c1")).toMatchObject({ uv: 1, attended: true });
    expect(byDomainPair(model, links)).toEqual(flowPairs(model));
    const both = aggregateLinks(model, new Set(["d1"]), attention);
    expect(byDomainPair(model, both)).toEqual(flowPairs(model));
  });

  it("marks the attended domain's links attended", () => {
    const links = aggregateLinks(model, new Set(), resolveDialAttention(model, "d2", null));
    expect(links.filter((l) => l.attended).map((l) => l.key).sort()).toEqual(["d0\0d2", "d1\0d2", "d2\0d3"]);
  });
});

describe("resolveEnteredDomain", () => {
  const model = modelOf(4, 2, DEPS);
  const rest = resolveDialAttention(model, null, null);
  const near = [{ domainId: "d1", distance: 50 }, { domainId: "d0", distance: 10 }];

  it("resolves only from the resolve pitch, nearest the free-rect centre unless one is attended", () => {
    expect(resolveEnteredDomain(model, TOKENS, rest, TOKENS.resolve - 1, near)).toEqual({ entered: null, resolved: false, slide: 0 });
    expect(resolveEnteredDomain(model, TOKENS, rest, TOKENS.resolve + 6, near)).toEqual({ entered: "d0", resolved: true, slide: 0.5 });
    expect(resolveEnteredDomain(model, TOKENS, rest, TOKENS.resolve + 40, near).slide).toBe(1);
    expect(resolveEnteredDomain(model, TOKENS, resolveDialAttention(model, "d1", null), TOKENS.resolve, near).entered).toBe("d1");
  });

  it("refuses when the entered domain's own links exceed the budget", () => {
    const many: [string, string][] = [];
    for (let c = 0; c < 30; c += 1) many.push([`d0c${c}`, `d1c${c}`]);
    const big = modelOf(2, 30, many);
    expect(ownLinkCount(big, "d0")).toBe(30);
    expect(resolveEnteredDomain(big, TOKENS, resolveDialAttention(big, null, null), 60, [{ domainId: "d0", distance: 0 }])).toMatchObject({ entered: "d0", resolved: false });
  });
});

describe("restBudget", () => {
  function star(ends: number): DialLink[] {
    const out: DialLink[] = [];
    for (let i = 0; i < ends; i += 1) {
      for (let j = i + 1; j < ends; j += 1) {
        const total = ((i * 31 + j * 17) % 13) + 1;
        out.push({ key: `e${i}\0e${j}`, u: `e${i}`, v: `e${j}`, uv: total, vu: 0, total, relatesOnly: false, attended: false });
      }
    }
    return out.sort((x, y) => y.total - x.total || (x.key < y.key ? -1 : 1));
  }

  it("keeps everything up to the minimum", () => {
    const links = star(7);
    expect(restBudget(links, 7, TOKENS).keep.size).toBe(21);
  });

  it("caps lines and lines per end once more than per-end-cap-ends ends show", () => {
    const links = star(40);
    const b = restBudget(links, 40, TOKENS);
    expect(b.keep.size).toBeLessThanOrEqual(TOKENS.restLinksMax);
    expect(b.perEndCap).toBe(TOKENS.perEndCap);
    const per = new Map<string, number>();
    for (const l of links) if (b.keep.has(l.key)) for (const e of [l.u, l.v]) per.set(e, (per.get(e) ?? 0) + 1);
    expect(Math.max(...per.values())).toBeLessThanOrEqual(TOKENS.perEndCap);
    expect(per.size).toBe(40);
  });

  it("partitions the counted links into shown and budget-hidden", () => {
    const links = star(30);
    const b = restBudget(links, 30, TOKENS);
    const hidden = links.filter((l) => !b.keep.has(l.key));
    expect(b.keep.size + hidden.length).toBe(b.total);
    expect(b.keep.size).toBe(Math.round(TOKENS.restLinksPerEnd * 30));
  });
});
