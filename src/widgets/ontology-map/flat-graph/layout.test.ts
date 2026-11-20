import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isContainmentRelation } from "@/entities/knowledge-graph";

import { buildDialModel } from "../dial/dial-model";
import { circularDomainOrder } from "../dial/order";
import type { DialModel } from "../dial/types";
import {
  directRelations,
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesCapabilityPairs,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../model/containment-tree";
import { layoutFlatGraph, separate, type Body } from "./layout";
import { resolveFlatGraphTokens } from "./tokens";
import type { FlatGraphFrame } from "./types";

function cssValues(): Map<string, string> {
  const values = new Map<string, string>();
  for (const file of ["app/styles/map-graph-tokens.css", "app/styles/tokens.css", "app/styles/base-map-tokens.css"]) {
    const css = readFileSync(join(process.cwd(), file), "utf8");
    for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) if (!values.has(m[1]!)) values.set(m[1]!, m[2]!.trim());
  }
  return values;
}

const TOKENS = resolveFlatGraphTokens((v) => cssValues().get(v) ?? "").layout;

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The `all` shape of `scripts/perf/gen-scale-vault.mjs` at `files` files, concepts the graph draws only. */
function folderModel(files: number, extraCapabilities = 0): DialModel {
  const rand = seeded(7);
  const domains = Math.max(6, Math.round(files / 250));
  const capabilities = Math.round(files * 0.25) + extraCapabilities;
  const elements = Math.round(files * 0.3);
  const nodes: TreeInputNode[] = [{ id: "atlas", label: "Atlas", kind: "project" }];
  const edges: { from: string; to: string; type: string }[] = [];
  for (let d = 0; d < domains; d += 1) {
    nodes.push({ id: `domains/dom-${d}`, label: `Domain ${d}`, kind: "domain" });
    edges.push({ from: "atlas", to: `domains/dom-${d}`, type: "contains" });
  }
  for (let e = 0; e < elements; e += 1) {
    nodes.push({ id: `elements/el-${e}`, label: `Element ${e}`, kind: "element" });
    edges.push({ from: `domains/dom-${(e * 7) % domains}`, to: `elements/el-${e}`, type: "contains" });
  }
  for (let i = 0; i < capabilities; i += 1) {
    nodes.push({ id: `capabilities/cap-${i}`, label: `Capability ${i}`, kind: "capability" });
    edges.push({ from: `domains/dom-${i % domains}`, to: `capabilities/cap-${i}`, type: "contains" });
    edges.push({ from: `capabilities/cap-${i}`, to: `elements/el-${(i * 3) % elements}`, type: "contains" });
    if (i > 0) edges.push({ from: `capabilities/cap-${i}`, to: `capabilities/cap-${Math.floor(rand() * i)}`, type: "depends_on" });
  }
  const treeEdges: TreeInputEdge[] = edges.map((e) => ({ source: e.from, target: e.to, kind: isContainmentRelation(e.type) ? "contains" : "depends", relationType: e.type }));
  const tree = readContainmentTree(nodes, treeEdges);
  const dependencies = rollDomainDependencies(tree, treeEdges);
  return buildDialModel({
    tree,
    dependencies,
    flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, treeEdges)),
    elementIds: nodes.filter((n) => n.kind === "element").map((n) => n.id),
    relates: rollRelatesCapabilityPairs(tree, treeEdges),
    direct: directRelations(treeEdges),
  });
}

function frameOf(model: DialModel): FlatGraphFrame {
  const titles = new Map(model.domains.map((d) => [d.id, { halfWidthPx: 60, topPx: 20, bottomPx: 64 }]));
  const compactTitles = new Map(model.domains.map((d) => [d.id, { halfWidthPx: 50, topPx: 20, bottomPx: 36 }]));
  return { areaPx: { width: 1400, height: 800 }, titles, compactTitles, capDiscPx: 12, hubPx: 60 };
}

function layoutOf(model: DialModel) {
  return layoutFlatGraph(model, circularDomainOrder(model, null).order, TOKENS, null, frameOf(model));
}

function crowd(count: number, seed: number): Body[] {
  const rand = seeded(seed);
  const side = Math.sqrt(count) * 24;
  return Array.from({ length: count }, (_, k) => ({ id: `b${k}`, x: rand() * side, y: rand() * side, r: 4 + rand() * 8, fixed: k % 17 === 0 }));
}

function overlaps(bodies: readonly Body[], gap: number): string[] {
  const hits: string[] = [];
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const p = bodies[i]!;
      const q = bodies[j]!;
      if (p.fixed && q.fixed) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) < p.r + q.r + gap - 1e-6) hits.push(`${p.id}×${q.id}`);
    }
  }
  return hits;
}

describe("layoutFlatGraph", () => {
  it("lays a folder out once while only concepts the graph does not draw arrive", () => {
    const first = layoutOf(folderModel(1500));
    expect(layoutOf(folderModel(1500))).toBe(first);
  });

  it("lays the folder out again when a capability arrives", () => {
    const first = layoutOf(folderModel(1500));
    const grown = layoutOf(folderModel(1500, 1));
    expect(grown).not.toBe(first);
    expect(grown.positions.has(`capabilities/cap-${Math.round(1500 * 0.25)}`)).toBe(true);
  });
});

describe("separate", () => {
  it.each([[40], [400]])("leaves no pair of %i crowded bodies overlapping once a round moves nothing, and never moves a fixed one", (count) => {
    const bodies = crowd(count, count);
    const fixedAt = bodies.filter((b) => b.fixed).map((b) => [b.x, b.y]);
    separate(bodies, 2, 10_000);
    expect(overlaps(bodies, 2)).toEqual([]);
    expect(bodies.filter((b) => b.fixed).map((b) => [b.x, b.y])).toEqual(fixedAt);
  });
});
