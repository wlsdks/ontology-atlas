import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { resolveTopologySelectedOntologyNode } from "./resolve-topology-selected-node";

const stamp = new Date(0);

function node(
  id: string,
  evidenceIds: string[] = [id],
  kind = "capability",
): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds,
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
  };
}

describe("resolveTopologySelectedOntologyNode", () => {
  const nodes = [
    node("capability:topology-analysis-modes", [
      "capabilities/topology-analysis-modes",
    ]),
    node("domain:views", ["ontology/domains/views"], "domain"),
  ];

  it("resolves graph ids used by Sigma clicks", () => {
    expect(
      resolveTopologySelectedOntologyNode("capability:topology-analysis-modes", nodes),
    ).toMatchObject({ id: "capability:topology-analysis-modes" });
  });

  it("resolves vault slugs used by shareable topology URLs", () => {
    expect(
      resolveTopologySelectedOntologyNode("capabilities/topology-analysis-modes", nodes),
    ).toMatchObject({ id: "capability:topology-analysis-modes" });
  });

  it("resolves docs-vault ontology-prefixed evidence ids", () => {
    expect(resolveTopologySelectedOntologyNode("domains/views", nodes)).toMatchObject({
      id: "domain:views",
    });
  });
});
