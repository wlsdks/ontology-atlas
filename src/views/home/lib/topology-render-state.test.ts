import { describe, expect, it } from "vitest";
import { resolveTopologyRenderState } from "./topology-render-state";

describe("resolveTopologyRenderState", () => {
  it("renders only the empty state when loaded topology data has zero nodes", () => {
    expect(
      resolveTopologyRenderState({ dataReady: true, totalNodes: 0 }),
    ).toEqual({
      showImmediateEmptyState: true,
      renderCanvas: false,
    });
  });

  it("keeps the canvas loader available while data is still loading", () => {
    expect(
      resolveTopologyRenderState({ dataReady: false, totalNodes: 0 }),
    ).toEqual({
      showImmediateEmptyState: false,
      renderCanvas: true,
    });
  });

  it("renders the canvas when there is at least one node", () => {
    expect(
      resolveTopologyRenderState({ dataReady: true, totalNodes: 1 }),
    ).toEqual({
      showImmediateEmptyState: false,
      renderCanvas: true,
    });
  });
});
