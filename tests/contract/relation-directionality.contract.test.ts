import { describe, expect, it } from "vitest";

import { isContainmentRelation, isDirectionalRelation } from "@/entities/knowledge-graph/lib/ontology-tree/relations";

/**
 * The contract that **the map does not claim a direction that does not exist.**
 *
 * Background (measured 2026-07-31): the topology adapter
 * (`views/home/lib/topology-v2-adapter.ts`) classified relations into two buckets with
 * `isContainmentRelation(type) ? "contains" : "depends"`, and the renderer drew a
 * **directional taper** (thick at source → thin at target) on every "depends". But of
 * the dogfood vault's 89 non-containment relations, **62 (70%) were `related_to`** — a
 * symmetric relation. Most of the edges were asserting a false causality.
 *
 * Why lint cannot do this: the verdict needs **the relation type lists** (two Sets),
 * and `no-restricted-syntax` matches selectors against one file's AST and cannot see
 * another file's values. See `.claude/rules/design.md`, "the layer lint cannot see
 * belongs to a contract test".
 */
describe("relation directionality contract", () => {
  it("`related_to` 는 방향이 없다 — 두 철자 모두", () => {
    // derive (`derive-ontology-from-vault.ts`) uses `related_to` while MCP and the schema
    // use the key name `relates`. The verdict must be the same whichever path it arrives
    // through.
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
    // Exhaustive count of `docs/ontology/`, 2026-07-31: dependencies 27, relates 62. A
    // large change in those numbers means this contract's priority evidence should be
    // re-examined.
    const observed = { depends_on: 27, related_to: 62 };
    const symmetric = Object.entries(observed)
      .filter(([type]) => !isDirectionalRelation(type))
      .reduce((sum, [, n]) => sum + n, 0);
    const total = Object.values(observed).reduce((sum, n) => sum + n, 0);
    expect(symmetric / total).toBeGreaterThan(0.5);
  });
});
