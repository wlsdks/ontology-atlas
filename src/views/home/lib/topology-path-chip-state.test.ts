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
   * The lie the screen used to tell: with two nodes absent from this vault the
   * chip drew two names and then asserted "no path". The truth is that neither
   * is here.
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
 * The copy button is the door to the agent. Handing it two non-existent slugs
 * and a "no path" conclusion passes a fooled human's belief on to a machine as
 * fact.
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
