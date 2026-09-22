import { describe, expect, it } from "vitest";
import {
  isDoNextReviewId,
  resolveDoNextReviewState,
} from "./review-loop";

describe("do-next review loop", () => {
  it("exact row id가 현재 전체 신호에 있으면 active다", () => {
    const state = resolveDoNextReviewState({
      reviewId: "orphan:capability:foo",
      authoritative: true,
      activeReviewIds: new Set(["orphan:capability:foo"]),
      cycleInventoryLimited: false,
    });
    expect(state?.phase).toBe("active");
  });

  it("같은 노드라도 서로 다른 row kind는 별개 신호다", () => {
    const state = resolveDoNextReviewState({
      reviewId: "promotion:element:shared",
      authoritative: true,
      activeReviewIds: new Set(["neglected-hub:element:shared"]),
      cycleInventoryLimited: false,
    });
    expect(state?.phase).toBe("cleared");
  });

  it("authoritative하지 않으면 부재를 완료로 단정하지 않는다", () => {
    const state = resolveDoNextReviewState({
      reviewId: "orphan:capability:foo",
      authoritative: false,
      activeReviewIds: new Set(),
      cycleInventoryLimited: false,
    });
    expect(state?.phase).toBe("checking");
  });

  it("제한된 cycle 탐색에서 부재는 unverified다", () => {
    const state = resolveDoNextReviewState({
      reviewId: "cycle:capability:a capability:b",
      authoritative: true,
      activeReviewIds: new Set(),
      cycleInventoryLimited: true,
    });
    expect(state?.phase).toBe("unverified");
  });

  it("소견 행의 id 는 리뷰 id 다 — 잘린 묶음의 부재는 cleared 가 아니라 unverified 다", () => {
    expect(isDoNextReviewId("missing-boundary:capabilities/pay")).toBe(true);
    expect(
      resolveDoNextReviewState({
        reviewId: "missing-boundary:capabilities/pay",
        authoritative: true,
        activeReviewIds: new Set(["missing-boundary:capabilities/pay"]),
        cycleInventoryLimited: false,
      })?.phase,
    ).toBe("active");
    expect(
      resolveDoNextReviewState({
        reviewId: "missing-uncertainty:capabilities/refund",
        authoritative: true,
        activeReviewIds: new Set(),
        cycleInventoryLimited: false,
        limitedPrefixes: new Set(["missing-uncertainty"]),
      })?.phase,
    ).toBe("unverified");
    expect(
      resolveDoNextReviewState({
        reviewId: "missing-uncertainty:capabilities/refund",
        authoritative: true,
        activeReviewIds: new Set(),
        cycleInventoryLimited: false,
        limitedPrefixes: new Set(),
      })?.phase,
    ).toBe("cleared");
  });

  it("잘못된 id는 URL에 있어도 소비하지 않는다", () => {
    expect(isDoNextReviewId("done:anything")).toBe(false);
    expect(
      resolveDoNextReviewState({
        reviewId: "done:anything",
        authoritative: true,
        activeReviewIds: new Set(),
        cycleInventoryLimited: false,
      })?.phase,
    ).toBe("unverified");
  });
});
