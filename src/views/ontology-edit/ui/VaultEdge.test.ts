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
      x: 72,
      y: 50,
    });
    expect(offsetEndpointAwayFromNode({ x: 100, y: 50 }, Position.Right)).toEqual({
      x: 128,
      y: 50,
    });
    expect(offsetEndpointAwayFromNode({ x: 100, y: 50 }, Position.Top)).toEqual({
      x: 100,
      y: 22,
    });
    expect(offsetEndpointAwayFromNode({ x: 100, y: 50 }, Position.Bottom)).toEqual({
      x: 100,
      y: 78,
    });
  });

  it("routes relation edges farther away from node cards than containment edges", () => {
    expect(edgeRouteOptionsForSemanticType("containment")).toEqual({
      borderRadius: 16,
      clearance: 36,
      offset: 44,
    });
    expect(edgeRouteOptionsForSemanticType("relation")).toEqual({
      borderRadius: 30,
      clearance: 42,
      offset: 72,
    });
  });

  it("keeps semantic route spacing even when callers pass path options", () => {
    expect(
      resolveSmoothStepRouteOptions("relation", {
        borderRadius: 4,
        offset: 8,
      }),
    ).toEqual({
      borderRadius: 30,
      offset: 72,
    });
  });

  it("keeps same-column relation endpoints outside the node card halo", () => {
    const right = offsetEndpointAwayFromNode(
      { x: 280, y: 88 },
      Position.Right,
      edgeRouteOptionsForSemanticType("relation").clearance,
    );
    const left = offsetEndpointAwayFromNode(
      { x: 0, y: 88 },
      Position.Left,
      edgeRouteOptionsForSemanticType("relation").clearance,
    );

    expect(right.x).toBe(322);
    expect(left.x).toBe(-42);
  });

  it("keeps containment endpoints clear of the node border and shadow", () => {
    const right = offsetEndpointAwayFromNode(
      { x: 220, y: 44 },
      Position.Right,
      edgeRouteOptionsForSemanticType("containment").clearance,
    );
    const left = offsetEndpointAwayFromNode(
      { x: 440, y: 44 },
      Position.Left,
      edgeRouteOptionsForSemanticType("containment").clearance,
    );

    expect(right.x).toBe(256);
    expect(left.x).toBe(404);
  });
});
