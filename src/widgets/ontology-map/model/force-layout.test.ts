import { describe, expect, it } from "vitest";

import { createForceSimulation, type ForceEdgeInput, type ForceSeedNode } from "./force-layout";

const seeds: ForceSeedNode[] = [
  { id: "root", x: 0, y: 0 },
  { id: "a", x: 100, y: 0 },
  { id: "b", x: 0, y: 100 },
  { id: "c", x: -100, y: 0 },
  { id: "d", x: 0, y: -100 },
];
const edges: ForceEdgeInput[] = [
  { source: "root", target: "a" },
  { source: "root", target: "b" },
  { source: "root", target: "c" },
  { source: "root", target: "d" },
  { source: "a", target: "b" },
];

describe("createForceSimulation", () => {
  it("leaves seed positions untouched when ticked with 0 iterations", () => {
    const sim = createForceSimulation(seeds, edges);
    sim.tick(0);
    const pos = sim.positions();
    expect(pos.get("a")).toEqual({ x: 100, y: 0 });
    expect(pos.get("root")).toEqual({ x: 0, y: 0 });
  });

  it("is deterministic — identical seeds + edges + iteration count give identical positions", () => {
    const a = createForceSimulation(seeds, edges);
    const b = createForceSimulation(seeds, edges);
    a.tick(20);
    b.tick(20);
    const pa = a.positions();
    const pb = b.positions();
    for (const id of ["root", "a", "b", "c", "d"]) {
      expect(pa.get(id)).toEqual(pb.get(id));
    }
  });

  it("actually moves nodes (relaxation happens) after enough iterations", () => {
    const sim = createForceSimulation(seeds, edges);
    sim.tick(30);
    const pos = sim.positions();
    const moved = Math.hypot((pos.get("a")!.x - 100), pos.get("a")!.y - 0);
    expect(moved).toBeGreaterThan(0.01);
  });

  it("holds a pinned node fixed at its pin coordinate across ticks while neighbors reflow", () => {
    const sim = createForceSimulation(seeds, edges);
    sim.pin("a", 500, 500);
    sim.tick(15);
    const pos = sim.positions();
    expect(pos.get("a")).toEqual({ x: 500, y: 500 });
    expect(pos.get("root")).not.toEqual({ x: 0, y: 0 });
    expect(sim.pinnedId()).toBe("a");
  });

  it("lets a released node settle again (no longer restamped)", () => {
    const sim = createForceSimulation(seeds, edges);
    sim.pin("a", 500, 500);
    sim.tick(10);
    sim.clearPin();
    expect(sim.pinnedId()).toBeNull();
    sim.tick(10);
    const pos = sim.positions();
    expect(pos.get("a")).not.toEqual({ x: 500, y: 500 });
  });

  /** A release settle relaxes only the given set; far nodes stay put. */
  it("restricts a tick to an explicit id set — nodes outside it are unchanged", () => {
    const sim = createForceSimulation(seeds, edges);
    const before = sim.positions();
    sim.tick(15, new Set(["root", "a"]));
    const after = sim.positions();
    expect(after.get("b")).toEqual(before.get("b"));
    expect(after.get("c")).toEqual(before.get("c"));
    expect(after.get("d")).toEqual(before.get("d"));
  });

  it("still lets the restricted set itself move", () => {
    const sim = createForceSimulation(seeds, edges);
    sim.pin("a", 500, 500);
    sim.tick(15, new Set(["root", "a"]));
    const pos = sim.positions();
    expect(pos.get("a")).toEqual({ x: 500, y: 500 });
    expect(pos.get("root")).not.toEqual({ x: 0, y: 0 });
  });

  it("with no restriction (undefined/null), every node is free to move as before", () => {
    const sim = createForceSimulation(seeds, edges);
    sim.tick(30);
    const pos = sim.positions();
    const moved = Math.hypot(pos.get("a")!.x - 100, pos.get("a")!.y - 0);
    expect(moved).toBeGreaterThan(0.01);
  });

  it("survives coincident seed positions without emitting NaN", () => {
    const stacked: ForceSeedNode[] = [
      { id: "x", x: 0, y: 0 },
      { id: "y", x: 0, y: 0 },
      { id: "z", x: 0, y: 0 },
    ];
    const sim = createForceSimulation(stacked, [{ source: "x", target: "y" }]);
    sim.tick(20);
    for (const [, p] of sim.positions()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
