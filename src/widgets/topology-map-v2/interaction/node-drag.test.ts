import { describe, expect, it } from "vitest";

import { computeGrabOffsetWorld, computePinWorld } from "./node-drag";

describe("node-drag pin math", () => {
  it("computes the grab offset as node minus pointer in world space", () => {
    // Grabbed a node at (100, 50) while the pointer's world position was (98, 47).
    const offset = computeGrabOffsetWorld(100, 50, 98, 47);
    expect(offset).toEqual({ x: 2, y: 3 });
  });

  it("pins the node so it stays exactly under the grab point at the moment of grab", () => {
    const nodeX = 100;
    const nodeY = 50;
    const pointerWorldX = 98;
    const pointerWorldY = 47;
    const offset = computeGrabOffsetWorld(nodeX, nodeY, pointerWorldX, pointerWorldY);
    // Re-pinning at the same pointer world position must reproduce the node position.
    const pin = computePinWorld(pointerWorldX, pointerWorldY, offset);
    expect(pin).toEqual({ x: nodeX, y: nodeY });
  });

  it("tracks the pointer 1:1 in world space, preserving the grab offset", () => {
    const offset = computeGrabOffsetWorld(100, 50, 98, 47); // {2,3}
    // Pointer world moves by (+40, -10).
    const pin = computePinWorld(138, 37, offset);
    expect(pin).toEqual({ x: 140, y: 40 });
  });

  it("center-grab (zero offset) pins the node directly at the pointer", () => {
    const offset = computeGrabOffsetWorld(10, 20, 10, 20);
    expect(offset).toEqual({ x: 0, y: 0 });
    expect(computePinWorld(55, 66, offset)).toEqual({ x: 55, y: 66 });
  });
});
