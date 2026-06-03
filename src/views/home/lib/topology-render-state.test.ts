import { describe, expect, it } from "vitest";
import {
  countProjectRelationsWithinGraph,
  resolveTopologyOverlayState,
  resolveTopologyRenderState,
} from "./topology-render-state";

describe("resolveTopologyRenderState", () => {
  it("renders only the empty state when loaded topology data has zero nodes", () => {
    expect(
      resolveTopologyRenderState({ dataReady: true, totalNodes: 0, totalRelations: 0 }),
    ).toEqual({
      showImmediateEmptyState: true,
      renderCanvas: false,
    });
  });

  it("keeps the canvas loader available while data is still loading", () => {
    expect(
      resolveTopologyRenderState({ dataReady: false, totalNodes: 0, totalRelations: 0 }),
    ).toEqual({
      showImmediateEmptyState: false,
      renderCanvas: true,
    });
  });

  it("renders only the empty state when loaded topology data has nodes but no relations", () => {
    expect(
      resolveTopologyRenderState({ dataReady: true, totalNodes: 2, totalRelations: 0 }),
    ).toEqual({
      showImmediateEmptyState: true,
      renderCanvas: false,
    });
  });

  it("renders the canvas when there is at least one drawable relation", () => {
    expect(
      resolveTopologyRenderState({ dataReady: true, totalNodes: 1, totalRelations: 1 }),
    ).toEqual({
      showImmediateEmptyState: false,
      renderCanvas: true,
    });
  });
});

describe("resolveTopologyOverlayState", () => {
  it("shows the structural empty state when loaded data has no drawable relations", () => {
    expect(
      resolveTopologyOverlayState({
        dataReady: true,
        totalNodes: 3,
        totalRelations: 0,
        visibleNodes: 3,
        filtersActive: false,
      }),
    ).toEqual({
      kind: "structural-empty",
      emptyReason: "no-relations",
    });
  });

  it("shows a filter-empty state instead of the structural empty panel when filters hide every node", () => {
    expect(
      resolveTopologyOverlayState({
        dataReady: true,
        totalNodes: 12,
        totalRelations: 8,
        visibleNodes: 0,
        filtersActive: true,
      }),
    ).toEqual({ kind: "filter-empty" });
  });

  it("shows a sparse-filter state when filters leave one isolated visible node", () => {
    expect(
      resolveTopologyOverlayState({
        dataReady: true,
        totalNodes: 12,
        totalRelations: 8,
        visibleNodes: 1,
        filtersActive: true,
      }),
    ).toEqual({ kind: "filter-sparse" });
  });

  it("shows the structural empty panel for one unfiltered visible node", () => {
    expect(
      resolveTopologyOverlayState({
        dataReady: true,
        totalNodes: 12,
        totalRelations: 8,
        visibleNodes: 1,
        filtersActive: false,
      }),
    ).toEqual({
      kind: "structural-empty",
      emptyReason: "no-relations",
    });
  });
});

describe("countProjectRelationsWithinGraph", () => {
  it("counts only relations whose endpoint is visible in the current project graph", () => {
    expect(
      countProjectRelationsWithinGraph([
        { slug: "atlas", dependencies: ["mcp", "external"] },
        { slug: "mcp", dependencies: ["atlas"] },
      ]),
    ).toBe(2);
  });

  it("returns zero for sparse local graphs with isolated nodes", () => {
    expect(
      countProjectRelationsWithinGraph([
        { slug: "atlas", dependencies: [] },
        { slug: "mcp", dependencies: ["external"] },
      ]),
    ).toBe(0);
  });
});
