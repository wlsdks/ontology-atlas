import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFootprintTrail, type UseFootprintTrailArgs } from "./use-footprint-trail";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const copyMocks = vi.hoisted(() => ({ copyText: vi.fn(async () => true) }));
vi.mock("@/shared/lib/copy-text", () => ({ copyText: copyMocks.copyText }));

const graphNodes = [
  { id: "capability:auth", label: "Auth", kind: "capability" },
  { id: "element:login-form", label: "Login form", kind: "element" },
];

function args(overrides: Partial<UseFootprintTrailArgs> = {}): UseFootprintTrailArgs {
  return {
    canvasSelectedSlug: null,
    graphNodes,
    insightNodes: undefined,
    dustySlugs: new Set(),
    ...overrides,
  };
}

describe("useFootprintTrail", () => {
  it("appends each ego focus once and keeps repeated steps only for the map", () => {
    const { result, rerender } = renderHook((props: UseFootprintTrailArgs) => useFootprintTrail(props), {
      initialProps: args(),
    });
    expect(result.current.footprintTrailEntries).toEqual([]);

    rerender(args({ canvasSelectedSlug: "capability:auth" }));
    rerender(args({ canvasSelectedSlug: "capability:auth" }));
    rerender(args({ canvasSelectedSlug: "element:login-form" }));
    rerender(args({ canvasSelectedSlug: "capability:auth" }));

    expect(result.current.footprintVisitedIds).toEqual([
      "capability:auth",
      "element:login-form",
      "capability:auth",
    ]);
    expect(result.current.footprintTrailEntries.map((entry) => entry.id)).toEqual([
      "element:login-form",
      "capability:auth",
    ]);
    expect(result.current.lastVisitedNodeRef.current).toBe("capability:auth");
  });

  it("drops nodes the live graph no longer has", () => {
    const { result, rerender } = renderHook((props: UseFootprintTrailArgs) => useFootprintTrail(props), {
      initialProps: args({ canvasSelectedSlug: "capability:auth" }),
    });
    rerender(args({ canvasSelectedSlug: "capability:auth", graphNodes: [graphNodes[1]] }));

    expect(result.current.footprintVisitedIds).toEqual([]);
    expect(result.current.footprintTrailEntries).toEqual([]);
  });

  it("copies the handoff packet only when there is a trail", async () => {
    const { result, rerender } = renderHook((props: UseFootprintTrailArgs) => useFootprintTrail(props), {
      initialProps: args(),
    });
    await act(async () => {
      await result.current.copyFootprintPacket();
    });
    expect(copyMocks.copyText).not.toHaveBeenCalled();

    rerender(args({ canvasSelectedSlug: "capability:auth" }));
    await act(async () => {
      await result.current.copyFootprintPacket();
    });
    expect(copyMocks.copyText).toHaveBeenCalledTimes(1);
    expect(result.current.footprintPacketCopied).toBe(true);
  });

  it("keeps the lens and brush in refs so toggling never re-renders", () => {
    const { result } = renderHook(() => useFootprintTrail(args()));
    act(() => {
      result.current.handleFootprintLens(true);
      result.current.handleFootprintBrush("capability:auth");
    });
    expect(result.current.footprintLensActiveRef.current).toBe(true);
    expect(result.current.footprintBrushNodeIdRef.current).toBe("capability:auth");
  });
});
