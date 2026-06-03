import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { resolveBuilderEdgeEndpointHandles } from "./builder-edge-handles";

function node(id: string, x: number, y: number): Node {
  return {
    id,
    position: { x, y },
    data: {},
  };
}

describe("resolveBuilderEdgeEndpointHandles", () => {
  it("routes left-to-right edges through side ports instead of node centers", () => {
    expect(resolveBuilderEdgeEndpointHandles(node("a", 0, 0), node("b", 360, 0))).toEqual({
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });
  });

  it("routes right-to-left edges through opposite side ports", () => {
    expect(resolveBuilderEdgeEndpointHandles(node("a", 360, 0), node("b", 0, 0))).toEqual({
      sourceHandle: "source-left",
      targetHandle: "target-right",
    });
  });

  it("routes vertically stacked relation edges through same-side ports", () => {
    expect(resolveBuilderEdgeEndpointHandles(node("a", 0, 0), node("b", 20, 240))).toEqual({
      sourceHandle: "source-right",
      targetHandle: "target-right",
    });
  });
});
