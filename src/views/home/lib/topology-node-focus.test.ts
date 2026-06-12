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
  extra: Partial<KnowledgeGraphEdge> = {},
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
    ...extra,
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
      edge("cap->sdk", selected.id, "elements/mcp-sdk", "uses", {
        evidenceIds: ["src/mcp.ts"],
      }),
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
          relationQuality: "strong",
          evidenceCount: 1,
          authored: true,
        },
        {
          id: "domains/ai-agent-partner",
          title: "domains/ai-agent-partner",
          kind: "domain",
          direction: "outgoing",
          relationType: "related_to",
          relationQuality: "weak",
          evidenceCount: 0,
          authored: true,
        },
        {
          id: "domains/ai-agent-partner",
          title: "domains/ai-agent-partner",
          kind: "domain",
          direction: "incoming",
          relationType: "contains",
          relationQuality: "supported",
          evidenceCount: 0,
          authored: true,
        },
      ],
      relationQuality: {
        strong: 1,
        supported: 1,
        weak: 1,
        review: 0,
      },
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
      [
        edge("orphan->missing", selected.id, "elements/missing", "uses", {
          lastApprovedBy: "",
        }),
      ],
    );
    const focus = buildTopologyNodeFocus(selected, model);

    expect(focus.connections).toEqual([
      {
        id: "orphan->missing",
        title: "orphan->missing",
        kind: "unknown",
        direction: "outgoing",
        relationType: "uses",
        relationQuality: "review",
        evidenceCount: 0,
        authored: false,
      },
    ]);
    expect(focus.relationQuality).toEqual({
      strong: 0,
      supported: 0,
      weak: 0,
      review: 1,
    });
    expect(focus.summary).toBeNull();
  });
});
