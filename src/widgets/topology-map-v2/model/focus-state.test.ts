import { describe, expect, it } from "vitest";

import {
  isNodeEmphasisActive,
  resolveEdgeEgoState,
  resolveEdgePulseSpeed,
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

describe("resolveEdgePulseSpeed", () => {
  const BASE = 0.075;
  const EGO = 0.2;

  it("keeps the ambient base speed when there is no focus", () => {
    expect(resolveEdgePulseSpeed(true, null, BASE, EGO)).toBe(BASE);
    expect(resolveEdgePulseSpeed(false, null, BASE, EGO)).toBe(BASE);
  });

  it("accelerates to the ego speed for an edge touching the focused node", () => {
    expect(resolveEdgePulseSpeed(true, "a", BASE, EGO)).toBe(EGO);
  });

  it("keeps the base speed for an edge not touching the focused node", () => {
    expect(resolveEdgePulseSpeed(false, "a", BASE, EGO)).toBe(BASE);
  });
});

describe("isNodeEmphasisActive", () => {
  it("follows the hover ego-set membership when there is no focus", () => {
    expect(isNodeEmphasisActive("b", null, true, null)).toBe(true);
    expect(isNodeEmphasisActive("z", null, false, null)).toBe(false);
  });

  it("suppresses hover emphasis while a focus is active", () => {
    // b is a live hover ego-member, but focus owns attention -> suppressed
    expect(isNodeEmphasisActive("b", "a", true, null)).toBe(false);
  });

  it("lets the panel-designated neighbor ramp under focus (panel↔map linkage)", () => {
    expect(isNodeEmphasisActive("b", "a", false, "b")).toBe(true);
    expect(isNodeEmphasisActive("c", "a", true, "b")).toBe(false);
  });
});

describe("scheduleRipple", () => {
  /**
   * A7 — total stagger budget. Uncapped, a 40-neighbor hub started its last
   * neighbor 523ms in (an enumeration, not a ripple) while a low-degree node
   * finished in ~91ms. Same interaction, same motion signature.
   */
  it("compresses the per-neighbor delay so a hub's ripple ends inside the budget", () => {
    const neighbors = Array.from({ length: 40 }, (_, i) => `n${i}`);
    const schedule = scheduleRipple("hub", 1000, neighbors, 55, 12, 180);
    const last = schedule[schedule.length - 1];
    expect(last.startAtMs - 1000).toBeLessThanOrEqual(55 + 180);
  });

  it("leaves low-degree ripples untouched (12ms/neighbor is already under budget)", () => {
    const schedule = scheduleRipple("node", 1000, ["a", "b", "c"], 55, 12, 180);
    expect(schedule[3].startAtMs).toBe(1000 + 55 + 2 * 12);
  });

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
