import { describe, expect, it } from "vitest";

import {
  EGO_CONTAINS_COMET_LIMIT,
  edgePairKey,
  selectAmbientDependsComets,
  selectEgoContainsComets,
} from "@/widgets/topology-map-v2/render/edge-fireflies";

/**
 * The contract that the always-on ambient `depends` comets carry **the same cap** as
 * their sibling branch.
 *
 * Background: the `contains` branch has a cap of 24 from Design Guardian's approved
 * prescription E, while the `depends` branch had neither a cap nor a ranking.
 * Viewport culling and the tier gate act as a de facto cap today, but when the screen
 * fills with depends at the element tier there is no ceiling on how many dots flow at
 * once.
 *
 * ⚠️ **This contract does not re-reverse #512 (the owner's ambient restoration).**
 * The comets still flow always, independently of focus, at the same speed — this
 * only applies to the missing branch a pattern already approved on its sibling. The
 * old Guardian A1 ("restrict comets to the ego graph") was explicitly reverted by the
 * owner and that decision stands.
 */
const edges = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ sourceId: `s${i}`, targetId: `t${i}` }));

describe("depends comet cap contract", () => {
  it("두 갈래가 같은 상한을 쓴다", () => {
    const many = edges(200);
    expect(selectAmbientDependsComets(many).size).toBe(EGO_CONTAINS_COMET_LIMIT);
    expect(selectEgoContainsComets(many).size).toBe(EGO_CONTAINS_COMET_LIMIT);
  });

  it("상한 이하면 전부 통과한다 — 오늘의 실볼트가 회귀하지 않는다", () => {
    // The dogfood vault has 89 relations outside containment, but far fewer depends are
    // visible on one screen at once (measured in round 20: 20 with 24 clusters
    // expanded).
    const few = edges(20);
    expect(selectAmbientDependsComets(few).size).toBe(20);
  });

  it("선택이 결정론이다 — 같은 입력이면 같은 집합, 순서가 달라도 같다", () => {
    const source = edges(60);
    const shuffled = [...source].reverse();
    const a = [...selectAmbientDependsComets(source)].sort();
    const b = [...selectAmbientDependsComets(shuffled)].sort();
    expect(a).toEqual(b);
  });

  it("선택된 키가 드로우 게이트가 쓰는 키 문법과 같다", () => {
    // The renderer looks up by `edgePairKey(sourceId, targetId)` — a mismatched key
    // syntax makes the cap silently block everything (or pass everything).
    const one = [{ sourceId: "a", targetId: "b" }];
    expect(selectAmbientDependsComets(one).has(edgePairKey("a", "b"))).toBe(true);
  });
});
