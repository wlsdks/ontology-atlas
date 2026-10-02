import { describe, expect, it } from "vitest";

import { isContainmentRelation } from "@/entities/knowledge-graph";
import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "@/widgets/ontology-map/model/containment-tree";
import { buildDialModel } from "@/widgets/ontology-map/dial/dial-model";
import { ringPlan } from "@/widgets/ontology-map/dial/rings";

import { synthesizeVaultGraph, type SynthShape } from "./synth-vault";

const KINDS = new Set(["project", "domain", "capability", "element"]);

function ringsOf(shape: SynthShape) {
  const graph = synthesizeVaultGraph(10000, { dependencies: true, shape });
  const nodes: TreeInputNode[] = graph.nodes
    .filter((n) => KINDS.has(n.kind))
    .map((n) => ({ id: n.id, label: n.title, kind: n.kind as TreeInputNode["kind"] }));
  const edges: TreeInputEdge[] = graph.edges.map((e) => ({
    source: e.from,
    target: e.to,
    kind: isContainmentRelation(e.type) ? "contains" : "depends",
    relationType: e.type,
  }));
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  const flows = rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges));
  const elementIds = nodes.filter((n) => n.kind === "element").map((n) => n.id);
  return ringPlan(buildDialModel({ tree, dependencies, flows, elementIds })).map((r) => [r.step, r.domainIds.length]);
}

describe("dial rings on the synthetic vault", () => {
  it("uniform 10,000: one ring of 33 domains at step 1", () => {
    expect(ringsOf("uniform")).toEqual([[1, 33]]);
  });

  it("layered 10,000: four rings, 2 / 14 / 14 / 3", () => {
    expect(ringsOf("layered").map(([, count]) => count)).toEqual([3, 12, 15, 3]);
  });
});
