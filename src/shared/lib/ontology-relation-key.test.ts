import { describe, expect, it } from "vitest";
import {
  explainOntologyRelationKeyForGraphIds,
  explainOntologyRelationKeyInference,
  inferOntologyRelationKey,
  inferOntologyRelationKeyForGraphIds,
} from "./ontology-relation-key";

describe("inferOntologyRelationKey", () => {
  it("maps hierarchy-like relations to schema frontmatter keys", () => {
    expect(inferOntologyRelationKey("project", "domain")).toBe("domains");
    expect(inferOntologyRelationKey("domain", "capability")).toBe("capabilities");
    expect(inferOntologyRelationKey("capability", "element")).toBe("elements");
  });

  it("keeps ambiguous pairs as relates", () => {
    expect(inferOntologyRelationKey("element", "capability")).toBe("relates");
  });
});

describe("explainOntologyRelationKeyInference", () => {
  it("explains hierarchy-specific relation key choices", () => {
    expect(explainOntologyRelationKeyInference("domain", "capability")).toBe(
      "domain -> capability maps to capabilities because domains own capabilities.",
    );
    expect(explainOntologyRelationKeyInference("capability", "element")).toBe(
      "capability -> element maps to elements because capabilities use concrete elements.",
    );
  });

  it("explains fallback choices for ambiguous pairs", () => {
    expect(explainOntologyRelationKeyInference("element", "capability")).toBe(
      "element -> capability falls back to relates because this pair has no hierarchy-specific graph key.",
    );
  });
});

describe("inferOntologyRelationKeyForGraphIds", () => {
  it("infers relation keys from topology graph id prefixes", () => {
    expect(
      inferOntologyRelationKeyForGraphIds(
        "domain:views",
        "capability:topology-analysis-modes",
      ),
    ).toBe("capabilities");
    expect(
      inferOntologyRelationKeyForGraphIds(
        "capabilities/topology-analysis-modes",
        "elements/topology-analysis-state",
      ),
    ).toBe("elements");
  });
});

describe("explainOntologyRelationKeyForGraphIds", () => {
  it("explains choices from topology graph id prefixes", () => {
    expect(
      explainOntologyRelationKeyForGraphIds(
        "domain:views",
        "capability:topology-analysis-modes",
      ),
    ).toBe(
      "domain -> capability maps to capabilities because domains own capabilities.",
    );
  });
});
