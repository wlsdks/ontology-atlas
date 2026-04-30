import { describe, expect, it } from "vitest";
import { buildKnowledgeProjectEvidenceSummary } from "./evidence-summary";
import { getDemoKnowledgeProjectInsight } from "./demo-insight";

describe("getDemoKnowledgeProjectInsight", () => {
  it("builds a public-like insight for demo projects with knowledge documents", () => {
    const insight = getDemoKnowledgeProjectInsight("narnia-indexer-10", "stress-lab");
    const summary = buildKnowledgeProjectEvidenceSummary(insight, {
      subjectName: "Narnia · Indexer",
    });

    expect(insight.nodes.some((node) => node.kind === "project")).toBe(true);
    expect(summary.counts.documents).toBeGreaterThan(0);
    expect(summary.counts.concepts).toBeGreaterThan(0);
    expect(summary.counts.edges).toBeGreaterThan(0);
    expect(summary.summaryText).toContain("Narnia · Indexer");
  });

  it("keeps other account scopes empty", () => {
    const insight = getDemoKnowledgeProjectInsight("narnia-indexer-10", "other-account");

    expect(insight.nodes).toEqual([]);
    expect(insight.edges).toEqual([]);
    expect(insight.meta).toBeNull();
  });
});
