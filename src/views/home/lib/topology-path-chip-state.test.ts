import { describe, expect, it } from "vitest";
import {
  canCopyTopologyPathPacket,
  resolveTopologyPathChipState,
} from "./topology-path-chip-state";

describe("resolveTopologyPathChipState", () => {
  it("waits for the target when only the source is set", () => {
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

  it("states the hop count when both exist and connect", () => {
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

  it("says no path when both exist without a path, which is a true claim", () => {
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
  it("does not claim no path when an endpoint is missing from this vault", () => {
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

  it("names only the missing side when one side is missing", () => {
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

  it("renders no chip without a source", () => {
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
  it("cannot hand off while an endpoint is missing", () => {
    expect(
      canCopyTopologyPathPacket({ kind: "missing-endpoints", missing: ["x"] }),
    ).toBe(false);
  });

  it("cannot hand off before a target is chosen", () => {
    expect(canCopyTopologyPathPacket({ kind: "awaiting-target", sourceTitle: "결제" })).toBe(
      false,
    );
  });

  it("can hand off when both exist, even without a path", () => {
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

  it("has nothing to hand off without a chip", () => {
    expect(canCopyTopologyPathPacket(null)).toBe(false);
  });
});
