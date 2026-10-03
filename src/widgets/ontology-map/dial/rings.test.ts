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
import { ladderStep, ringPlan } from "./rings";

const KINDS = new Set(["project", "domain", "capability", "element"]);

function modelOf(nodes: readonly { id: string; kind: string; title?: string }[], edges: readonly { from: string; to: string; type: string }[]) {
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

function vaultModel(manifest: unknown) {
  const derivation = deriveOntologyFromVault(manifest as VaultManifest);
  return modelOf(derivation.nodes, derivation.edges);
}

function stepsByName(model: ReturnType<typeof modelOf>) {
  const out: Record<string, number> = {};
  for (const ring of ringPlan(model)) for (const id of ring.domainIds) out[id.replace(/^.*[/:]/, "")] = ring.step;
  return out;
}

describe("ladderStep", () => {
  it("doubles per step and caps at five", () => {
    expect([0, 1, 2, 3, 4, 7, 8, 15, 16, 31, 32, 500].map(ladderStep)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
});

describe("dependents and rings", () => {
  it("counts distinct source domains, not edges", () => {
    const model = modelOf(
      [
        { id: "a", kind: "domain" },
        { id: "b", kind: "domain" },
        { id: "c", kind: "domain" },
        { id: "a1", kind: "capability" },
        { id: "a2", kind: "capability" },
        { id: "b1", kind: "capability" },
        { id: "c1", kind: "capability" },
      ],
      [
        { from: "a", to: "a1", type: "contains" },
        { from: "a", to: "a2", type: "contains" },
        { from: "b", to: "b1", type: "contains" },
        { from: "c", to: "c1", type: "contains" },
        { from: "a1", to: "b1", type: "depends_on" },
        { from: "a2", to: "b1", type: "depends_on" },
        { from: "c1", to: "b1", type: "depends_on" },
        { from: "a1", to: "a2", type: "depends_on" },
      ],
    );
    expect(Object.fromEntries(model.dependents)).toEqual({ a: 0, b: 2, c: 0 });
    expect(ringPlan(model)).toEqual([
      { step: 1, domainIds: ["b"] },
      { step: 0, domainIds: ["a", "c"] },
    ]);
  });

  it("storefront: three rings by dependents", () => {
    expect(stepsByName(vaultModel(storefrontManifest))).toEqual({
      inventory: 2,
      order: 2,
      catalog: 1,
      marketing: 1,
      payment: 1,
      fulfillment: 1,
      customer: 0,
      loyalty: 0,
      support: 0,
    });
  });

  it("dogfood: two rings by dependents", () => {
    expect(stepsByName(vaultModel(dogfoodManifest))).toEqual({
      "meaning-layer": 1,
      "code-evidence": 1,
      "agent-access": 0,
      "human-workbench": 0,
    });
  });
});
