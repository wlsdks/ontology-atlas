import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFootprintTrail, type UseFootprintTrailArgs } from "./use-footprint-trail";

vi.mock("use-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

const copyMocks = vi.hoisted(() => ({ copyText: vi.fn(async (_text: string) => true) }));
vi.mock("@/shared/lib/clipboard/copy-text", () => ({ copyText: copyMocks.copyText }));

const graphNodes = [
  { id: "capability:auth", label: "Auth", kind: "capability" },
  { id: "element:login-form", label: "Login form", kind: "element" },
  { id: "domain:identity", label: "Identity", kind: "domain" },
];

const insightNodes = [
  { id: "capability:auth", agentSlug: "capabilities/auth" },
  { id: "element:login-form", agentSlug: "elements/login-form" },
  { id: "domain:identity", hasOwnDocument: false, ref: "identity" },
];

// Module state outlives each test, so every test walks in its own folder scope.
function args(trailScope: string, overrides: Partial<UseFootprintTrailArgs> = {}): UseFootprintTrailArgs {
  return {
    trailScope,
    canvasSelectedSlug: null,
    graphNodes,
    insightNodes,
    insightEdges: [
      { from: "domain:identity", to: "capability:auth", type: "contains" },
      { from: "capability:auth", to: "element:login-form", type: "depends_on" },
    ],
    relationLabelOf: (type) => type,
    ...overrides,
  };
}

function walk(scope: string, ids: string[]) {
  const view = renderHook((props: UseFootprintTrailArgs) => useFootprintTrail(props), {
    initialProps: args(scope),
  });
  for (const id of ids) view.rerender(args(scope, { canvasSelectedSlug: id }));
  return view;
}

describe("useFootprintTrail", () => {
  it("appends each focus once and keeps repeated steps only for the map", () => {
    const { result } = walk("folder-append", [
      "capability:auth",
      "capability:auth",
      "element:login-form",
      "capability:auth",
    ]);
    expect(result.current.footprintVisitedIds).toEqual([
      "capability:auth",
      "element:login-form",
      "capability:auth",
    ]);
    expect(result.current.footprintTrailEntries.map((entry) => entry.id)).toEqual([
      "element:login-form",
      "capability:auth",
    ]);
  });

  it("keeps the walk after the map unmounts for another destination", () => {
    const first = walk("folder-return", ["domain:identity", "capability:auth", "element:login-form"]);
    first.unmount();
    const { result } = renderHook(() =>
      useFootprintTrail(args("folder-return", { canvasSelectedSlug: "element:login-form" })),
    );
    expect(result.current.footprintTrailEntries.map((entry) => entry.id)).toEqual([
      "domain:identity",
      "capability:auth",
      "element:login-form",
    ]);
  });

  it("starts empty for a newly opened folder without carrying the old selection into it", () => {
    const view = walk("folder-before", ["capability:auth", "element:login-form"]);
    view.rerender(args("folder-after", { canvasSelectedSlug: "element:login-form" }));
    expect(view.result.current.footprintTrailEntries).toEqual([]);
    view.rerender(args("folder-after", { canvasSelectedSlug: "capability:auth" }));
    expect(view.result.current.footprintVisitedIds).toEqual(["capability:auth"]);
  });

  it("captions only the moves the walk made after a revisit (A→B→C→B)", () => {
    const { result } = walk("folder-captions", [
      "domain:identity",
      "capability:auth",
      "element:login-form",
      "capability:auth",
    ]);
    expect(result.current.footprintTrailEntries.map((entry) => entry.title)).toEqual([
      "Identity",
      "Login form",
      "Auth",
    ]);
    // Login form was reached from Auth, not from Identity, so it claims no move.
    expect(result.current.footprintTrailStepCaptions).toEqual([
      null,
      null,
      { relationLabel: "depends_on", reason: null },
    ]);
  });

  it("drops a concept the live graph no longer has, in memory only", () => {
    const view = walk("folder-deleted", ["capability:auth"]);
    view.rerender(args("folder-deleted", { canvasSelectedSlug: "capability:auth", graphNodes: [graphNodes[1]] }));
    expect(view.result.current.footprintVisitedIds).toEqual([]);
    expect(view.result.current.footprintTrailEntries).toEqual([]);
  });

  it("copies a prompt naming vault slugs only when there is a trail", async () => {
    const view = renderHook((props: UseFootprintTrailArgs) => useFootprintTrail(props), {
      initialProps: args("folder-copy"),
    });
    await act(async () => {
      await view.result.current.copyFootprintPacket();
    });
    expect(copyMocks.copyText).not.toHaveBeenCalled();

    view.rerender(args("folder-copy", { canvasSelectedSlug: "domain:identity" }));
    view.rerender(args("folder-copy", { canvasSelectedSlug: "capability:auth" }));
    await act(async () => {
      await view.result.current.copyFootprintPacket();
    });
    expect(copyMocks.copyText).toHaveBeenCalledTimes(1);
    const text = copyMocks.copyText.mock.calls[0][0];
    expect(text).toContain("2. Auth (capability): capabilities/auth");
    expect(text).toContain("1. Identity (domain)\n");
    expect(text).toContain('get_concepts({"slugs":["capabilities/auth"]})');
    expect(text).not.toContain("capability:auth");
    expect(view.result.current.footprintPacketCopied).toBe(true);
  });

  it("clears the open folder's walk", () => {
    const view = walk("folder-clear", ["capability:auth", "element:login-form"]);
    act(() => view.result.current.clearFootprintTrail());
    expect(view.result.current.footprintTrailEntries).toEqual([]);
  });

  it("keeps the lens and brush in refs so toggling never re-renders", () => {
    const { result } = renderHook(() => useFootprintTrail(args("folder-lens")));
    act(() => {
      result.current.handleFootprintLens(true);
      result.current.handleFootprintBrush("capability:auth");
    });
    expect(result.current.footprintLensActiveRef.current).toBe(true);
    expect(result.current.footprintBrushNodeIdRef.current).toBe("capability:auth");
  });
});
