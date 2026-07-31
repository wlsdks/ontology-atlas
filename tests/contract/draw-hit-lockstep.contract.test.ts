import { describe, expect, it } from "vitest";

import {
  HITTABLE_MIN_TIER_ALPHA,
  isNodeHittable,
  type HittableNodeInput,
} from "@/widgets/topology-map-v2/model/tier-visibility";

/**
 * **드로우와 히트가 같은 값을 본다**는 계약.
 *
 * 배경(2026-07-31 전수 검사): 티어를 관통하는 면제 채널이 드로우에는 넷인데
 * (엣지 선택 · 발자국 렌즈 · ego 포커스 · 최근변경 스포트라이트) 히트에는
 * **ego 하나뿐**이었다 — 그래서 발자국 렌즈로 떠오른 노드가 **보이는데 안
 * 눌렸다**. 그런데 드로우 쪽 주석은 *"같은 관통이 히트테스트에도 걸려 지도에서
 * 바로 다시 클릭할 수 있다"* 고 말한다. **주석이 고치려던 바로 그 경우가 안
 * 고쳐져 있었다** — 드로우만 보고 쓰인 주석이다.
 *
 * 고치는 방식이 중요하다: 인자를 하나씩 더 넘기면 **다음에 채널이 늘 때 또
 * 어긋난다**(오늘 이 결함이 생긴 그 방식). 드로우가 이미 만드는 알파 맵을
 * 히트가 읽으면 구조적으로 못 어긋난다.
 *
 * ⚠️ 계약의 정확한 문구는 「그려지면 잡힌다」가 아니라 **「절반 이상 드러났으면
 * 잡힌다」**다 — 0.02~0.5 는 의도된 "보이지만 안 잡히는" 구간이다.
 */

const node = (id: string, kind: HittableNodeInput["kind"] = "element"): HittableNodeInput => ({
  id,
  kind,
  isHub: false,
});

/** 개요 진입 배율 — element/capability 티어가 아직 안 열린 상태. */
const OVERVIEW_ZOOM = 1;

describe("draw/hit lockstep contract", () => {
  it("드로우가 관통시킨 노드는 **채널이 무엇이든** 잡힌다", () => {
    // 채널 이름을 열거하지 않는 것이 요점이다 — 맵에 값이 있으면 그걸로 끝.
    // 새 채널(6번째, 7번째…)이 생겨도 이 테스트를 고칠 필요가 없고, 그것이
    // 곧 "구조적으로 못 어긋난다"의 증거다.
    for (const alpha of [0.5, 0.75, 1]) {
      const drawn = new Map([["n", alpha]]);
      expect(
        isNodeHittable(node("n"), OVERVIEW_ZOOM, null, undefined, undefined, undefined, null, drawn),
        `alpha=${alpha}`,
      ).toBe(true);
    }
  });

  it("**바닥은 0.5** — 드로우의 0.02 로 갈아타지 않는다", () => {
    // 0.02~0.5 는 "그려지지만 안 잡히는" 의도된 구간. 거의 투명한 것을 잡게
    // 하면 오클릭이 나고, `computeLabelAlpha` 의 "잡을 수 있으면 읽을 수
    // 있다" 규율과도 어긋난다.
    for (const alpha of [0.03, 0.2, 0.49]) {
      const drawn = new Map([["n", alpha]]);
      expect(
        isNodeHittable(node("n"), OVERVIEW_ZOOM, null, undefined, undefined, undefined, null, drawn),
        `alpha=${alpha}`,
      ).toBe(false);
    }
    expect(HITTABLE_MIN_TIER_ALPHA).toBe(0.5);
  });

  it("접힌 노드는 알파와 무관하게 안 잡힌다 — 안 그려지는 것은 안 잡힌다", () => {
    const drawn = new Map([["n", 1]]);
    expect(
      isNodeHittable(
        node("n"),
        OVERVIEW_ZOOM,
        null,
        undefined,
        undefined,
        new Set(["n"]),
        null,
        drawn,
      ),
    ).toBe(false);
  });

  it("맵이 비면 종전 계산으로 떨어진다 — 첫 프레임 방어", () => {
    // 페인트 전에는 맵이 비어 있다. 그 한 프레임은 오늘 동작과 같아야 하고,
    // 그건 회귀가 아니라 방어다(사용자는 페인트 전에 클릭할 수 없다).
    const empty = new Map<string, number>();
    // 개요에서 element 는 티어가 닫혀 있다 → 안 잡힌다(종전 규칙).
    expect(
      isNodeHittable(node("n"), OVERVIEW_ZOOM, null, undefined, undefined, undefined, null, empty),
    ).toBe(false);
    // 그런데 ego 면 종전 규칙으로도 잡힌다.
    expect(
      isNodeHittable(node("n"), OVERVIEW_ZOOM, "n", undefined, undefined, undefined, null, empty),
    ).toBe(true);
  });

  it("맵을 아예 안 넘기면 종전 시그니처와 동작이 같다 — 호출부 회귀 0", () => {
    expect(isNodeHittable(node("n"), OVERVIEW_ZOOM, "n", undefined)).toBe(true);
    expect(isNodeHittable(node("n"), OVERVIEW_ZOOM, null, undefined)).toBe(false);
    // spine 은 티어가 항상 열려 있다.
    expect(isNodeHittable(node("d", "domain"), OVERVIEW_ZOOM, null, undefined)).toBe(true);
  });
});
