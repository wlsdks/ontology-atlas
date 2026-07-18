import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildDomainCompositionRows } from "./domain-composition";

function node(id: string, kind: string, title: string, projectIds: string[] = []): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds,
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

function edge(id: string, from: string, to: string, type = "contains"): KnowledgeGraphEdge {
  return { id, from, to, type, projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "test" };
}

describe("buildDomainCompositionRows", () => {
  it("walks containment to count capability/element descendants per domain, sorted by total desc", () => {
    const nodes = [
      node("domain:views", "domain", "Views", ["atlas"]),
      node("domain:agent", "domain", "AI Agent Partner", ["atlas"]),
      node("capability:map", "capability", "Map", ["atlas"]),
      node("capability:mcp", "capability", "MCP", ["atlas"]),
      node("element:canvas", "element", "Canvas", ["atlas"]),
      node("element:cli", "element", "CLI", ["atlas"]),
      node("element:parser", "element", "Parser", ["atlas"]),
    ];
    const edges = [
      edge("e1", "domain:views", "capability:map"),
      edge("e2", "capability:map", "element:canvas"),
      edge("e3", "domain:agent", "capability:mcp"),
      edge("e4", "capability:mcp", "element:cli"),
      edge("e5", "capability:mcp", "element:parser"),
    ];

    const rows = buildDomainCompositionRows(nodes, edges);

    expect(rows).toEqual([
      {
        domainId: "domain:agent",
        title: "AI Agent Partner",
        capabilityCount: 1,
        elementCount: 2,
        total: 3,
      },
      {
        domainId: "domain:views",
        title: "Views",
        capabilityCount: 1,
        elementCount: 1,
        total: 2,
      },
    ]);
  });

  it("also follows belongs_to edges (reverse containment) and de-dupes cycles", () => {
    const nodes = [
      node("domain:views", "domain", "Views"),
      node("capability:map", "capability", "Map"),
    ];
    // belongs_to is the reverse direction: capability belongs_to domain.
    const edges = [edge("e1", "capability:map", "domain:views", "belongs_to")];

    const rows = buildDomainCompositionRows(nodes, edges);

    expect(rows).toEqual([
      { domainId: "domain:views", title: "Views", capabilityCount: 1, elementCount: 0, total: 1 },
    ]);
  });

  it("omits domains with no capability/element descendants", () => {
    const nodes = [node("domain:empty", "domain", "Empty")];
    const rows = buildDomainCompositionRows(nodes, []);
    expect(rows).toEqual([]);
  });
});
