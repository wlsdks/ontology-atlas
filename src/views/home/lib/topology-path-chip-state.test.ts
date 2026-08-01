import { describe, expect, it } from "vitest";
import {
  canCopyTopologyPathPacket,
  resolveTopologyPathChipState,
} from "./topology-path-chip-state";

describe("resolveTopologyPathChipState", () => {
  it("소스만 있으면 대상을 기다린다", () => {
    expect(
      resolveTopologyPathChipState({
        sourceSlug: "capability:a",
        targetSlug: null,
        sourceTitle: "결제",
        targetTitle: null,
        hopCount: null,
      }),
    ).toEqual({ kind: "awaiting-target", sourceTitle: "결제" });
  });

  it("둘 다 실재하고 이어지면 홉 수를 말한다", () => {
    expect(
      resolveTopologyPathChipState({
        sourceSlug: "capability:a",
        targetSlug: "domain:b",
        sourceTitle: "결제",
        targetTitle: "주문",
        hopCount: 2,
      }),
    ).toEqual({ kind: "resolved", sourceTitle: "결제", targetTitle: "주문", hops: 2 });
  });

  it("둘 다 실재하는데 길이 없으면 「경로 없음」 — 이건 참인 단언이다", () => {
    expect(
      resolveTopologyPathChipState({
        sourceSlug: "capability:a",
        targetSlug: "domain:b",
        sourceTitle: "결제",
        targetTitle: "주문",
        hopCount: null,
      }),
    ).toEqual({ kind: "no-path", sourceTitle: "결제", targetTitle: "주문" });
  });

  /**
   * **화면이 하던 거짓말.** 이 볼트에 없는 노드 둘을 놓고도 칩은 이름 두 개를
   * 그린 뒤 「경로 없음」이라고 단언했다 — 진실은 "둘 다 여기 없다" 다.
   */
  it("끝점이 이 볼트에 없으면 「경로 없음」이라고 말하지 않는다", () => {
    const state = resolveTopologyPathChipState({
      sourceSlug: "capability:ghost-a",
      targetSlug: "domain:ghost-b",
      sourceTitle: null,
      targetTitle: null,
      hopCount: null,
    });

    expect(state).toEqual({
      kind: "missing-endpoints",
      missing: ["capability:ghost-a", "domain:ghost-b"],
    });
  });

  it("한쪽만 없어도 없는 쪽만 말한다", () => {
    expect(
      resolveTopologyPathChipState({
        sourceSlug: "capability:a",
        targetSlug: "domain:ghost",
        sourceTitle: "결제",
        targetTitle: null,
        hopCount: null,
      }),
    ).toEqual({ kind: "missing-endpoints", missing: ["domain:ghost"] });
  });

  it("소스가 없으면 칩 자체가 없다", () => {
    expect(
      resolveTopologyPathChipState({
        sourceSlug: null,
        targetSlug: null,
        sourceTitle: null,
        targetTitle: null,
        hopCount: null,
      }),
    ).toBeNull();
  });
});

/**
 * 복사 버튼은 **에이전트에게 넘기는 문**이다. 없는 슬러그 둘과 「경로 없음」
 * 이라는 결론을 넘기면, 사람이 속은 것을 기계에게 사실로 전달하게 된다.
 */
describe("canCopyTopologyPathPacket", () => {
  it("끝점이 없는 상태에서는 넘길 수 없다", () => {
    expect(
      canCopyTopologyPathPacket({ kind: "missing-endpoints", missing: ["x"] }),
    ).toBe(false);
  });

  it("대상 선택 전에도 넘길 수 없다", () => {
    expect(canCopyTopologyPathPacket({ kind: "awaiting-target", sourceTitle: "결제" })).toBe(
      false,
    );
  });

  it("둘 다 실재하면 — 길이 없어도 — 넘길 수 있다", () => {
    expect(
      canCopyTopologyPathPacket({ kind: "no-path", sourceTitle: "a", targetTitle: "b" }),
    ).toBe(true);
    expect(
      canCopyTopologyPathPacket({
        kind: "resolved",
        sourceTitle: "a",
        targetTitle: "b",
        hops: 1,
      }),
    ).toBe(true);
  });

  it("칩이 없으면 넘길 것도 없다", () => {
    expect(canCopyTopologyPathPacket(null)).toBe(false);
  });
});
