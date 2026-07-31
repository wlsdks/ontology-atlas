import { describe, expect, it } from "vitest";

import {
  EGO_CONTAINS_COMET_LIMIT,
  edgePairKey,
  selectAmbientDependsComets,
  selectEgoContainsComets,
} from "@/widgets/topology-map-v2/render/edge-fireflies";

/**
 * 상시 앰비언트 `depends` 코멧에도 형제 갈래와 **같은 상한**이 걸린다는 계약.
 *
 * 배경: `contains` 갈래는 Design Guardian 승인 처방 E 로 24개 상한을 갖는데
 * `depends` 갈래에는 상한도 랭킹도 없었다. 오늘은 뷰포트 컬링과 티어 게이트가
 * 사실상 상한 노릇을 하지만, element 티어에서 화면이 depends 로 차면 동시에
 * 흐르는 점 개수에 천장이 없다.
 *
 * ⚠️ **이 계약은 #512(소유자의 앰비언트 복원)를 재뒤집지 않는다.** 혜성은
 * 여전히 상시로, 포커스와 무관하게, 같은 속도로 흐른다 — 형제에 이미 있는
 * 승인된 패턴을 빠진 쪽에 적용할 뿐이다. 구 Guardian A1("코멧을 ego 한정으로")
 * 은 소유자가 명시적으로 되돌렸고 그 결정은 그대로 선다.
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
    // dogfood 의 containment 밖 관계는 89개지만, 한 화면에 동시에 보이는
    // depends 는 그보다 훨씬 적다(라운드 20 실측: 24 클러스터 펼침에서 20개).
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
    // 렌더는 `edgePairKey(sourceId, targetId)` 로 조회한다 — 키 문법이 어긋나면
    // 캡이 조용히 전량 차단(또는 전량 통과)된다.
    const one = [{ sourceId: "a", targetId: "b" }];
    expect(selectAmbientDependsComets(one).has(edgePairKey("a", "b"))).toBe(true);
  });
});
