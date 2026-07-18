import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildProjectCardFacts } from "./project-card-facts";

function node(id: string, kind: string, projectIds: string[] = []): KnowledgeGraphNode {
  return {
    id,
    title: id,
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

describe("buildProjectCardFacts", () => {
  it("counts owned nodes by kind and relations induced between owned nodes only", () => {
    const nodes = [
      node("project:atlas", "project", []),
      node("domain:views", "domain", ["atlas"]),
      node("capability:mcp", "capability", ["atlas"]),
      node("element:cli", "element", ["atlas"]),
      node("document:readme", "document", ["atlas"]),
      // Belongs to a different project — must not leak into atlas's counts.
      node("domain:other", "domain", ["other-project"]),
    ];
    const edges = [
      edge("e1", "domain:views", "capability:mcp"),
      edge("e2", "capability:mcp", "element:cli"),
      // Crosses project boundary — must not be counted for atlas.
      edge("e3", "domain:views", "domain:other"),
    ];

    const facts = buildProjectCardFacts(nodes, edges, "atlas", false);

    expect(facts).toEqual({
      domain: 1,
      capability: 1,
      element: 1,
      document: 1,
      relations: 2,
    });
  });

  it("falls back to counting every non-project node when singleProjectFallback is set", () => {
    const nodes = [
      node("project:atlas", "project", []),
      node("domain:views", "domain", []),
      node("capability:mcp", "capability", []),
    ];
    const edges = [edge("e1", "domain:views", "capability:mcp")];

    const facts = buildProjectCardFacts(nodes, edges, "atlas", true);

    expect(facts.domain).toBe(1);
    expect(facts.capability).toBe(1);
    expect(facts.relations).toBe(1);
  });

  it("returns all zeros for a project with no tagged nodes and no fallback", () => {
    const facts = buildProjectCardFacts([], [], "atlas", false);
    expect(facts).toEqual({ domain: 0, capability: 0, element: 0, document: 0, relations: 0 });
  });
});
