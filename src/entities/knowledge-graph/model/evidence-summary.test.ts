import { describe, expect, it } from "vitest";
import { buildKnowledgeProjectEvidenceSummary } from "./evidence-summary";
import type { KnowledgeProjectInsight } from "./types";

const date = new Date("2026-04-24T00:00:00.000Z");

function insight(
  overrides: Partial<KnowledgeProjectInsight> = {},
): KnowledgeProjectInsight {
  return {
    nodes: [],
    edges: [],
    meta: null,
    ...overrides,
  };
}

describe("buildKnowledgeProjectEvidenceSummary", () => {
  it("excludes project nodes from evidence counts", () => {
    const summary = buildKnowledgeProjectEvidenceSummary(
      insight({
        nodes: [
          {
            id: "project:narnia",
            title: "Narnia",
            kind: "project",
            projectIds: ["narnia"],
            evidenceIds: [],
            lastApprovedAt: date,
            lastApprovedBy: "test",
          },
          {
            id: "doc:brief",
            title: "Architecture Brief",
            kind: "document",
            projectIds: ["narnia"],
            evidenceIds: ["ev1"],
            evidenceCount: 1,
            lastApprovedAt: date,
            lastApprovedBy: "test",
          },
        ],
      }),
    );

    expect(summary.counts).toEqual({
      documents: 1,
      concepts: 0,
      edges: 0,
    });
    expect(summary.featuredDocument?.id).toBe("doc:brief");
    expect(summary.summaryText).toBe("이 프로젝트: Architecture Brief이 대표 문서입니다.");
    expect(summary.hasEvidence).toBe(true);
  });

  it("deduplicates edge labels and sorts by evidence strength", () => {
    const summary = buildKnowledgeProjectEvidenceSummary(
      insight({
        edges: [
          {
            id: "edge-a",
            from: "a",
            to: "b",
            type: "mentions",
            label: "mentions",
            projectIds: ["narnia"],
            evidenceIds: ["ev1"],
            evidenceCount: 1,
            lastApprovedAt: date,
            lastApprovedBy: "test",
          },
          {
            id: "edge-b",
            from: "b",
            to: "c",
            type: "depends_on",
            label: "depends on",
            projectIds: ["narnia"],
            evidenceIds: ["ev1", "ev2", "ev3"],
            evidenceCount: 3,
            lastApprovedAt: date,
            lastApprovedBy: "test",
          },
          {
            id: "edge-c",
            from: "c",
            to: "d",
            type: "depends_on",
            label: "depends on",
            projectIds: ["narnia"],
            evidenceIds: ["ev4", "ev5"],
            evidenceCount: 2,
            lastApprovedAt: date,
            lastApprovedBy: "test",
          },
        ],
      }),
    );

    expect(summary.edgeLabels).toEqual(["depends on", "mentions"]);
    expect(summary.counts.edges).toBe(3);
  });

  it("keeps concept previews bounded while preserving total concept count", () => {
    const summary = buildKnowledgeProjectEvidenceSummary(
      insight({
        nodes: Array.from({ length: 6 }, (_, index) => ({
          id: `concept:${index}`,
          title: `Concept ${index}`,
          kind: "concept",
          projectIds: ["narnia"],
          evidenceIds: [],
          evidenceCount: index,
          lastApprovedAt: date,
          lastApprovedBy: "test",
        })),
      }),
    );

    expect(summary.conceptNodes).toHaveLength(4);
    expect(summary.conceptNodes[0]?.title).toBe("Concept 5");
    expect(summary.counts.concepts).toBe(6);
  });

  it("builds a readable summary from the strongest document, concepts, and edges", () => {
    const summary = buildKnowledgeProjectEvidenceSummary(
      insight({
        nodes: [
          {
            id: "doc:brief",
            title: "Narnia Architecture",
            kind: "document",
            projectIds: ["narnia"],
            evidenceIds: ["ev1", "ev2"],
            evidenceCount: 2,
            lastApprovedAt: date,
            lastApprovedBy: "test",
          },
          {
            id: "concept:graph",
            title: "Project Graph",
            kind: "concept",
            projectIds: ["narnia"],
            evidenceIds: ["ev3"],
            evidenceCount: 3,
            lastApprovedAt: date,
            lastApprovedBy: "test",
          },
        ],
        edges: [
          {
            id: "edge-a",
            from: "doc:brief",
            to: "concept:graph",
            type: "mentions",
            label: "mentions",
            projectIds: ["narnia"],
            evidenceIds: ["ev1"],
            evidenceCount: 1,
            lastApprovedAt: date,
            lastApprovedBy: "test",
          },
        ],
      }),
      { subjectName: "Narnia" },
    );

    expect(summary.summaryText).toBe(
      "Narnia: Narnia Architecture에서 Project Graph와 함께 등장하고, mentions 연결로 설명됩니다.",
    );
  });
});
