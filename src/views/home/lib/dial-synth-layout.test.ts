import { describe, expect, it } from "vitest";

import dogfoodManifest from "@/entities/docs-vault/data/manifest.json";
import storefrontManifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import type { VaultManifest } from "@/entities/docs-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";
import { buildDialModel } from "@/widgets/ontology-map/dial/dial-model";
import { layoutDial } from "@/widgets/ontology-map/dial/layout";
import { circularDomainOrder } from "@/widgets/ontology-map/dial/order";
import type { DialMemory, DialModel, DialScene } from "@/widgets/ontology-map/dial/types";
import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "@/widgets/ontology-map/model/containment-tree";

import { synthesizeVaultGraph } from "./synth-vault";

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

function lay(model: DialModel, memory: DialMemory | null): DialScene {
  return layoutDial(model, circularDomainOrder(model, memory?.order ?? null).order, tokens, memory);
}

function replayDriftPx(nodes: readonly Node[], edges: readonly Edge[]): number {
  const elements = new Set(nodes.filter((n) => n.kind === "element").map((n) => n.id));
  const capTier = modelOf(
    nodes.filter((n) => !elements.has(n.id)),
    edges.filter((e) => !elements.has(e.from) && !elements.has(e.to)),
  );
  const first = lay(capTier, null);
  const full = lay(modelOf(nodes, edges), first.memory);
  let max = 0;
  for (const id of [...capTier.domainById.keys(), ...capTier.capabilityById.keys()]) {
    const a = first.positions.get(id)!;
    const b = full.positions.get(id)!;
    max = Math.max(max, Math.hypot(a.x - b.x, a.y - b.y));
  }
  const w = full.extent.maxX - full.extent.minX;
  const h = full.extent.maxY - full.extent.minY;
  return max * Math.min(1512 / w, 982 / h);
}

function vault(manifest: unknown) {
  const d = deriveOntologyFromVault(manifest as VaultManifest);
  return { nodes: d.nodes as Node[], edges: d.edges as Edge[] };
}

describe("dial layout on real and synthetic vaults", () => {
  it("streaming replay: real vaults hold every capability when elements arrive", () => {
    const storefront = vault(storefrontManifest);
    const dogfood = vault(dogfoodManifest);
    expect(replayDriftPx(storefront.nodes, storefront.edges)).toBe(0);
    expect(replayDriftPx(dogfood.nodes, dogfood.edges)).toBe(0);
  });

  it("streaming replay: synth 2,000 moves at most 4 px after the capability tier", () => {
    const synth = synthesizeVaultGraph(2000);
    expect(replayDriftPx(synth.nodes, synth.edges)).toBeLessThanOrEqual(4);
  });

  for (const [total, shape] of [
    [2000, "uniform"],
    [10000, "uniform"],
    [10000, "layered"],
  ] as const) {
    it(`synth ${total} ${shape}: every concept placed, footprints apart, capabilities a pitch apart`, () => {
      const graph = synthesizeVaultGraph(total, { shape });
      const scene = lay(modelOf(graph.nodes, graph.edges), null);
      expect(graph.nodes.filter((n) => KINDS.has(n.kind) && !scene.positions.has(n.id)).map((n) => n.id)).toEqual([]);
      let gap = Infinity;
      for (let i = 0; i < scene.clusters.length; i += 1) {
        for (let j = i + 1; j < scene.clusters.length; j += 1) {
          const a = scene.clusters[i]!;
          const b = scene.clusters[j]!;
          gap = Math.min(gap, Math.hypot(a.chip.x - b.chip.x, a.chip.y - b.chip.y) - a.footprint - b.footprint);
        }
      }
      expect(gap).toBeGreaterThanOrEqual(tokens.angularGap * tokens.pitch - 1e-6);
      for (const c of scene.clusters) {
        if (c.items.length > 200) continue;
        for (let i = 0; i < c.items.length; i += 1) {
          for (let j = i + 1; j < c.items.length; j += 1) {
            expect(Math.hypot(c.items[i]!.x - c.items[j]!.x, c.items[i]!.y - c.items[j]!.y)).toBeGreaterThanOrEqual(0.99 * tokens.pitch);
          }
        }
      }
    });
  }
});
