import { describe, expect, it } from "vitest";

import { isContainmentRelation, isDirectionalRelation } from "@/shared/lib/ontology-tree/relations";

/**
 * 지도가 **없는 방향을 주장하지 않는다** 는 계약.
 *
 * 배경(2026-07-31 실측): 토폴로지 어댑터(`views/home/lib/topology-v2-adapter.ts`)
 * 가 `isContainmentRelation(type) ? "contains" : "depends"` 로 2치 분류를 하고,
 * 렌더러는 그 "depends" 전부에 **방향 테이퍼**(source 굵 → target 얇)를 그렸다.
 * 그런데 dogfood 볼트의 containment 밖 관계 89개 중 **62개(70%)가 `related_to`**
 * — 대칭 관계다. 관계선의 대다수가 거짓 인과를 주장하고 있었다.
 *
 * 이 계약이 lint 로 안 되는 이유: 판정에 **관계 타입 목록**(두 Set)이 필요한데
 * `no-restricted-syntax` 는 한 파일의 AST 셀렉터 매칭이라 다른 파일의 값 목록을
 * 볼 수 없다. `design.md` "lint 가 못 보는 층은 계약 테스트가 맡는다" 절 참고.
 */
describe("relation directionality contract", () => {
  it("`related_to` 는 방향이 없다 — 두 철자 모두", () => {
    // derive(`derive-ontology-from-vault.ts`)는 `related_to`, MCP/스키마는
    // 키 이름 `relates` 를 쓴다. 어느 경로로 들어와도 같은 판정이어야 한다.
    expect(isDirectionalRelation("related_to")).toBe(false);
    expect(isDirectionalRelation("relates")).toBe(false);
  });

  it("의존·상위개념은 방향이 있다", () => {
    // `is_a`(SKOS broader)는 하위 → 상위라 방향이 실재한다.
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
    // containment 는 "구조인가", directional 은 "방향이 있는가" — 다른 질문.
    // 렌더에서 contains 는 실선이라 테이퍼 분기를 아예 안 타지만, 두 술어가
    // 서로를 함의한다고 착각하면 다음 사람이 하나로 합치려 든다.
    expect(isContainmentRelation("contains")).toBe(true);
    expect(isDirectionalRelation("contains")).toBe(true);
    expect(isContainmentRelation("related_to")).toBe(false);
    expect(isDirectionalRelation("related_to")).toBe(false);
  });

  it("dogfood 볼트의 실측 분포에서 다수가 대칭이다 — 이 계약이 지키는 것의 크기", () => {
    // 2026-07-31 `docs/ontology/` 전수: dependencies 27 · relates 62.
    // 숫자가 크게 바뀌면 이 계약의 우선순위 근거도 다시 봐야 한다.
    const observed = { depends_on: 27, related_to: 62 };
    const symmetric = Object.entries(observed)
      .filter(([type]) => !isDirectionalRelation(type))
      .reduce((sum, [, n]) => sum + n, 0);
    const total = Object.values(observed).reduce((sum, n) => sum + n, 0);
    expect(symmetric / total).toBeGreaterThan(0.5);
  });
});
