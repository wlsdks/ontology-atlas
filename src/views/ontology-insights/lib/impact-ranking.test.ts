import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildImpactRanking } from "./impact-ranking";

const AT = new Date(0);

function node(id: string, kind = "capability", title = id): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: AT,
    lastApprovedBy: "test",
  };
}

function edge(from: string, to: string, type: KnowledgeGraphEdge["type"]): KnowledgeGraphEdge {
  return {
    id: `${from}--${type}-->${to}`,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: AT,
    lastApprovedBy: "test",
  };
}

describe("buildImpactRanking", () => {
  it("ranks the concepts with the most dependents first and counts direct and transitive separately", () => {
    // c → b → a  (the arrow is depends_on: the left depends on the right)
    //     d → a
    const nodes = [node("a"), node("b"), node("c"), node("d")];
    const edges = [
      edge("b", "a", "depends_on"),
      edge("c", "b", "depends_on"),
      edge("d", "a", "depends_on"),
    ];

    const { rows, rankedCount } = buildImpactRanking(nodes, edges, 6);

    expect(rows.map((r) => [r.id, r.direct, r.total])).toEqual([
    // Changing `a` makes b and d direct, and c an indirect, re-check target.
      ["a", 2, 3],
      ["b", 1, 1],
    ]);
    // c and d have zero blast radius and do not enter the ranking — a row with no signal wastes ink.
    expect(rankedCount).toBe(2);
  });

  it("does not count related_to or describes as impact", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge("b", "a", "related_to"), edge("c", "a", "describes")];

    expect(buildImpactRanking(nodes, edges, 6).rows).toEqual([]);
  });

  it("excludes contains from impact as structure, not causation", () => {
    const nodes = [node("d", "domain"), node("x"), node("y")];
    const edges = [edge("d", "x", "contains"), edge("x", "y", "contains")];

    expect(buildImpactRanking(nodes, edges, 6).rows).toEqual([]);
  });

  it("truncates past the display cap and reports the full count", () => {
    const nodes = [node("hub"), node("a"), node("b"), node("c")];
    const edges = [
      edge("a", "hub", "depends_on"),
      edge("b", "hub", "depends_on"),
      edge("c", "b", "depends_on"),
    ];

    const { rows, rankedCount } = buildImpactRanking(nodes, edges, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("hub");
    expect(rankedCount).toBe(2);
  });

  it("returns an empty ranking for a vault without relations", () => {
    expect(buildImpactRanking([node("a"), node("b")], [], 6)).toEqual({
      declaredDependencyEdges: 0,
      declaredWithRationaleEdges: 0,
      rows: [],
      rankedCount: 0,
      evidenceRows: [],
      evidenceRankedCount: 0,
    });
  });

  it("uses the display name when present", () => {
    const a = { ...node("a"), display: "결제" };
    const { rows } = buildImpactRanking([a, node("b")], [edge("b", "a", "depends_on")], 6);
    expect(rows[0].title).toBe("결제");
  });

  describe("evidence layer split", () => {
    // The situation where the largest blast radius is a derived concept with no document — the
    // arrangement that actually occurred in the dogfood vault (11 of the top 12 rows were derived code paths).
    const stub = {
      ...node("element:integration-test", "element", "cli/src/integration.test.mjs"),
      hasOwnDocument: false,
      ref: "cli/src/integration.test.mjs",
    };
    const nodes = [node("capability:login"), node("capability:pay"), node("domain:auth"), stub];
    const edges = [
      edge("capability:pay", "capability:login", "depends_on"),
      edge("domain:auth", "capability:login", "depends_on"),
      edge("capability:login", "element:integration-test", "depends_on"),
      edge("capability:pay", "element:integration-test", "depends_on"),
      edge("domain:auth", "element:integration-test", "depends_on"),
    ];

    it("moves a concept without a document from the concept layer to the evidence layer", () => {
      const ranking = rank();
      expect(ranking.rows.map((row) => row.id)).not.toContain("element:integration-test");
      expect(ranking.evidenceRows.map((row) => row.id)).toEqual(["element:integration-test"]);
    // Per-layer totals are counted separately — mixing them in the "top N / M total" copy leaves a
    // user unable to tell the scale of the list they are looking at.
      expect(ranking.rankedCount).toBe(1);
      expect(ranking.evidenceRankedCount).toBe(1);
    });

    it("counts over the whole graph so the split does not change impact counts", () => {
      const ranking = rank();
    // Removing derived concepts from the graph before measuring would give one concept different
    // numbers on screen and from the agent (violating the MCP blast_radius contract). 3 is the three that cited it.
      expect(ranking.evidenceRows[0].total).toBe(3);
      expect(ranking.rows[0].id).toBe("capability:login");
      expect(ranking.rows[0].total).toBe(2);
    });

    it("carries the raw reference in the evidence layer to tell same-named files apart", () => {
      expect(rank().evidenceRows[0].ref).toBe("cli/src/integration.test.mjs");
    });

    function rank() {
      return buildImpactRanking(nodes, edges, 12);
    }
  });
});
