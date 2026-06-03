import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { resolveEphemeralEdgeRoutePoints } from "./EphemeralEdge";

describe("EphemeralEdge route points", () => {
  it("keeps draft relation endpoints outside concept cards", () => {
    const routed = resolveEphemeralEdgeRoutePoints({
      sourceX: 220,
      sourceY: 40,
      targetX: 440,
      targetY: 40,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });

    expect(routed.source).toEqual({ x: 262, y: 40 });
    expect(routed.target).toEqual({ x: 398, y: 40 });
  });

  it("routes vertical draft relations away from top and bottom handles", () => {
    const routed = resolveEphemeralEdgeRoutePoints({
      sourceX: 100,
      sourceY: 80,
      targetX: 100,
      targetY: 220,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });

    expect(routed.source).toEqual({ x: 100, y: 122 });
    expect(routed.target).toEqual({ x: 100, y: 178 });
  });
});
