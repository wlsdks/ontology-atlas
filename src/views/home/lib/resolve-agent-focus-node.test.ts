import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { resolveAgentFocusNodeId } from "./resolve-agent-focus-node";

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
});
