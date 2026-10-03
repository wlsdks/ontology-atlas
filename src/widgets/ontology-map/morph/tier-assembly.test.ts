import { describe, expect, it } from "vitest";
import {
  armTierAssembly,
  carryTierAssembly,
  claimTierAssembly,
  isTierAssembling,
  landTierAssembly,
  settleTierAssembly,
  stepTierAssembly,
  tierAssemblyAppear,
  TIER_ASSEMBLE_TOTAL_MS,
  TIER_DELAY_MS,
  TIER_RISE_MS,
  type TierKind,
} from "./tier-assembly";

function makeWorld() {
  const spec: Array<[string, TierKind, string | null, number, number]> = [
    ["p", "project", null, 0, 0],
    ["d", "domain", "p", 100, 0],
    ["c", "capability", "d", 200, 50],
  ];
  const nodes = spec.map(([id, kind, parentId, x, y]) => ({ id, kind, parentId, x, y }));
  return {
    nodes,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
    bounds: { minX: 0, minY: 0, maxX: 200, maxY: 50 },
    spineBounds: { minX: 0, minY: 0, maxX: 100, maxY: 0 },
  };
}

let seq = 0;
const key = () => `source-${seq++}`;

describe("tier assembly", () => {
  it("keeps the dome's tier schedule", () => {
    expect(TIER_DELAY_MS).toEqual({ project: 0, domain: 180, capability: 380, element: 600 });
    expect(TIER_ASSEMBLE_TOTAL_MS).toBe(TIER_DELAY_MS.element + TIER_RISE_MS);
  });

  it("plays once per source per session", () => {
    const k = key();
    expect(armTierAssembly(makeWorld(), k, false)).toBe(true);
    expect(armTierAssembly(makeWorld(), k, false)).toBe(false);
  });

  it("holds the project still and raises each tier out of its parent in order", () => {
    const world = makeWorld();
    armTierAssembly(world, key(), false);
    const [p, d, c] = world.nodes;
    stepTierAssembly(world, 1000);
    expect([p.x, p.y]).toEqual([0, 0]);
    expect([d.x, c.x]).toEqual([0, 0]);
    stepTierAssembly(world, 1000 + TIER_DELAY_MS.capability);
    expect(d.x).toBeGreaterThan(0);
    expect(d.x).toBeLessThan(100);
    expect(c.x).toBe(d.x);
    expect(stepTierAssembly(world, 1000 + TIER_ASSEMBLE_TOTAL_MS)).toBe(false);
    expect([d.x, c.x, c.y]).toEqual([100, 200, 50]);
    expect(isTierAssembling(world)).toBe(false);
  });

  it("never lets a child near its parent while the parent is still rising", () => {
    const nodes = [
      { id: "p", kind: "project" as const, parentId: null, x: 0, y: 0 },
      { id: "d", kind: "domain" as const, parentId: "p", x: 1000, y: 0 },
      { id: "c", kind: "capability" as const, parentId: "d", x: 1030, y: 0 },
    ];
    const world = { nodes, nodeById: new Map(nodes.map((n) => [n.id, n])), bounds: { minX: 0, minY: 0, maxX: 1030, maxY: 0 }, spineBounds: { minX: 0, minY: 0, maxX: 1000, maxY: 0 } };
    armTierAssembly(world, key(), false);
    const [, d, c] = nodes;
    let peak = 0;
    let worst = 0;
    for (let t = 0; t <= TIER_ASSEMBLE_TOTAL_MS; t += 10) {
      stepTierAssembly(world, t);
      const gap = Math.hypot(c.x - d.x, c.y - d.y);
      worst = Math.max(worst, peak - gap);
      peak = Math.max(peak, gap);
    }
    expect(worst).toBeLessThan(1e-9);
    expect([c.x, c.y]).toEqual([1030, 0]);
  });

  it("lands every node on the frame after a settle", () => {
    const world = makeWorld();
    armTierAssembly(world, key(), false);
    stepTierAssembly(world, 0);
    settleTierAssembly(world);
    expect(tierAssemblyAppear(world, "capability", 1)).toBe(1);
    expect(stepTierAssembly(world, 16)).toBe(false);
    expect(world.nodes.map((n) => n.x)).toEqual([0, 100, 200]);
  });

  it("lands every node before the next frame, so a fit read in between frames the final layout", () => {
    const world = makeWorld();
    armTierAssembly(world, key(), false);
    stepTierAssembly(world, 0);
    expect(world.nodes.map((n) => n.x)).toEqual([0, 0, 0]);
    landTierAssembly(world);
    expect(world.nodes.map((n) => [n.x, n.y])).toEqual([[0, 0], [100, 0], [200, 50]]);
    expect(tierAssemblyAppear(world, "capability", 1)).toBe(1);
    expect(stepTierAssembly(world, 16)).toBe(false);
    expect(isTierAssembling(world)).toBe(false);
  });

  it("under reduced motion places finals on frame one and only fades", () => {
    const world = makeWorld();
    armTierAssembly(world, key(), true);
    expect(stepTierAssembly(world, 0)).toBe(true);
    expect(world.nodes.map((n) => n.x)).toEqual([0, 100, 200]);
    expect(tierAssemblyAppear(world, "domain", 60)).toBeCloseTo(0.5);
  });

  it("drives the appear ramp by tier", () => {
    const world = makeWorld();
    armTierAssembly(world, key(), false);
    stepTierAssembly(world, 0);
    expect(tierAssemblyAppear(world, "project", 0)).toBe(1);
    expect(tierAssemblyAppear(world, "capability", TIER_DELAY_MS.capability)).toBe(0);
    expect(tierAssemblyAppear({}, "domain", 0)).toBeNull();
  });
});

describe("tier assembly before the source is known", () => {
  it("claims the source once it arrives", () => {
    const k = key();
    const first = makeWorld();
    armTierAssembly(first, null, false);
    claimTierAssembly(first, k);
    stepTierAssembly(first, 0);
    expect(isTierAssembling(first)).toBe(true);
    const revisit = makeWorld();
    armTierAssembly(revisit, null, false);
    claimTierAssembly(revisit, k);
    expect(stepTierAssembly(revisit, 0)).toBe(false);
  });
});

describe("tier assembly across a rebuild", () => {
  it("keeps its clock on the replacing world", () => {
    const first = makeWorld();
    armTierAssembly(first, null, false);
    stepTierAssembly(first, 0);
    const next = makeWorld();
    carryTierAssembly(first, next);
    stepTierAssembly(next, TIER_DELAY_MS.capability);
    expect(next.nodes[1].x).toBeGreaterThan(0);
    expect(next.nodes[1].x).toBeLessThan(100);
    const untouched = makeWorld();
    carryTierAssembly(null, untouched);
    expect(isTierAssembling(untouched)).toBe(false);
  });
});
