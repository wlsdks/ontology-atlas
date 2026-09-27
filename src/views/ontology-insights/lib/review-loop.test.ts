import { describe, expect, it } from "vitest";
import {
  isDoNextReviewId,
  resolveDoNextReviewState,
} from "./review-loop";

describe("do-next review loop", () => {
  it("is active when the exact row id is in the current signals", () => {
    const state = resolveDoNextReviewState({
      reviewId: "orphan:capability:foo",
      authoritative: true,
      activeReviewIds: new Set(["orphan:capability:foo"]),
      cycleInventoryLimited: false,
    });
    expect(state?.phase).toBe("active");
  });

  it("treats different row kinds for one node as separate signals", () => {
    const state = resolveDoNextReviewState({
      reviewId: "promotion:element:shared",
      authoritative: true,
      activeReviewIds: new Set(["neglected-hub:element:shared"]),
      cycleInventoryLimited: false,
    });
    expect(state?.phase).toBe("cleared");
  });

  it("does not treat absence as cleared without authoritative signals", () => {
    const state = resolveDoNextReviewState({
      reviewId: "orphan:capability:foo",
      authoritative: false,
      activeReviewIds: new Set(),
      cycleInventoryLimited: false,
    });
    expect(state?.phase).toBe("checking");
  });

  it("marks absence unverified after a bounded cycle search", () => {
    const state = resolveDoNextReviewState({
      reviewId: "cycle:capability:a capability:b",
      authoritative: true,
      activeReviewIds: new Set(),
      cycleInventoryLimited: true,
    });
    expect(state?.phase).toBe("unverified");
  });

  it("uses a finding row id as the review id and marks absence from a truncated group unverified", () => {
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

  it("ignores a malformed id in the URL", () => {
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
