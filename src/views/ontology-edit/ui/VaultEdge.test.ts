import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import {
  edgeRouteOptionsForSemanticType,
  offsetEndpointAwayFromNode,
  resolveSmoothStepRouteOptions,
} from "./VaultEdge";

describe("VaultEdge route endpoints", () => {
  it("starts and ends paths outside the node card boundary", () => {
    expect(offsetEndpointAwayFromNode({ x: 100, y: 50 }, Position.Left)).toEqual({
      x: 80,
      y: 50,
    });
    expect(offsetEndpointAwayFromNode({ x: 100, y: 50 }, Position.Right)).toEqual({
      x: 120,
      y: 50,
    });
    expect(offsetEndpointAwayFromNode({ x: 100, y: 50 }, Position.Top)).toEqual({
      x: 100,
      y: 30,
    });
    expect(offsetEndpointAwayFromNode({ x: 100, y: 50 }, Position.Bottom)).toEqual({
      x: 100,
      y: 70,
    });
  });

  it("routes relation edges farther away from node cards than containment edges", () => {
    expect(edgeRouteOptionsForSemanticType("containment")).toEqual({
      borderRadius: 16,
      clearance: 20,
      offset: 32,
    });
    expect(edgeRouteOptionsForSemanticType("relation")).toEqual({
      borderRadius: 26,
      clearance: 30,
      offset: 52,
    });
  });

  it("keeps semantic route spacing even when callers pass path options", () => {
    expect(
      resolveSmoothStepRouteOptions("relation", {
        borderRadius: 4,
        offset: 8,
      }),
    ).toEqual({
      borderRadius: 26,
      offset: 52,
    });
  });
});
