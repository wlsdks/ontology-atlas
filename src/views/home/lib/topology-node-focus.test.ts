import { describe, expect, it } from "vitest";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildTopologyOntologyDrawerModel } from "./topology-ontology-drawer";
import { buildTopologyNodeFocus } from "./topology-node-focus";

const stamp = new Date(0);

function node(
  id: string,
  kind = "capability",
  evidenceIds: string[] = [id],
  extra: Partial<KnowledgeGraphNode> = {},
): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds,
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
    ...extra,
  };
}

function edge(
  id: string,
  from: string,
  to: string,
  type = "depends_on",
): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
  };
}

describe("buildTopologyNodeFocus", () => {
  it("projects a node + drawer model into a compact focus view with plain-language counts and direct connections", () => {
    const selected = node("capabilities/mcp-server", "capability", [
      "capabilities/mcp-server",
    ], { title: "MCP Server", summary: "AI agent surface." });
    const nodes = [
      selected,
      node("domains/ai-agent-partner", "domain"),
      node("elements/mcp-sdk", "element"),
    ];
    const edges = [
      edge("domain->cap", "domains/ai-agent-partner", selected.id, "contains"),
      edge("cap->sdk", selected.id, "elements/mcp-sdk", "uses"),
      edge("cap->domain", selected.id, "domains/ai-agent-partner", "related_to"),
    ];
    const model = buildTopologyOntologyDrawerModel(selected, nodes, edges);

    expect(buildTopologyNodeFocus(selected, model)).toEqual({
      id: "capabilities/mcp-server",
      title: "MCP Server",
      kind: "capability",
      summary: "AI agent surface.",
      sourceSlug: "capabilities/mcp-server",
      usedByCount: 1, // incoming — "이 노드를 쓰는 곳"
      dependsOnCount: 2, // outgoing — "이 노드가 기대는 곳"
      connections: [
        {
          id: "elements/mcp-sdk",
          title: "elements/mcp-sdk",
          kind: "element",
          direction: "outgoing",
          relationType: "uses",
        },
        {
          id: "domains/ai-agent-partner",
          title: "domains/ai-agent-partner",
          kind: "domain",
          direction: "outgoing",
          relationType: "related_to",
        },
        {
          id: "domains/ai-agent-partner",
          title: "domains/ai-agent-partner",
          kind: "domain",
          direction: "incoming",
          relationType: "contains",
        },
      ],
      hiddenConnectionCount: 0,
    });
  });

  it("caps the connection list at the drawer preview limit and reports the hidden remainder", () => {
    const selected = node("capabilities/hub");
    const neighbors = Array.from({ length: 8 }, (_, i) =>
      node(`elements/dep-${i}`, "element"),
    );
    const nodes = [selected, ...neighbors];
    const edges = neighbors.map((n, i) =>
      edge(`hub->${i}`, selected.id, n.id, "depends_on"),
    );
    // previewLimit 3 → 3 표시, 나머지 5 는 hidden.
    const model = buildTopologyOntologyDrawerModel(selected, nodes, edges, 3);
    const focus = buildTopologyNodeFocus(selected, model);

    expect(focus.usedByCount).toBe(0);
    expect(focus.dependsOnCount).toBe(8);
    expect(focus.connections).toHaveLength(3);
    expect(focus.hiddenConnectionCount).toBe(5);
  });

  it("falls back to the edge id and unknown kind for an unresolved neighbor", () => {
    const selected = node("capabilities/orphan");
    // edge points at a node that is NOT in the nodes list → other is null.
    const model = buildTopologyOntologyDrawerModel(
      selected,
      [selected],
      [edge("orphan->missing", selected.id, "elements/missing", "uses")],
    );
    const focus = buildTopologyNodeFocus(selected, model);

    expect(focus.connections).toEqual([
      {
        id: "orphan->missing",
        title: "orphan->missing",
        kind: "unknown",
        direction: "outgoing",
        relationType: "uses",
      },
    ]);
    expect(focus.summary).toBeNull();
  });
});
