import { describe, expect, it } from "vitest";

import dogfoodManifest from "@/entities/docs-vault/data/manifest.json";
import storefrontManifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import type { VaultManifest } from "@/entities/docs-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";

import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../model/containment-tree";
import { buildDialModel } from "./dial-model";
import { layoutDial } from "./layout";
import { circularDomainOrder } from "./order";
import { ladderStep } from "./rings";
import type { DialMemory, DialModel, DialScene } from "./types";

const tokens = {
  pitch: 34,
  spiralC: 0.61,
  spiralK0: 4.5,
  elementRoom: 0.42,
  elementHole: 0.13,
  angularGap: 0.9,
  ringGap: 2.1,
  hubClearance: 78,
  orphanPitch: 0.5,
};

const KINDS = new Set(["project", "domain", "capability", "element"]);
type Node = { id: string; kind: string; title?: string };
type Edge = { from: string; to: string; type: string };

function modelOf(nodes: readonly Node[], edges: readonly Edge[]): DialModel {
  const treeNodes: TreeInputNode[] = nodes
    .filter((n) => KINDS.has(n.kind))
    .map((n) => ({ id: n.id, label: n.title ?? n.id, kind: n.kind as TreeInputNode["kind"] }));
  const treeEdges: TreeInputEdge[] = edges.map((e) => ({
    source: e.from,
    target: e.to,
    kind: isContainmentRelation(e.type) ? "contains" : "depends",
    relationType: e.type,
  }));
  const tree = readContainmentTree(treeNodes, treeEdges);
  const dependencies = rollDomainDependencies(tree, treeEdges);
  const flows = rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, treeEdges));
  const elementIds = treeNodes.filter((n) => n.kind === "element").map((n) => n.id);
  return buildDialModel({ tree, dependencies, flows, elementIds });
}

function vaultGraph(manifest: unknown) {
  const d = deriveOntologyFromVault(manifest as VaultManifest);
  return { nodes: d.nodes as Node[], edges: d.edges as Edge[] };
}

function crafted(domains: number, capsOf: (i: number) => number, deps: readonly [number, number][]) {
  const nodes: Node[] = [{ id: "p", kind: "project" }];
  const edges: Edge[] = [];
  const dom = (i: number) => `d${String(i).padStart(2, "0")}`;
  for (let i = 0; i < domains; i += 1) {
    nodes.push({ id: dom(i), kind: "domain" });
    edges.push({ from: "p", to: dom(i), type: "contains" });
    for (let c = 0; c < capsOf(i); c += 1) {
      const cap = `${dom(i)}-c${String(c).padStart(3, "0")}`;
      nodes.push({ id: cap, kind: "capability" });
      edges.push({ from: dom(i), to: cap, type: "contains" });
      for (let e = 0; e < (c + i) % 3; e += 1) {
        nodes.push({ id: `${cap}-e${e}`, kind: "element" });
        edges.push({ from: cap, to: `${cap}-e${e}`, type: "contains" });
      }
    }
  }
  nodes.push({ id: `${dom(0)}-held`, kind: "element" });
  edges.push({ from: dom(0), to: `${dom(0)}-held`, type: "contains" });
  nodes.push({ id: "stray", kind: "element" });
  for (const [a, b] of deps) edges.push({ from: `${dom(a)}-c000`, to: `${dom(b)}-c000`, type: "depends_on" });
  return { nodes, edges };
}

function lay(model: DialModel, memory: DialMemory | null): DialScene {
  return layoutDial(model, circularDomainOrder(model, memory?.order ?? null).order, tokens, memory);
}

function overviewScale(scene: DialScene) {
  const w = scene.extent.maxX - scene.extent.minX;
  const h = scene.extent.maxY - scene.extent.minY;
  return Math.min(1512 / w, 982 / h);
}

function moved(a: DialScene, b: DialScene, ids: Iterable<string>) {
  const out: [string, number][] = [];
  for (const id of ids) {
    const p = a.positions.get(id);
    const q = b.positions.get(id);
    if (p && q) out.push([id, Math.hypot(p.x - q.x, p.y - q.y)]);
  }
  return out;
}

function minClusterGap(scene: DialScene) {
  let min = Infinity;
  for (let i = 0; i < scene.clusters.length; i += 1) {
    for (let j = i + 1; j < scene.clusters.length; j += 1) {
      const a = scene.clusters[i]!;
      const b = scene.clusters[j]!;
      min = Math.min(min, Math.hypot(a.chip.x - b.chip.x, a.chip.y - b.chip.y) - a.footprint - b.footprint);
    }
  }
  return min;
}

function minItemDistance(scene: DialScene) {
  let min = Infinity;
  for (const c of scene.clusters) {
    for (let i = 0; i < c.items.length; i += 1) {
      for (let j = i + 1; j < c.items.length; j += 1) {
        min = Math.min(min, Math.hypot(c.items[i]!.x - c.items[j]!.x, c.items[i]!.y - c.items[j]!.y));
      }
    }
  }
  return min;
}

const storefront = vaultGraph(storefrontManifest);
const dogfood = vaultGraph(dogfoodManifest);
const fixtures = {
  storefront,
  dogfood,
  crafted: crafted(12, (i) => 1 + ((i * 7) % 23), [
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 1],
    [6, 1],
    [7, 2],
  ]),
};

describe("layoutDial", () => {
  for (const [name, graph] of Object.entries(fixtures)) {
    const model = modelOf(graph.nodes, graph.edges);
    const scene = lay(model, null);

    it(`${name}: is deterministic`, () => {
      const again = lay(modelOf(graph.nodes, graph.edges), null);
      expect([...again.positions]).toEqual([...scene.positions]);
      expect(again.memory.order).toEqual(scene.memory.order);
    });

    it(`${name}: keeps footprints apart by the angular gap`, () => {
      expect(minClusterGap(scene)).toBeGreaterThanOrEqual(tokens.angularGap * tokens.pitch - 1e-6);
    });

    it(`${name}: places every concept`, () => {
      const ids = graph.nodes.filter((n) => KINDS.has(n.kind)).map((n) => n.id);
      expect(ids.filter((id) => !scene.positions.has(id))).toEqual([]);
    });

    it(`${name}: keeps neighbouring capabilities a pitch apart`, () => {
      expect(minItemDistance(scene)).toBeGreaterThanOrEqual(0.99 * tokens.pitch);
    });

    it(`${name}: keeps a remembered radius that still fits`, () => {
      const radiusByStep = new Map([...scene.memory.radiusByStep].map(([s, r]) => [s, r * 1.3 + 0.123]));
      const next = lay(model, { ...scene.memory, radiusByStep });
      for (const ring of next.rings) expect(ring.radius).toBe(radiusByStep.get(ring.step));
    });
  }

  it("keeps two hundred capabilities a pitch apart in one cluster", () => {
    const g = crafted(3, (i) => (i === 0 ? 200 : 5), [[1, 0]]);
    expect(minItemDistance(lay(modelOf(g.nodes, g.edges), null))).toBeGreaterThanOrEqual(0.99 * tokens.pitch);
  });

  it("moves no capability and no domain when fifty elements arrive", () => {
    const base = fixtures.crafted;
    const model = modelOf(base.nodes, base.edges);
    const before = lay(model, null);
    const extra = { nodes: [...base.nodes], edges: [...base.edges] };
    for (let e = 0; e < 50; e += 1) {
      extra.nodes.push({ id: `extra-${e}`, kind: "element" });
      extra.edges.push({ from: "d03-c001", to: `extra-${e}`, type: "contains" });
    }
    const after = lay(modelOf(extra.nodes, extra.edges), before.memory);
    const marks = [...model.domainById.keys(), ...model.capabilityById.keys()];
    expect(moved(before, after, marks).filter(([, d]) => d > 0)).toEqual([]);
  });

  for (const name of ["storefront", "dogfood", "crafted"] as const) {
    const graph = fixtures[name];
    const model = modelOf(graph.nodes, graph.edges);
    const before = lay(model, null);
    const stepOf = (m: DialModel, id: string) => ladderStep(m.dependents.get(id) ?? 0);
    const caps = (domainId: string) => model.domainById.get(domainId)!.capabilityIds;
    type Kind = "same-step" | "fits" | "larger";
    const cases = new Map<Kind, { next: DialModel; target: string }>();
    for (const target of model.domains) {
      for (const source of model.domains) {
        if (source.id === target.id || !caps(source.id).length || !caps(target.id).length) continue;
        const edges = [...graph.edges, { from: caps(source.id)[0]!, to: caps(target.id)[0]!, type: "depends_on" }];
        const next = modelOf(graph.nodes, edges);
        if (next.dependents.get(target.id) === model.dependents.get(target.id)) continue;
        const step = stepOf(next, target.id);
        let kind: Kind = "same-step";
        if (step !== stepOf(model, target.id)) {
          const largest = Math.max(0, ...before.clusters.filter((c) => c.step === step).map((c) => c.footprint));
          kind = before.clusterByDomain.get(target.id)!.footprint <= largest ? "fits" : "larger";
        }
        if (!cases.has(kind)) cases.set(kind, { next, target: target.id });
      }
    }

    it.runIf(cases.has("same-step"))(`${name}: a dependency that crosses no step moves no mark`, () => {
      const after = lay(cases.get("same-step")!.next, before.memory);
      expect(moved(before, after, before.positions.keys()).filter(([, d]) => d > 0)).toEqual([]);
    });

    it.runIf(cases.has("fits"))(`${name}: a domain that fits its new ring moves at most two other domains`, () => {
      const { next, target } = cases.get("fits")!;
      const after = lay(next, before.memory);
      const threshold = 4 / overviewScale(before);
      const others = moved(before, after, model.domainById.keys()).filter(([id, d]) => id !== target && d > threshold);
      expect(others.length).toBeLessThanOrEqual(2);
      expect(after.clusterByDomain.get(target)!.step).not.toBe(before.clusterByDomain.get(target)!.step);
    });

    it.runIf(cases.has("larger"))(`${name}: a domain larger than its new ring keeps every other ring and order`, () => {
      const { next, target } = cases.get("larger")!;
      const after = lay(next, before.memory);
      const ringOrder = (scene: DialScene, step: number) => {
        const ids = scene.clusters
          .filter((c) => c.step === step && c.domainId !== target)
          .sort((x, y) => x.angle - y.angle)
          .map((c) => c.domainId);
        const first = [...ids].sort()[0];
        const at = first === undefined ? 0 : ids.indexOf(first);
        return [...ids.slice(at), ...ids.slice(0, at)];
      };
      for (const c of before.clusters) {
        if (c.domainId !== target) expect(after.clusterByDomain.get(c.domainId)!.step).toBe(c.step);
      }
      for (const ring of before.rings) expect(ringOrder(after, ring.step)).toEqual(ringOrder(before, ring.step));
    });
  }

  it("the crafted fixture has a domain larger than its new ring", () => {
    const g = fixtures.crafted;
    const model = modelOf(g.nodes, g.edges);
    const before = lay(model, null);
    const next = modelOf(g.nodes, [...g.edges, { from: "d05-c000", to: "d02-c000", type: "depends_on" }]);
    expect(ladderStep(next.dependents.get("d02")!)).toBe(1);
    const largest = Math.max(...before.clusters.filter((c) => c.step === 1).map((c) => c.footprint));
    expect(before.clusterByDomain.get("d02")!.footprint).toBeGreaterThan(largest);
  });

  it("returns the memory it laid out with", () => {
    const g = fixtures.crafted;
    const scene = lay(modelOf(g.nodes, g.edges), null);
    for (const c of scene.clusters) {
      expect(scene.memory.angleById.get(c.domainId)).toEqual({ step: c.step, angle: c.angle });
      expect(scene.memory.itemOrder.get(c.domainId)).toEqual(c.items.map((i) => i.id));
    }
    expect(scene.rings.map((r) => scene.memory.radiusByStep.get(r.step))).toEqual(scene.rings.map((r) => r.radius));
    expect(scene.orphans.ids).toEqual(["stray"]);
  });
});
