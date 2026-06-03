import { describe, expect, it } from "vitest";
import {
  countProjectRelationsWithinGraph,
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
