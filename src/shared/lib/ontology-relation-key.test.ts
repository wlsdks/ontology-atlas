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

// infer 와 explain 은 같은 kind-pair 규칙을 따로 분기로 들고 있어 drift 위험이
// 있다 (한쪽 매핑만 바꾸면 설명이 실제 키와 어긋남). 전체 25 pair 를 한 표로
// 고정해 (1) infer 의 결정 매핑을 명세화하고 (2) explain 이 항상 infer 가 고른
// 키를 그대로 설명하는지(= 두 함수가 단일 진실원을 공유하는지) 보장한다.
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
        // explain 은 infer 가 고른 키를 반드시 문장에 포함 (두 함수 동기화 보장).
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
