import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildStudioMap } from "./build-studio-map";

function node(id: string, kind: string, extra: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "",
    ...extra,
  };
}

function edge(from: string, to: string, type: string, extra: Partial<KnowledgeGraphEdge> = {}): KnowledgeGraphEdge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "",
    ...extra,
  };
}

const NODES: KnowledgeGraphNode[] = [
  node("domain:pay", "domain"),
  node("cap:approve", "capability"),
  node("cap:stock", "capability"),
  node("cap:refund", "capability"),
  node("el:gateway", "element"),
  node("cap:far", "capability"), // two hops away — must NOT be included
];
const EDGES: KnowledgeGraphEdge[] = [
  edge("domain:pay", "cap:approve", "contains"),
  edge("cap:approve", "el:gateway", "contains", { evidenceIds: ["doc:gw"] }),
  edge("cap:approve", "cap:stock", "depends_on", { evidenceIds: ["doc:s"] }),
  edge("cap:approve", "cap:refund", "related_to", { evidenceIds: ["doc:r"] }),
  edge("cap:stock", "cap:far", "depends_on"), // beyond the ego boundary
];

describe("buildStudioMap", () => {
  it("scopes to the focal node + its direct neighbors only (ego world)", () => {
    const { nodes } = buildStudioMap("cap:approve", NODES, EDGES);
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids).toEqual(new Set(["cap:approve", "domain:pay", "el:gateway", "cap:stock", "cap:refund"]));
    expect(ids.has("cap:far")).toBe(false);
  });

  it("forces the focal node to be the single amber hub", () => {
    const { nodes } = buildStudioMap("cap:approve", NODES, EDGES);
    expect(nodes.filter((n) => n.isHub).map((n) => n.id)).toEqual(["cap:approve"]);
  });

  it("keeps only edges among the ego set and classifies relation quality", () => {
    const { edges } = buildStudioMap("cap:approve", NODES, EDGES);
    // The cap:stock -> cap:far edge leaves the ego set and is dropped.
    expect(edges.some((e) => e.target === "cap:far")).toBe(false);
    const containsElement = edges.find((e) => e.source === "cap:approve" && e.target === "el:gateway");
    expect(containsElement?.kind).toBe("contains");
    expect(containsElement?.relationQuality).toBe("strong"); // evidenced + structural
    const relates = edges.find((e) => e.target === "cap:refund");
    expect(relates?.kind).toBe("depends");
    expect(relates?.relationQuality).toBe("weak"); // related_to is the loosest
  });

  it("returns an empty graph for an unknown / non-renderable focal node", () => {
    expect(buildStudioMap("cap:missing", NODES, EDGES)).toEqual({ nodes: [], edges: [] });
  });
});
