import { describe, expect, it } from "vitest";

import {
  resolveEdgeEgoState,
  resolveNodeEgoState,
  scheduleRipple,
  stepEmphasis,
} from "./focus-state";

describe("resolveNodeEgoState", () => {
  it("is normal for every node when there is no focus", () => {
    expect(resolveNodeEgoState("a", null, new Set())).toBe("normal");
  });

  it("is center for the focused node itself", () => {
    expect(resolveNodeEgoState("a", "a", new Set(["b", "c"]))).toBe("center");
  });

  it("is neighbor for a 1-hop neighbor of the focused node", () => {
    expect(resolveNodeEgoState("b", "a", new Set(["b", "c"]))).toBe("neighbor");
  });

  it("is dim for any other node while a focus is active", () => {
    expect(resolveNodeEgoState("z", "a", new Set(["b", "c"]))).toBe("dim");
  });
});

describe("resolveEdgeEgoState", () => {
  it("is normal when there is no focus", () => {
    expect(resolveEdgeEgoState(true, null)).toBe("normal");
    expect(resolveEdgeEgoState(false, null)).toBe("normal");
  });

  it("is ego when the edge touches the focused node", () => {
    expect(resolveEdgeEgoState(true, "a")).toBe("ego");
  });

  it("is dim when the edge does not touch the focused node", () => {
    expect(resolveEdgeEgoState(false, "a")).toBe("dim");
  });
});

describe("scheduleRipple", () => {
  it("schedules the hovered node itself to start immediately", () => {
    const schedule = scheduleRipple("hub", 1000, ["n1", "n2"], 55, 12);
    const own = schedule.find((s) => s.nodeId === "hub");
    expect(own?.startAtMs).toBe(1000);
  });

  it("staggers neighbors by baseDelay + index*perNeighborDelay", () => {
    const schedule = scheduleRipple("hub", 1000, ["n1", "n2", "n3"], 55, 12);
    expect(schedule.find((s) => s.nodeId === "n1")?.startAtMs).toBe(1000 + 55 + 0 * 12);
    expect(schedule.find((s) => s.nodeId === "n2")?.startAtMs).toBe(1000 + 55 + 1 * 12);
    expect(schedule.find((s) => s.nodeId === "n3")?.startAtMs).toBe(1000 + 55 + 2 * 12);
  });

  it("returns one schedule entry per neighbor plus the origin node", () => {
    const schedule = scheduleRipple("hub", 0, ["n1", "n2"], 55, 12);
    expect(schedule).toHaveLength(3);
  });
});

describe("stepEmphasis", () => {
  const RISE_TAU = 0.09;
  const DECAY_TAU = 0.15;

  it("rises toward 1 when active and the ripple has started", () => {
    // emphasis += (1 - 0) * (1 - exp(-dt/riseTau)); dt = riseTau -> factor = 1 - exp(-1) ≈ 0.6321206
    const next = stepEmphasis(0, true, true, RISE_TAU, RISE_TAU, DECAY_TAU);
    expect(next).toBeCloseTo(0.6321206, 5);
  });

  it("does not move while active but the ripple has not started yet", () => {
    const next = stepEmphasis(0.2, true, false, 0.05, RISE_TAU, DECAY_TAU);
    expect(next).toBe(0.2);
  });

  it("decays toward 0 when not in the active ego-set, regardless of ripple state", () => {
    // emphasis += (0 - 0.8) * (1 - exp(-dt/decayTau)); dt = decayTau -> factor ≈ 0.6321206
    // next = 0.8 - 0.8*0.6321206 = 0.8*(1-0.6321206) = 0.8*0.3678794 ≈ 0.2943035
    const next = stepEmphasis(0.8, false, false, DECAY_TAU, RISE_TAU, DECAY_TAU);
    expect(next).toBeCloseTo(0.2943035, 5);
  });

  it("stays within [0, 1] and approaches its asymptote over many steps", () => {
    let emphasis = 0;
    for (let i = 0; i < 240; i += 1) {
      emphasis = stepEmphasis(emphasis, true, true, 1 / 60, RISE_TAU, DECAY_TAU);
    }
    expect(emphasis).toBeGreaterThan(0.99);
    expect(emphasis).toBeLessThanOrEqual(1);
  });
});
