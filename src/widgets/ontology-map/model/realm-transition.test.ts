import { describe, expect, it } from "vitest";

import {
  INITIAL_REALM_TRANSITION_STATE,
  REALM_ENVELOPE_MS,
  REALM_EXIT_ENVELOPE_MS,
  REALM_EXIT_FLIP_DELAY_STEP_MS,
  REALM_EXIT_OUTSIDE_RETURN_MS,
  REALM_EXIT_WARDING_ERASE_MS,
  REALM_FLING_REACH,
  REALM_INSIDE_FLIP_DELAY_MS,
  REALM_INSIDE_FLIP_DELAY_STEP_MS,
  REALM_INSIDE_FLIP_MS,
  REALM_OUTSIDE_FLING_MS,
  isRealmEngaged,
  isRealmOutsideCulled,
  realmDepthClarityAlpha,
  realmDepthClarityScale,
  realmDustParallaxFactor,
  realmExitFlipDelayFor,
  realmInsideFlipDelayFor,
  realmInsidePosition,
  realmOutsidePosition,
  realmOutsideReturnAlpha,
  realmOutsideReturnPosition,
  realmOutsideReturnReach,
  realmTransitionReducer,
  realmWardingDrawProgress,
  realmWardingEraseProgress,
  type RealmTransitionState,
} from "./realm-transition";

describe("realmTransitionReducer", () => {
  it("enter opens an entering transition with the envelope duration", () => {
    const s = realmTransitionReducer(INITIAL_REALM_TRANSITION_STATE, {
      type: "enter",
      rootId: "c",
      now: 1000,
      reducedMotion: false,
    });
    expect(s).toEqual({ phase: "entering", rootId: "c", startMs: 1000, durationMs: REALM_ENVELOPE_MS });
  });

  it("reduced-motion enter has zero duration (immediate)", () => {
    const s = realmTransitionReducer(INITIAL_REALM_TRANSITION_STATE, {
      type: "enter",
      rootId: "c",
      now: 0,
      reducedMotion: true,
    });
    expect(s.durationMs).toBe(0);
  });

  it("tick settles entering → active after the duration elapses", () => {
    const entering: RealmTransitionState = { phase: "entering", rootId: "c", startMs: 0, durationMs: REALM_ENVELOPE_MS };
    expect(realmTransitionReducer(entering, { type: "tick", now: 300 }).phase).toBe("entering");
    expect(realmTransitionReducer(entering, { type: "tick", now: REALM_ENVELOPE_MS }).phase).toBe("active");
  });

  it("exit from active opens an exiting transition; tick settles it back to idle", () => {
    const active: RealmTransitionState = { phase: "active", rootId: "c", startMs: 0, durationMs: 0 };
    const exiting = realmTransitionReducer(active, { type: "exit", now: 500, reducedMotion: false });
    expect(exiting.phase).toBe("exiting");
    expect(exiting.durationMs).toBe(REALM_EXIT_ENVELOPE_MS);
    const stillExiting = realmTransitionReducer(exiting, { type: "tick", now: 500 + REALM_EXIT_ENVELOPE_MS - 1 });
    expect(stillExiting.phase).toBe("exiting");
    const idle = realmTransitionReducer(exiting, { type: "tick", now: 500 + REALM_EXIT_ENVELOPE_MS });
    expect(idle).toEqual(INITIAL_REALM_TRANSITION_STATE);
  });

  it("exit from idle is a no-op", () => {
    expect(
      realmTransitionReducer(INITIAL_REALM_TRANSITION_STATE, { type: "exit", now: 5, reducedMotion: false }),
    ).toEqual(INITIAL_REALM_TRANSITION_STATE);
  });

  it("enter re-targets a new root even mid-transition", () => {
    const entering: RealmTransitionState = { phase: "entering", rootId: "c", startMs: 0, durationMs: REALM_ENVELOPE_MS };
    const s = realmTransitionReducer(entering, { type: "enter", rootId: "d", now: 100, reducedMotion: false });
    expect(s.rootId).toBe("d");
    expect(s.phase).toBe("entering");
    expect(s.startMs).toBe(100);
  });
});

describe("phase helpers", () => {
  it("isRealmEngaged is true for any non-idle phase", () => {
    expect(isRealmEngaged("idle")).toBe(false);
    expect(isRealmEngaged("entering")).toBe(true);
    expect(isRealmEngaged("active")).toBe(true);
    expect(isRealmEngaged("exiting")).toBe(true);
  });

  it("isRealmOutsideCulled only after the fling completes / while active", () => {
    expect(isRealmOutsideCulled({ phase: "idle", rootId: null, startMs: 0, durationMs: 0 }, 0)).toBe(false);
    expect(isRealmOutsideCulled({ phase: "active", rootId: "c", startMs: 0, durationMs: 0 }, 0)).toBe(true);
    const entering: RealmTransitionState = { phase: "entering", rootId: "c", startMs: 0, durationMs: REALM_ENVELOPE_MS };
    expect(isRealmOutsideCulled(entering, REALM_OUTSIDE_FLING_MS - 1)).toBe(false);
    expect(isRealmOutsideCulled(entering, REALM_OUTSIDE_FLING_MS)).toBe(true);
    expect(isRealmOutsideCulled({ phase: "exiting", rootId: "c", startMs: 0, durationMs: 300 }, 999)).toBe(false);
  });
});

describe("realmInsidePosition (FLIP)", () => {
  it("is `from` at t=0 and exactly `to` at/after the duration", () => {
    const from = { x: 100, y: -50 };
    const to = { x: 0, y: 0 };
    expect(realmInsidePosition(from, to, 0)).toEqual(from);
    const end = realmInsidePosition(from, to, REALM_INSIDE_FLIP_MS);
    expect(end.x).toBeCloseTo(0);
    expect(end.y).toBeCloseTo(0);
  });

  it("reduced-motion (duration 0) snaps straight to `to`", () => {
    expect(realmInsidePosition({ x: 9, y: 9 }, { x: 1, y: 2 }, 0, 0)).toEqual({ x: 1, y: 2 });
  });

  it("eases out — past the midpoint of progress by the time midpoint", () => {
    const p = realmInsidePosition({ x: 0, y: 0 }, { x: 100, y: 0 }, REALM_INSIDE_FLIP_MS / 2);
    expect(p.x).toBeGreaterThan(50);
  });
});

describe("realmOutsidePosition (gravity fling)", () => {
  it("accelerates radially outward from the center", () => {
    const from = { x: 100, y: 0 };
    const center = { x: 0, y: 0 };
    const start = realmOutsidePosition(from, center, 0);
    expect(start.x).toBeCloseTo(100);
    const mid = realmOutsidePosition(from, center, REALM_OUTSIDE_FLING_MS / 2);
    const end = realmOutsidePosition(from, center, REALM_OUTSIDE_FLING_MS);
    expect(Math.hypot(mid.x, mid.y)).toBeGreaterThan(100);
    expect(Math.hypot(end.x, end.y)).toBeGreaterThan(Math.hypot(mid.x, mid.y));
  });

  it("uses the fallback angle when the node sits exactly on the center", () => {
    // reduced-motion (duration 0) flings straight along the fallback angle with
    // no curl — a coincident node still leaves the center in a deterministic
    // direction (straight up for PI/2) instead of collapsing to NaN.
    const p = realmOutsidePosition({ x: 0, y: 0 }, { x: 0, y: 0 }, 5, { duration: 0, fallbackAngle: Math.PI / 2 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const a = realmOutsidePosition({ x: 40, y: 30 }, { x: 0, y: 0 }, 120);
    const b = realmOutsidePosition({ x: 40, y: 30 }, { x: 0, y: 0 }, 120);
    expect(a).toEqual(b);
  });
});

describe("realmWardingDrawProgress", () => {
  it("ramps 0→1 over the draw duration and clamps", () => {
    expect(realmWardingDrawProgress(0)).toBe(0);
    expect(realmWardingDrawProgress(9999)).toBe(1);
    expect(realmWardingDrawProgress(-5)).toBe(0);
  });
});

describe("realmInsideFlipDelayFor (depth-staggered assembly)", () => {
  it("uses the base delay for the root and domains (depth <= 1)", () => {
    expect(realmInsideFlipDelayFor(0)).toBe(REALM_INSIDE_FLIP_DELAY_MS);
    expect(realmInsideFlipDelayFor(1)).toBe(REALM_INSIDE_FLIP_DELAY_MS);
  });

  it("adds one step at depth 2 and saturates at two steps for depth 3+", () => {
    expect(realmInsideFlipDelayFor(2)).toBe(REALM_INSIDE_FLIP_DELAY_MS + REALM_INSIDE_FLIP_DELAY_STEP_MS);
    expect(realmInsideFlipDelayFor(3)).toBe(REALM_INSIDE_FLIP_DELAY_MS + REALM_INSIDE_FLIP_DELAY_STEP_MS * 2);
    expect(realmInsideFlipDelayFor(9)).toBe(realmInsideFlipDelayFor(3));
  });

  it("settles the deepest ring delay plus FLIP inside the envelope", () => {
    expect(realmInsideFlipDelayFor(3) + REALM_INSIDE_FLIP_MS).toBe(REALM_ENVELOPE_MS);
  });

  it("increases the delay monotonically with depth", () => {
    expect(realmInsideFlipDelayFor(1)).toBeLessThan(realmInsideFlipDelayFor(2));
    expect(realmInsideFlipDelayFor(2)).toBeLessThan(realmInsideFlipDelayFor(3));
  });
});

describe("realmDepthClarity (depth clarity)", () => {
  it("lowers alpha with depth and keeps 1.0 at depth <= 1", () => {
    expect(realmDepthClarityAlpha(0)).toBe(1);
    expect(realmDepthClarityAlpha(1)).toBe(1);
    // Raised from 0.92/0.84 on 2026-08-18: 0.84 composited with the leaf ink
    // gave 2.58:1, under the WCAG 1.4.11 floor of 3:1. Safe minimum is 0.955.
    expect(realmDepthClarityAlpha(2)).toBeCloseTo(0.98);
    expect(realmDepthClarityAlpha(3)).toBeCloseTo(0.96);
    expect(realmDepthClarityAlpha(7)).toBe(realmDepthClarityAlpha(3));
  });

  it("shrinks scale with depth and keeps 1.0 at depth <= 1, mirroring alpha", () => {
    expect(realmDepthClarityScale(1)).toBe(1);
    expect(realmDepthClarityScale(2)).toBeCloseTo(0.97);
    expect(realmDepthClarityScale(3)).toBeCloseTo(0.94);
    expect(realmDepthClarityScale(4)).toBe(realmDepthClarityScale(3));
  });
});

describe("realmDustParallaxFactor", () => {
  it("is 0 at the endpoints and peaks in the middle (transient, not sustained)", () => {
    expect(realmDustParallaxFactor(0)).toBe(0);
    expect(realmDustParallaxFactor(9999)).toBe(0);
    const peak = realmDustParallaxFactor(300, 600);
    expect(peak).toBeCloseTo(1, 5);
  });
});

describe("realmExitFlipDelayFor (exit in reverse depth order, deepest first)", () => {
  it("leaves depth 3+ first (0) and shallower later, reversing the entry stagger", () => {
    expect(realmExitFlipDelayFor(3)).toBe(0);
    expect(realmExitFlipDelayFor(9)).toBe(0);
    expect(realmExitFlipDelayFor(2)).toBe(REALM_EXIT_FLIP_DELAY_STEP_MS);
    expect(realmExitFlipDelayFor(1)).toBe(REALM_EXIT_FLIP_DELAY_STEP_MS * 2);
    expect(realmExitFlipDelayFor(0)).toBe(REALM_EXIT_FLIP_DELAY_STEP_MS * 2);
  });

  it("runs opposite to the entry delay, decreasing as depth grows", () => {
    expect(realmExitFlipDelayFor(3)).toBeLessThan(realmExitFlipDelayFor(2));
    expect(realmExitFlipDelayFor(2)).toBeLessThan(realmExitFlipDelayFor(1));
    // Entry runs the other way: the deeper the layer, the later it starts.
    expect(realmInsideFlipDelayFor(1)).toBeLessThan(realmInsideFlipDelayFor(3));
  });
});

describe("realmWardingEraseProgress (reverse erase of the ward)", () => {
  it("plays back from 1 to 0, clamped", () => {
    expect(realmWardingEraseProgress(0)).toBe(1);
    expect(realmWardingEraseProgress(REALM_EXIT_WARDING_ERASE_MS)).toBe(0);
    expect(realmWardingEraseProgress(9999)).toBe(0);
    expect(realmWardingEraseProgress(-5)).toBe(1);
  });

  it("is 0 (erased) at once for duration <= 0", () => {
    expect(realmWardingEraseProgress(5, 0)).toBe(0);
  });
});

describe("realmOutsideReturnReach (reverse gravity reach from 1 to 0)", () => {
  it("is 1 (fully out) at elapsed 0 and 0 (home) at duration", () => {
    expect(realmOutsideReturnReach(0)).toBeCloseTo(1);
    expect(realmOutsideReturnReach(REALM_EXIT_OUTSIDE_RETURN_MS)).toBeCloseTo(0);
  });

  it("lands decelerating: the late part changes slower than the early part", () => {
    const d = REALM_EXIT_OUTSIDE_RETURN_MS;
    const early = realmOutsideReturnReach(0, d) - realmOutsideReturnReach(d * 0.1, d);
    const late = realmOutsideReturnReach(d * 0.9, d) - realmOutsideReturnReach(d, d);
    expect(early).toBeGreaterThan(late);
  });

  it("is 0 for duration <= 0", () => {
    expect(realmOutsideReturnReach(5, 0)).toBe(0);
  });
});

describe("realmOutsideReturnAlpha (outside nodes materialise on return)", () => {
  it("is 0 (fully out, hidden) at elapsed 0 and 1 (home, full alpha) at duration", () => {
    expect(realmOutsideReturnAlpha(0)).toBeCloseTo(0);
    expect(realmOutsideReturnAlpha(REALM_EXIT_OUTSIDE_RETURN_MS)).toBeCloseTo(1);
  });

  it("is the exact complement of reach (1 - reach), always summing to 1", () => {
    const d = REALM_EXIT_OUTSIDE_RETURN_MS;
    for (const t of [0, d * 0.25, d * 0.5, d * 0.75, d]) {
      expect(realmOutsideReturnAlpha(t, d) + realmOutsideReturnReach(t, d)).toBeCloseTo(1);
    }
  });

  it("increases monotonically, sharpening on return without a pop-in", () => {
    const d = REALM_EXIT_OUTSIDE_RETURN_MS;
    const early = realmOutsideReturnAlpha(d * 0.2, d);
    const mid = realmOutsideReturnAlpha(d * 0.5, d);
    const late = realmOutsideReturnAlpha(d * 0.8, d);
    expect(early).toBeLessThan(mid);
    expect(mid).toBeLessThan(late);
  });

  it("is 1 for duration <= 0 (reduced motion: full alpha at once, the complement of reach 0)", () => {
    expect(realmOutsideReturnAlpha(5, 0)).toBe(1);
  });
});

describe("realmOutsideReturnPosition (fling played in reverse)", () => {
  it("matches the fling end at elapsed 0 and lands exactly home at duration (no jump)", () => {
    const from = { x: 120, y: -40 };
    const center = { x: 0, y: 0 };
    // Reproduce where the entry fling ended (e = 1 at the fling duration).
    const flungEnd = realmOutsidePosition(from, center, REALM_OUTSIDE_FLING_MS);
    const start = realmOutsideReturnPosition(from, center, 0);
    expect(start.x).toBeCloseTo(flungEnd.x, 3);
    expect(start.y).toBeCloseTo(flungEnd.y, 3);
    const landed = realmOutsideReturnPosition(from, center, REALM_EXIT_OUTSIDE_RETURN_MS);
    expect(landed.x).toBeCloseTo(from.x, 3);
    expect(landed.y).toBeCloseTo(from.y, 3);
  });

  it("decreases the radius monotonically over time (returning)", () => {
    const from = { x: 100, y: 0 };
    const center = { x: 0, y: 0 };
    const d = REALM_EXIT_OUTSIDE_RETURN_MS;
    const r0 = Math.hypot(realmOutsideReturnPosition(from, center, 0).x, realmOutsideReturnPosition(from, center, 0).y);
    const rMid = Math.hypot(realmOutsideReturnPosition(from, center, d / 2).x, realmOutsideReturnPosition(from, center, d / 2).y);
    const rEnd = Math.hypot(realmOutsideReturnPosition(from, center, d).x, realmOutsideReturnPosition(from, center, d).y);
    expect(r0).toBeGreaterThan(rMid);
    expect(rMid).toBeGreaterThan(rEnd);
    expect(r0).toBeCloseTo(100 + REALM_FLING_REACH, 0);
  });

  it("goes home at once under reduced motion (duration 0)", () => {
    expect(realmOutsideReturnPosition({ x: 7, y: 3 }, { x: 0, y: 0 }, 5, { duration: 0 })).toEqual({ x: 7, y: 3 });
  });

  it("returns a node on the centre along the fallback angle (no NaN)", () => {
    const p = realmOutsideReturnPosition({ x: 0, y: 0 }, { x: 0, y: 0 }, 10, { fallbackAngle: Math.PI / 2 });
    expect(Number.isNaN(p.x)).toBe(false);
    expect(Number.isNaN(p.y)).toBe(false);
  });
});
