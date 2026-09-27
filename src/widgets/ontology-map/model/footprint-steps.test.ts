import { describe, expect, it } from "vitest";

import { buildFootprintSteps, buildTrailGlintLegs, buildWalkedEdgeArrivalSteps, buildWalkedEdgeDirections, buildWalkedEdgeKeys, trailGlintLocalPhase, walkedEdgeKey } from "./footprint-steps";

describe("buildFootprintSteps", () => {
  it("gives a revisited node several step numbers, starting at 1", () => {
    const steps = buildFootprintSteps(["a", "b", "a", "c", "a"]);
    expect(steps.get("a")).toEqual([1, 3, 5]);
    expect(steps.get("b")).toEqual([2]);
    expect(steps.get("c")).toEqual([4]);
  });

  it("maps an empty trail to an empty map", () => {
    expect(buildFootprintSteps([]).size).toBe(0);
  });
});

describe("buildWalkedEdgeKeys", () => {
  it("makes candidates only of consecutively visited pairs", () => {
    const keys = buildWalkedEdgeKeys(["a", "b", "c"]);
    expect(keys.has(walkedEdgeKey("a", "b"))).toBe(true);
    expect(keys.has(walkedEdgeKey("b", "c"))).toBe(true);
    expect(keys.has(walkedEdgeKey("a", "c"))).toBe(false);
  });

  it("keys an edge the same in either direction, since edges are undirected", () => {
    expect(buildWalkedEdgeKeys(["b", "a"]).has(walkedEdgeKey("a", "b"))).toBe(true);
  });

  it("makes no self pair for a step to the same node", () => {
    expect(buildWalkedEdgeKeys(["a", "a"]).size).toBe(0);
  });

  it("has no pair with a single step", () => {
    expect(buildWalkedEdgeKeys(["a"]).size).toBe(0);
  });
});

describe("buildWalkedEdgeDirections", () => {
  /* The star mark has no toes, so this is the only record of which way the walk went. */
  it("remembers which way each relation was crossed", () => {
    const dirs = buildWalkedEdgeDirections(["b", "a"]);
    // Walked b -> a, and "a" sorts lower, so the crossing runs high -> low.
    expect(dirs.get(walkedEdgeKey("a", "b"))).toBe(false);
    expect(buildWalkedEdgeDirections(["a", "b"]).get(walkedEdgeKey("a", "b"))).toBe(true);
  });

  it("keeps the most recent crossing when a relation is walked both ways", () => {
    const dirs = buildWalkedEdgeDirections(["a", "b", "a"]);
    expect(dirs.get(walkedEdgeKey("a", "b"))).toBe(false);
  });

  it("ignores a step that does not move", () => {
    expect(buildWalkedEdgeDirections(["a", "a"]).size).toBe(0);
    expect(buildWalkedEdgeDirections([]).size).toBe(0);
  });

  it("names the same relations the key set does", () => {
    const trail = ["c", "a", "b", "a"];
    expect([...buildWalkedEdgeDirections(trail).keys()].sort()).toEqual(
      [...buildWalkedEdgeKeys(trail)].sort(),
    );
  });
});

describe("buildWalkedEdgeArrivalSteps", () => {
  /*
   * A line belongs to the star it leads to, so the ignition sweep draws the path in the
   * order it happened.
   */
  it("gives each relation the step the walk arrived along it", () => {
    const steps = buildWalkedEdgeArrivalSteps(["a", "b", "c"]);
    expect(steps.get(walkedEdgeKey("a", "b"))).toBe(1);
    expect(steps.get(walkedEdgeKey("b", "c"))).toBe(2);
  });

  it("keeps the first arrival when a relation is walked again", () => {
    // Drawn once, when first made; a later redraw would pull the sweep backwards.
    expect(buildWalkedEdgeArrivalSteps(["a", "b", "a", "b"]).get(walkedEdgeKey("a", "b"))).toBe(1);
  });

  it("names the same relations the key set does", () => {
    const trail = ["c", "a", "b", "a"];
    expect([...buildWalkedEdgeArrivalSteps(trail).keys()].sort()).toEqual(
      [...buildWalkedEdgeKeys(trail)].sort(),
    );
  });
});

describe("buildTrailGlintLegs", () => {
  /**
   * One speed: a leg twice as long owns twice the lap, or two lights seen together move at
   * different speeds.
   */
  it("gives each relation a share of the lap proportional to its length", () => {
    const legs = buildTrailGlintLegs([
      { key: "a b", length: 100 },
      { key: "b c", length: 300 },
    ]);
    expect(legs.get("a b")).toEqual({ start: 0, end: 0.25 });
    expect(legs.get("b c")).toEqual({ start: 0.25, end: 1 });
  });

  it("lays the legs end to end in the order it was given, covering the whole lap", () => {
    const legs = buildTrailGlintLegs([
      { key: "a b", length: 7 },
      { key: "b c", length: 11 },
      { key: "c d", length: 3 },
    ]);
    expect(legs.get("a b")!.start).toBe(0);
    expect(legs.get("a b")!.end).toBeCloseTo(legs.get("b c")!.start, 10);
    expect(legs.get("b c")!.end).toBeCloseTo(legs.get("c d")!.start, 10);
    expect(legs.get("c d")!.end).toBeCloseTo(1, 10);
  });

  it("falls back to equal slices when every stop sits at one point", () => {
    // A degenerate walk still traverses in order rather than dividing by zero.
    const legs = buildTrailGlintLegs([
      { key: "a b", length: 0 },
      { key: "b c", length: 0 },
    ]);
    expect(legs.get("a b")).toEqual({ start: 0, end: 0.5 });
    expect(legs.get("b c")).toEqual({ start: 0.5, end: 1 });
  });

  it("ignores a non-finite length rather than poisoning every share", () => {
    const legs = buildTrailGlintLegs([
      { key: "a b", length: Number.NaN },
      { key: "b c", length: 50 },
    ]);
    expect(legs.get("b c")).toEqual({ start: 0, end: 1 });
  });
});

describe("trailGlintLocalPhase", () => {
  it("rewrites the lap position in the relation's own coordinates", () => {
    const leg = { start: 0.25, end: 0.75 };
    expect(trailGlintLocalPhase(leg, 0.25)).toBeCloseTo(0, 10);
    expect(trailGlintLocalPhase(leg, 0.5)).toBeCloseTo(0.5, 10);
    expect(trailGlintLocalPhase(leg, 0.75)).toBeCloseTo(1, 10);
  });

  /** Every other relation reports nothing to draw (null), not 0 or 1. */
  it("is null while the light is somewhere else on the walk", () => {
    const leg = { start: 0.25, end: 0.75 };
    expect(trailGlintLocalPhase(leg, 0.1)).toBeNull();
    expect(trailGlintLocalPhase(leg, 0.9)).toBeNull();
    expect(trailGlintLocalPhase(undefined, 0.5)).toBeNull();
  });
});
