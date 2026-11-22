import { describe, expect, it } from "vitest";

import {
  createSynapseField,
  stepSynapseField,
  synapseLinks,
  type SynapseNode,
} from "./synapse-field";

const FIELD = { count: 24, reach: 120, width: 800, height: 400 } as const;

describe("createSynapseField", () => {
  it("places every point inside the field", () => {
    for (const node of createSynapseField(FIELD)) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(FIELD.width);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(FIELD.height);
    }
  });

  /*
   * A reduced-motion viewer is shown one still frame, and it should be a considered one
   * rather than whatever `Math.random` produced that second; a screenshot gate cannot
   * compare two frames of a field that reseeds itself either.
   */
  it("is the same field for the same seed, and a different one for a different seed", () => {
    expect(createSynapseField(FIELD)).toEqual(createSynapseField(FIELD));
    expect(createSynapseField({ ...FIELD, seed: 7 })).not.toEqual(
      createSynapseField({ ...FIELD, seed: 8 }),
    );
  });

  it("gives every point a slow drift rather than leaving it still", () => {
    for (const node of createSynapseField(FIELD)) {
      const speed = Math.hypot(node.vx, node.vy);
      expect(speed).toBeGreaterThan(0);
      // Under a tenth of a pixel per frame at 60Hz: a background, not a screensaver.
      expect(speed * 16).toBeLessThan(0.1);
    }
  });

  it("draws nothing for a count of zero", () => {
    expect(createSynapseField({ ...FIELD, count: 0 })).toEqual([]);
  });

  // Independent random picks clump; an uneven background reads as a rendering fault.
  it("covers the field evenly instead of clumping", () => {
    const nodes = createSynapseField({ ...FIELD, count: 40 });
    const quadrant = (node: { x: number; y: number }) =>
      `${node.x < FIELD.width / 2 ? "l" : "r"}${node.y < FIELD.height / 2 ? "t" : "b"}`;
    const counts = new Map<string, number>();
    for (const node of nodes) counts.set(quadrant(node), (counts.get(quadrant(node)) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual(["lb", "lt", "rb", "rt"]);
    // Ten per quadrant is the even share; no quadrant may fall below half of it.
    for (const share of counts.values()) expect(share).toBeGreaterThanOrEqual(5);
  });

  it("does not line the points up in a visible lattice", () => {
    const nodes = createSynapseField({ ...FIELD, count: 40 });
    expect(new Set(nodes.map((node) => Math.round(node.x))).size).toBeGreaterThan(30);
    expect(new Set(nodes.map((node) => Math.round(node.y))).size).toBeGreaterThan(30);
  });
});

describe("stepSynapseField", () => {
  it("moves a point along its own velocity", () => {
    const node: SynapseNode = { x: 100, y: 100, vx: 0.01, vy: -0.02 };
    stepSynapseField([node], 10, FIELD.width, FIELD.height);
    expect(node.x).toBeCloseTo(100.1, 6);
    expect(node.y).toBeCloseTo(99.8, 6);
  });

  /*
   * Wrapping rather than bouncing: a bounce puts a visible rhythm on the boundary, and
   * points gathering and turning at the same lines read as a box around something that is
   * supposed to have no edges.
   */
  it("wraps a point that leaves the field instead of turning it around", () => {
    const node: SynapseNode = { x: 799, y: 1, vx: 0.5, vy: -0.5 };
    stepSynapseField([node], 10, FIELD.width, FIELD.height);
    expect(node.x).toBeLessThan(100);
    expect(node.y).toBeGreaterThan(300);
    expect(node.vx).toBeGreaterThan(0);
  });

  it("keeps a whole field inside the frame over a long run", () => {
    const nodes = createSynapseField(FIELD);
    for (let i = 0; i < 4000; i += 1) stepSynapseField(nodes, 16, FIELD.width, FIELD.height);
    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(FIELD.width);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(FIELD.height);
    }
  });

  /*
   * rAF pauses in a hidden tab, so the first frame back carries a gap of whatever the tab
   * was away for. Uncapped, the whole field teleports on that one frame.
   */
  it("caps one step so a tab returning from the background does not jump", () => {
    const far: SynapseNode = { x: 400, y: 200, vx: 0.005, vy: 0 };
    const near: SynapseNode = { x: 400, y: 200, vx: 0.005, vy: 0 };
    stepSynapseField([far], 30_000, FIELD.width, FIELD.height);
    stepSynapseField([near], 64, FIELD.width, FIELD.height);
    expect(far.x).toBeCloseTo(near.x, 6);
  });
});

describe("synapseLinks", () => {
  const at = (x: number, y: number): SynapseNode => ({ x, y, vx: 0, vy: 0 });

  it("links two points within reach and leaves distant ones alone", () => {
    const links = synapseLinks([at(0, 0), at(50, 0), at(500, 0)], 120);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ a: 0, b: 1 });
  });

  it("weights a link by how close the two points are", () => {
    const [near] = synapseLinks([at(0, 0), at(12, 0)], 120);
    const [far] = synapseLinks([at(0, 0), at(108, 0)], 120);
    expect(near!.strength).toBeCloseTo(0.9, 5);
    expect(far!.strength).toBeCloseTo(0.1, 5);
  });

  /*
   * A link that appears at full strength the instant two points come into range flickers,
   * and a flicker is the one thing a background must never do.
   */
  it("fades a link in from zero at the reach limit rather than cutting it in", () => {
    const [barely] = synapseLinks([at(0, 0), at(119.99, 0)], 120);
    expect(barely!.strength).toBeGreaterThan(0);
    expect(barely!.strength).toBeLessThan(0.001);
    expect(synapseLinks([at(0, 0), at(120, 0)], 120)).toHaveLength(0);
  });

  it("names each pair once, never twice", () => {
    const links = synapseLinks([at(0, 0), at(10, 0), at(20, 0)], 120);
    expect(links).toHaveLength(3);
    expect(new Set(links.map((link) => `${link.a}-${link.b}`)).size).toBe(3);
  });

  it("draws no link at all when reach is zero", () => {
    expect(synapseLinks([at(0, 0), at(1, 0)], 0)).toEqual([]);
  });
});
