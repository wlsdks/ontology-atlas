import { describe, expect, it } from "vitest";

import { isContainmentRelation, isDirectionalRelation } from "@/entities/knowledge-graph/lib/ontology-tree/relations";

/**
 * The map must not claim a direction that does not exist. Most non-containment relations are
 * `related_to`, which is symmetric, so a directional taper asserted false causality. Lint cannot see
 * the relation type lists in another file.
 */
describe("relation directionality contract", () => {
  it("`related_to` 는 방향이 없다 — 두 철자 모두", () => {
    // derive uses `related_to` while MCP and the schema use the key `relates`; the result must be the
    // same through either path.
    expect(isDirectionalRelation("related_to")).toBe(false);
    expect(isDirectionalRelation("relates")).toBe(false);
  });

  it("의존·상위개념은 방향이 있다", () => {
    // `is_a` (SKOS broader) runs narrower → broader, so its direction is real.
    for (const type of ["depends_on", "is_a", "describes"]) {
      expect(isDirectionalRelation(type), type).toBe(true);
    }
  });

  it("모르는 타입은 방향 있음이 기본 — 새 타입이 조용히 대칭으로 강등되지 않는다", () => {
    for (const type of ["implements", "uses", "some_future_relation", ""]) {
      expect(isDirectionalRelation(type), type).toBe(true);
    }
  });

  it("방향성 축과 containment 축은 서로 독립이다", () => {
    // Containment asks "is it structural"; directional asks "does it have a direction" —
    // different questions. In the renderer, contains is a solid line and never enters the
    // taper branch at all, but mistaking the two predicates for equivalents leads the next
    // person to merge them.
    expect(isContainmentRelation("contains")).toBe(true);
    expect(isDirectionalRelation("contains")).toBe(true);
    expect(isContainmentRelation("related_to")).toBe(false);
    expect(isDirectionalRelation("related_to")).toBe(false);
  });

  it("dogfood 볼트의 실측 분포에서 다수가 대칭이다 — 이 계약이 지키는 것의 크기", () => {
    // Counts from `docs/ontology/`: dependencies 27, relates 62. A large change in those numbers means
    // this contract's priority evidence should be re-examined.
    const observed = { depends_on: 27, related_to: 62 };
    const symmetric = Object.entries(observed)
      .filter(([type]) => !isDirectionalRelation(type))
      .reduce((sum, [, n]) => sum + n, 0);
    const total = Object.values(observed).reduce((sum, n) => sum + n, 0);
    expect(symmetric / total).toBeGreaterThan(0.5);
  });
});
