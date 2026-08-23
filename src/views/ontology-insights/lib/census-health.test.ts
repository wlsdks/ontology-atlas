import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeCensusHealth, computeInsightsCensus } from "./census-health";

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
  it("excludes the reserved reader guide from kind sums and density", () => {
    const nodes = [
      node("project:atlas", "project"),
      node("capability:inspect", "capability"),
      node("capability:verify", "capability"),
      node("vault-readme:README", "vault-readme"),
    ];
    const edges = [
      edge("project:atlas", "capability:inspect", "contains"),
      edge("project:atlas", "capability:verify", "contains"),
      edge("capability:inspect", "capability:verify", "depends_on"),
    ];

    const census = computeInsightsCensus(nodes, edges);
    expect(census.conceptCount).toBe(3);
    expect(census.relationCount).toBe(3);
    expect(Object.fromEntries(census.kindDistribution)).toEqual({
      project: 1,
      capability: 2,
    });
    expect(
      Array.from(census.kindDistribution.values()).reduce((sum, count) => sum + count, 0),
    ).toBe(census.conceptCount);

    const health = computeCensusHealth(nodes, edges, { orphans: [], warnings: [] });
    expect(health.edgesPerConcept).toBe(1);
  });

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
