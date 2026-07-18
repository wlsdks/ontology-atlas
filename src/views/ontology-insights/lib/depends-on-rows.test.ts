import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildDependsOnRows } from "./depends-on-rows";

function node(id: string, title = id): KnowledgeGraphNode {
  return { id, title, kind: "capability", projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "vault-frontmatter" };
}
function edge(from: string, to: string, type: string): KnowledgeGraphEdge {
  return { id: `${from}--${type}-->${to}`, from, to, type, projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "vault-frontmatter" };
}

describe("buildDependsOnRows", () => {
  const nodes = [
    node("capability:topology", "Topology Map Canvas"),
    node("capability:mcp", "MCP Server (24 tools)"),
    node("capability:onboarding", "Agent Onboarding Brief"),
  ];

  it("collapses duplicate depends_on edges between the same pair into one row with a count", () => {
    const edges = [
      edge("capability:topology", "capability:mcp", "depends_on"),
      edge("capability:topology", "capability:mcp", "depends_on"),
      edge("capability:onboarding", "capability:mcp", "depends_on"),
    ];
    const rows = buildDependsOnRows(nodes, edges);
    expect(rows).toEqual([
      { fromId: "capability:topology", fromTitle: "Topology Map Canvas", toId: "capability:mcp", toTitle: "MCP Server (24 tools)", count: 2 },
      { fromId: "capability:onboarding", fromTitle: "Agent Onboarding Brief", toId: "capability:mcp", toTitle: "MCP Server (24 tools)", count: 1 },
    ]);
  });

  it("ignores non depends_on edges and edges pointing at unknown nodes", () => {
    const edges = [
      edge("capability:topology", "capability:mcp", "relates"),
      edge("capability:topology", "capability:ghost", "depends_on"),
    ];
    expect(buildDependsOnRows(nodes, edges)).toEqual([]);
  });

  it("truncates to the limit, highest count first", () => {
    const many = Array.from({ length: 8 }, (_, i) => node(`capability:t${i}`, `T${i}`));
    const edges = many.map((n) => edge(n.id, "capability:mcp", "depends_on"));
    const rows = buildDependsOnRows([...many, ...nodes], edges, 3);
    expect(rows).toHaveLength(3);
  });
});
