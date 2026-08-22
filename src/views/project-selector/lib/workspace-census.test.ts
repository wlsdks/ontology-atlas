import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeWorkspaceCensus } from "./workspace-census";

function node(id: string, kind: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

function edge(id: string, from: string, to: string, type = "contains"): KnowledgeGraphEdge {
  return { id, from, to, type, projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "test" };
}

describe("computeWorkspaceCensus", () => {
  // Contract change: the "concepts" census is canonical (the whole derivation) — correcting the
  // `meaningful` filter that produced a -5 disagreement with other surfaces. The filter is for the kind
  // bars only.
  it("counts EVERY derived node as a concept (canonical census — no kind filter)", () => {
    const nodes = [
      node("project:atlas", "project"),
      node("document:readme", "document"),
      node("domain:views", "domain"),
      node("capability:mcp-server", "capability"),
      node("element:cli", "element"),
      node("unknown:stub-1", "unknown"),
    ];
    const edges = [edge("e1", "project:atlas", "domain:views")];

    const census = computeWorkspaceCensus(nodes, edges, 1);

    expect(census).toEqual({
      projectCount: 1,
      domainCount: 1,
      conceptCount: 6,
      relationCount: 1,
    });
  });

  it("is the single formula reused for both the crumbs census and the page header censusline", () => {
    // Same inputs → same shape regardless of caller — a unified formula, not
    // two independently-derived counts that could drift apart.
    const nodes = [node("domain:a", "domain"), node("domain:b", "domain")];
    const edges: KnowledgeGraphEdge[] = [];

    const first = computeWorkspaceCensus(nodes, edges, 2);
    const second = computeWorkspaceCensus(nodes, edges, 2);

    expect(first).toEqual(second);
    expect(first.domainCount).toBe(2);
  });

  it("returns zeros for an empty vault", () => {
    expect(computeWorkspaceCensus([], [], 0)).toEqual({
      projectCount: 0,
      domainCount: 0,
      conceptCount: 0,
      relationCount: 0,
    });
  });
});
