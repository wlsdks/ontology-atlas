import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildImpactRanking } from "./impact-ranking";
import { buildOntologyReachability, buildReachabilityIndex, IMPACT_RELATION_TYPES } from "@/entities/knowledge-graph";

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
    // Here c depends on b, b on a, and d on a.
    const nodes = [node("a"), node("b"), node("c"), node("d")];
    const edges = [
      edge("b", "a", "depends_on"),
      edge("c", "b", "depends_on"),
      edge("d", "a", "depends_on"),
    ];

    const { rows, rankedCount } = buildImpactRanking(nodes, edges, 6);

    expect(rows.map((r) => [r.id, r.direct, r.total])).toEqual([
    // Changing `a` makes b and d direct and c an indirect re-check target.
      ["a", 2, 3],
      ["b", 1, 1],
    ]);
    // Nodes with zero blast radius do not enter the ranking.
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

  it("counts repeated paths once, excludes the origin in cycles and follows unresolved intermediates", () => {
    const nodes = [node("a"), node("b"), node("c"), node("d")];
    const edges = [
      edge("b", "c", "depends_on"), edge("b", "d", "depends_on"),
      edge("c", "a", "depends_on"), edge("d", "a", "depends_on"),
      edge("a", "b", "depends_on"), edge("a", "a", "depends_on"),
      { ...edge("b", "c", "depends_on"), id: "duplicate" },
      edge("b", "unresolved", "depends_on"), edge("unresolved", "a", "depends_on"),
    ];
    const ranking = buildImpactRanking(nodes, edges, Infinity);
    expect(ranking.rows.find(row => row.id === "a")).toMatchObject({ direct: 2, total: 3 });
    expect(ranking.rows.every(row => row.total === 3)).toBe(true);
  });

  it("preserves the node-count depth bound through unresolved intermediates", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge("x", "a", "depends_on"), edge("y", "x", "depends_on"), edge("b", "y", "depends_on")];
    expect(buildImpactRanking(nodes, edges, Infinity).rankedCount).toBe(0);
    const withinDepth = buildImpactRanking(nodes, [...edges, edge("b", "x", "depends_on")], Infinity);
    expect(withinDepth.rows).toMatchObject([{ id: "a", direct: 0, total: 1 }]);
  });

  it("matches full reachability results across filtered, cyclic and incomplete graphs without changing inputs", () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      let state = seed;
      const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
      const nodes = Array.from({ length: 16 }, (_, i) => ({
        ...node(`n${i}`, "capability", `Title ${i % 3}`),
        hasOwnDocument: i % 4 !== 0,
        display: i % 5 === 0 ? "" : undefined,
        ref: `capabilities/n${i}`,
      }));
      const types = ["depends_on", "contains", "related_to", "describes"];
      const edges = Array.from({ length: 60 }, (_, i) => ({
        ...edge(`n${random() % 20}`, `n${random() % 20}`, types[random() % types.length]),
        id: `edge${i % 55}`,
        label: i % 9 === 0 ? "depends_on" : i % 7 === 0 ? " " : undefined,
      }));
      const snapshot = structuredClone({ nodes, edges });
      const index = buildReachabilityIndex(nodes, edges, { types: IMPACT_RELATION_TYPES });
      const expected = nodes.map(n => ({
        id: n.id, title: n.display ?? n.title, kind: n.kind, ref: n.ref, evidenceOnly: !n.hasOwnDocument,
        total: buildOntologyReachability(n.id, nodes, edges, { index, direction: "incoming", depth: nodes.length, types: IMPACT_RELATION_TYPES, limit: 1 }).summary.reachableNodes,
        direct: buildOntologyReachability(n.id, nodes, edges, { index, direction: "incoming", depth: 1, types: IMPACT_RELATION_TYPES, limit: 1 }).summary.reachableNodes,
      })).filter(row => row.total > 0).sort((a, b) => b.total - a.total || b.direct - a.direct || a.title.localeCompare(b.title));
      const concepts = expected.filter(row => !row.evidenceOnly);
      const evidence = expected.filter(row => row.evidenceOnly);
      expect(expected.length).toBeGreaterThan(0);
      for (const limit of [0, 1, 3.5, Infinity, Number.NaN]) {
        expect(buildImpactRanking(nodes, edges, limit, limit)).toEqual({
          declaredDependencyEdges: edges.filter(e => e.type === "depends_on").length,
          declaredWithRationaleEdges: edges.filter(e => e.type === "depends_on" && e.label?.trim()).length,
          rows: concepts.slice(0, Math.max(0, limit)), rankedCount: concepts.length,
          evidenceRows: evidence.slice(0, Math.max(0, limit)), evidenceRankedCount: evidence.length,
        });
      }
      expect({ nodes, edges }).toEqual(snapshot);
    }
  });

  describe("evidence layer split", () => {
    // The largest blast radius belongs to a derived concept without a document.
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
    // Per-layer totals are counted separately, so "top N / M total" states the scale of the list shown.
      expect(ranking.rankedCount).toBe(1);
      expect(ranking.evidenceRankedCount).toBe(1);
    });

    it("counts over the whole graph so the split does not change impact counts", () => {
      const ranking = rank();
    // Measured over the whole graph, as MCP `blast_radius` does: 3 is the three that cited it.
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
