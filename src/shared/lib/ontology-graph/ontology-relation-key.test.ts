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

// `infer` and `explain` each carry the same kind-pair rules in their own branches,
// which can drift: change one mapping and the explanation no longer matches the key
// actually produced. Pinning all 25 pairs in one table (1) specifies infer's mapping
// and (2) guarantees explain always describes the key infer chose, i.e. that the two
// functions share one source of truth.
const KINDS = ["project", "domain", "capability", "element", "document"] as const;
const EXPECTED_INFER: Record<string, string> = {
  "project->project": "dependencies",
  "project->domain": "domains",
  "project->capability": "capabilities",
  "project->element": "elements",
  "project->document": "relates",
  "domain->project": "relates",
  "domain->domain": "contains",
  "domain->capability": "capabilities",
  "domain->element": "contains",
  "domain->document": "relates",
  "capability->project": "relates",
  "capability->domain": "relates",
  "capability->capability": "contains",
  "capability->element": "elements",
  "capability->document": "relates",
  "element->project": "relates",
  "element->domain": "relates",
  "element->capability": "relates",
  "element->element": "relates",
  "element->document": "relates",
  "document->project": "describes",
  "document->domain": "describes",
  "document->capability": "describes",
  "document->element": "describes",
  "document->document": "relates",
};

describe("inferOntologyRelationKey — full kind-pair matrix (drift guard)", () => {
  for (const source of KINDS) {
    for (const target of KINDS) {
      const pair = `${source}->${target}`;
      it(`${pair}: infer matches the pinned mapping and explain names that key`, () => {
        const key = inferOntologyRelationKey(source, target);
        expect(key).toBe(EXPECTED_INFER[pair]);
        // explain must name the key infer chose, keeping the two functions in sync.
        expect(explainOntologyRelationKeyInference(source, target)).toContain(key);
      });
    }
  }
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
