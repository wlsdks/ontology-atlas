import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  resolveAgentFocusNodeId,
  resolveOntologyRelationPreview,
} from "./resolve-agent-focus-node";

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

describe("resolveAgentFocusNodeId", () => {
  const nodes = [
    node("capability:agent-live-activity-contract", [
      "capabilities/agent-live-activity-contract",
    ]),
    node("domain:views", ["ontology/domains/views"], "domain"),
  ];

  it("resolves the CLI heartbeat's plural-folder slug form", () => {
    expect(
      resolveAgentFocusNodeId("capabilities/agent-live-activity-contract", nodes),
    ).toBe("capability:agent-live-activity-contract");
  });

  it("resolves a canonical kind:slug id unchanged", () => {
    expect(
      resolveAgentFocusNodeId("capability:agent-live-activity-contract", nodes),
    ).toBe("capability:agent-live-activity-contract");
  });

  it("resolves a bare slug via the endsWith fallback", () => {
    expect(resolveAgentFocusNodeId("views", nodes)).toBe("domain:views");
  });

  it("returns null when the slug is null", () => {
    expect(resolveAgentFocusNodeId(null, nodes)).toBeNull();
  });

  it("returns null when nothing matches (never fabricates a node)", () => {
    expect(resolveAgentFocusNodeId("capabilities/does-not-exist", nodes)).toBeNull();
  });

  it("returns null when the node list is empty/undefined", () => {
    expect(resolveAgentFocusNodeId("capabilities/agent-live-activity-contract", [])).toBeNull();
    expect(
      resolveAgentFocusNodeId("capabilities/agent-live-activity-contract", undefined),
    ).toBeNull();
  });

  it("관계 변경안의 두 vault slug를 실제 지도 node id로 함께 해석한다", () => {
    expect(
      resolveOntologyRelationPreview(
        {
          sourceSlug: "capabilities/agent-live-activity-contract",
          targetSlug: "domains/views",
          relationType: "depends_on",
          phase: "draft",
        },
        nodes,
      ),
    ).toEqual({
      sourceId: "capability:agent-live-activity-contract",
      targetId: "domain:views",
      relationType: "depends_on",
      phase: "draft",
    });
  });

  it("두 끝점 중 하나라도 지도에 없으면 관계를 지어내지 않는다", () => {
    expect(
      resolveOntologyRelationPreview(
        {
          sourceSlug: "capabilities/agent-live-activity-contract",
          targetSlug: "domains/missing",
          relationType: "depends_on",
          phase: "committing",
        },
        nodes,
      ),
    ).toBeNull();
  });
});
