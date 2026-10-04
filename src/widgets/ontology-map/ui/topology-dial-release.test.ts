import { describe, expect, it } from "vitest";

import { dialReleaseHoming } from "./topology-dial-release";
import type { TopologyWorld } from "./topology-world";

const node = (id: string, x: number, y: number) => ({ id, x, y }) as TopologyWorld["nodes"][number];

describe("dialReleaseHoming", () => {
  it("springs only displaced nodes back to their scene slot and seeds the sim there", () => {
    const world = { nodes: [node("a", 90, 40), node("b", 10.2, 0)], edges: [] };
    const slots = new Map([["a", { x: 20, y: 0 }], ["b", { x: 10, y: 0 }]]);
    const homing = dialReleaseHoming(world, slots, new Map(), null);
    expect([...homing.override.keys()]).toEqual(["a"]);
    expect(homing.override.get("a")).toEqual({ x: 20, y: 0 });
    expect(homing.springs.has("b")).toBe(false);
    expect(homing.sim.positions().get("a")).toMatchObject({ x: 20, y: 0 });
  });
});
