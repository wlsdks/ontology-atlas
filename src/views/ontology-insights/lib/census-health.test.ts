import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeCensusHealth } from "./census-health";

function node(id: string, kind: string, opts: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
    ...opts,
  };
}

function edge(from: string, to: string, type: string): KnowledgeGraphEdge {
  return { id: `${from}--${type}-->${to}`, from, to, type, projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "vault-frontmatter" };
}

describe("computeCensusHealth", () => {
  it("derives edge/concept ratio, orphans, cycles, domain membership %, evidence %", () => {
    const nodes = [
      node("domain:views", "domain"),
      node("capability:a", "capability", { evidenceIds: ["doc-a"] }),
      node("capability:b", "capability"),
      node("element:a1", "element", { evidenceIds: ["doc-a"] }),
      node("element:orphan", "element"),
    ];
    const edges = [
      edge("domain:views", "capability:a", "contains"),
      edge("domain:views", "capability:b", "contains"),
      edge("capability:a", "element:a1", "contains"),
      edge("capability:a", "capability:b", "depends_on"),
    ];
    const tree = { orphans: [nodes[4]], warnings: [] as string[] };

    const health = computeCensusHealth(nodes, edges, tree);

    expect(health.edgesPerConcept).toBe(0.8); // 4 edges / 5 nodes
    expect(health.orphanCount).toBe(1);
    expect(health.cycleCount).toBe(0);
    // domain-eligible = capability:a, capability:b, element:a1, element:orphan (4)
    // with domain ancestor = capability:a, capability:b, element:a1 (3) -> 75%
    expect(health.domainMembershipPct).toBe(75);
    // content kinds = domain + capability*2 + element*2 = 5, with evidence = 2 -> 40%
    expect(health.evidenceLinkedPct).toBe(40);
  });

  it("counts cycle-detected warnings only, ignoring other warning kinds", () => {
    const nodes = [node("domain:x", "domain")];
    const tree = {
      orphans: [],
      warnings: [
        'cycle detected at "capability:a" — promoted to root',
        'node "capability:b" has multiple parents — keeping first',
        'cycle detected at "capability:c" — promoted to root',
      ],
    };
    const health = computeCensusHealth(nodes, [], tree);
    expect(health.cycleCount).toBe(2);
  });

  it("returns zeros for an empty graph without dividing by zero", () => {
    const health = computeCensusHealth([], [], { orphans: [], warnings: [] });
    expect(health).toEqual({
      edgesPerConcept: 0,
      orphanCount: 0,
      cycleCount: 0,
      domainMembershipPct: 0,
      evidenceLinkedPct: 0,
    });
  });
});
