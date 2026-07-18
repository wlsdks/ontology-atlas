import { describe, expect, it } from "vitest";
import { classifyRelationQuality, summarizeAgentReadiness } from "./relation-quality";

function edge(overrides: {
  type?: string;
  evidenceIds?: string[];
  lastApprovedBy?: string;
}) {
  return {
    type: overrides.type ?? "contains",
    evidenceIds: overrides.evidenceIds ?? [],
    lastApprovedBy: overrides.lastApprovedBy ?? "",
  };
}

describe("classifyRelationQuality", () => {
  it("classifies unevidenced, unapproved relations as needing review", () => {
    expect(classifyRelationQuality(edge({ evidenceIds: [], lastApprovedBy: "" }))).toBe(
      "review",
    );
  });

  it("classifies related_to relations as weak regardless of evidence", () => {
    expect(
      classifyRelationQuality(
        edge({ type: "related_to", evidenceIds: ["doc-a"], lastApprovedBy: "system" }),
      ),
    ).toBe("weak");
  });

  it("classifies evidenced structural relations as strong", () => {
    for (const type of ["contains", "belongs_to", "depends_on", "implements", "uses"]) {
      expect(
        classifyRelationQuality(edge({ type, evidenceIds: ["doc-a"] })),
      ).toBe("strong");
    }
  });

  it("classifies an evidenced, unrecognized relation type as supported", () => {
    expect(
      classifyRelationQuality(edge({ type: "custom_link", evidenceIds: ["doc-a"] })),
    ).toBe("supported");
  });

  it("treats a human approval alone (no evidence) as enough to avoid review", () => {
    expect(
      classifyRelationQuality(
        edge({ type: "custom_link", evidenceIds: [], lastApprovedBy: "system" }),
      ),
    ).toBe("supported");
  });
});

describe("summarizeAgentReadiness", () => {
  it("rolls strong+supported into ready, weak into preflight, review stays review", () => {
    expect(
      summarizeAgentReadiness({ strong: 10, supported: 5, weak: 3, review: 2 }),
    ).toEqual({ ready: 15, preflight: 3, review: 2 });
  });

  it("handles an all-zero graph", () => {
    expect(
      summarizeAgentReadiness({ strong: 0, supported: 0, weak: 0, review: 0 }),
    ).toEqual({ ready: 0, preflight: 0, review: 0 });
  });
});
