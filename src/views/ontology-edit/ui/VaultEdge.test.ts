import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { offsetEndpointAwayFromNode } from "./VaultEdge";

describe("VaultEdge route endpoints", () => {
  it("starts and ends paths outside the node card boundary", () => {
    expect(offsetEndpointAwayFromNode({ x: 100, y: 50 }, Position.Left)).toEqual({
      x: 82,
      y: 50,
    });
    expect(offsetEndpointAwayFromNode({ x: 100, y: 50 }, Position.Right)).toEqual({
      x: 118,
      y: 50,
    });
    expect(offsetEndpointAwayFromNode({ x: 100, y: 50 }, Position.Top)).toEqual({
      x: 100,
      y: 32,
    });
    expect(offsetEndpointAwayFromNode({ x: 100, y: 50 }, Position.Bottom)).toEqual({
      x: 100,
      y: 68,
    });
  });
});
