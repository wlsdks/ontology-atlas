import { afterEach, describe, expect, it } from "vitest";

import {
  BLOOM_RISE_MS,
  bloomAt,
  clearSignalledLines,
  headAt,
  hopDurationMs,
  isEdgeSignalled,
  isPlanAlive,
  type LightKinematics,
  LIGHT_FLOOR,
  markSignalledLine,
  type PathHop,
  planFocusSignal,
  planPathSignal,
  SIGNAL_CAP,
  type SignalEdge,
  signalFrame,
  stepPlan,
} from "./signal-plan";

const KINEMATICS: LightKinematics = {
  speed: 1100,
  hopMinMs: 180,
  hopMaxMs: 420,
  pathMaxMs: 1200,
  tail: 0.35,
  intensity: 0.9,
  bloomTauMs: 280,
};

function candidate(overrides: Partial<SignalEdge<string>> & Pick<SignalEdge<string>, "key" | "sourceId" | "targetId">): SignalEdge<string> {
  return {
    edge: overrides.key,
    directional: true,
    evidenceCount: 0,
    lengthPx: 400,
    sourceRadiusPx: 0,
    targetRadiusPx: 0,
    ...overrides,
  };
}

describe("planFocusSignal", () => {
  it("runs a directional relation source to target whichever end is focused", () => {
    const plan = planFocusSignal(
      "focus",
      [
        candidate({ key: "out", sourceId: "focus", targetId: "n1" }),
        candidate({ key: "in", sourceId: "n2", targetId: "focus" }),
      ],
      0,
      KINEMATICS,
      false,
    );
    const byKey = new Map(plan.signals.map((signal) => [signal.key, signal]));
    expect(byKey.get("out")).toMatchObject({ from: "a", fromId: "focus", toId: "n1", bloomId: "n1" });
    expect(byKey.get("in")).toMatchObject({ from: "a", fromId: "n2", toId: "focus", bloomId: null });
  });

  it("runs a symmetric relation from the focused end", () => {
    const plan = planFocusSignal(
      "focus",
      [candidate({ key: "peer", sourceId: "n1", targetId: "focus", directional: false })],
      0,
      KINEMATICS,
      false,
    );
    expect(plan.signals[0]).toMatchObject({ from: "b", fromId: "focus", toId: "n1" });
  });

  it("travels at the light speed between the clamps", () => {
    expect(hopDurationMs(330, KINEMATICS)).toBeCloseTo(300, 9);
    expect(hopDurationMs(40, KINEMATICS)).toBe(180);
    expect(hopDurationMs(4000, KINEMATICS)).toBe(420);
    const plan = planFocusSignal(
      "focus",
      [candidate({ key: "e", sourceId: "focus", targetId: "n", lengthPx: 400, sourceRadiusPx: 20, targetRadiusPx: 15 })],
      0,
      KINEMATICS,
      false,
    );
    expect(plan.signals[0]!.durationMs).toBeCloseTo((365 / 1100) * 1000, 6);
  });

  it("caps a hub at 48 lights, directional first, then by evidence, then by id", () => {
    const candidates: SignalEdge<string>[] = [];
    for (let i = 0; i < 60; i += 1) {
      candidates.push(
        candidate({
          key: `k${String(i).padStart(2, "0")}`,
          sourceId: "hub",
          targetId: `n${i}`,
          directional: i % 3 !== 0,
          evidenceCount: i % 5,
        }),
      );
    }
    const plan = planFocusSignal("hub", candidates, 0, KINEMATICS, false);
    expect(plan.signals).toHaveLength(SIGNAL_CAP);
    const order = plan.signals.map((signal) => candidates.find((c) => c.key === signal.key)!);
    const directionalCount = candidates.filter((c) => c.directional).length;
    expect(order.slice(0, directionalCount).every((c) => c.directional)).toBe(true);
    for (let i = 1; i < order.length; i += 1) {
      const previous = order[i - 1]!;
      const current = order[i]!;
      if (previous.directional !== current.directional) continue;
      expect(previous.evidenceCount).toBeGreaterThanOrEqual(current.evidenceCount);
      if (previous.evidenceCount === current.evidenceCount) expect(previous.key < current.key).toBe(true);
    }
  });

  it("plans nothing under reduced motion", () => {
    const plan = planFocusSignal("focus", [candidate({ key: "e", sourceId: "focus", targetId: "n" })], 0, KINEMATICS, true);
    expect(plan.signals).toEqual([]);
    expect(isPlanAlive(plan, 0, 1, KINEMATICS)).toBe(false);
  });
});

describe("planPathSignal", () => {
  function hop(key: string, fromId: string, toId: string, lengthPx: number): PathHop<string> {
    return { ...candidate({ key, sourceId: fromId, targetId: toId, lengthPx }), fromId, toId };
  }

  it("chains each hop from the end of the one before it", () => {
    const plan = planPathSignal("a", [hop("ab", "a", "b", 300), hop("bc", "b", "c", 500)], 100, KINEMATICS, false);
    const [first, second] = plan.signals;
    expect(first!.startMs).toBe(100);
    expect(second!.startMs).toBeCloseTo(first!.startMs + first!.durationMs, 9);
    expect(plan.signals.map((signal) => signal.bloomId)).toEqual(["b", "c"]);
    expect(plan.signals.every((signal) => !signal.revealBound)).toBe(true);
  });

  it("lights a hop the walk crosses backwards source to target, in its place in the walk", () => {
    const walk: PathHop<string>[] = [
      hop("ab", "a", "b", 300),
      { ...candidate({ key: "cb", sourceId: "c", targetId: "b", lengthPx: 300 }), fromId: "b", toId: "c" },
      hop("cd", "c", "d", 300),
    ];
    const plan = planPathSignal("a", walk, 0, KINEMATICS, false);
    const [first, reversed, last] = plan.signals;
    expect(reversed).toMatchObject({ from: "a", fromId: "c", toId: "b", bloomId: "c" });
    expect(reversed!.startMs).toBeCloseTo(first!.startMs + first!.durationMs, 9);
    expect(last!.startMs).toBeCloseTo(reversed!.startMs + reversed!.durationMs, 9);
  });

  it("lights a symmetric hop from the end the walk arrives at", () => {
    const plan = planPathSignal(
      "b",
      [{ ...candidate({ key: "ab", sourceId: "a", targetId: "b", directional: false }), fromId: "b", toId: "a" }],
      0,
      KINEMATICS,
      false,
    );
    expect(plan.signals[0]).toMatchObject({ from: "b", fromId: "b", toId: "a", bloomId: "a" });
  });

  it("scales a long path into the path budget", () => {
    const hops = Array.from({ length: 6 }, (_, i) => hop(`h${i}`, `n${i}`, `n${i + 1}`, 2000));
    const plan = planPathSignal("n0", hops, 0, KINEMATICS, false);
    const last = plan.signals.at(-1)!;
    expect(last.startMs + last.durationMs).toBeCloseTo(KINEMATICS.pathMaxMs, 6);
  });
});

describe("headAt", () => {
  const focus = planFocusSignal("focus", [candidate({ key: "e", sourceId: "focus", targetId: "n", lengthPx: 440 })], 0, KINEMATICS, false);
  const signal = focus.signals[0]!;

  it("rises monotonically and arrives by its duration once the reveal is drawn", () => {
    let previous = -1;
    for (let ms = 0; ms <= signal.durationMs; ms += 10) {
      const t = headAt(signal, ms, 1);
      expect(t).toBeGreaterThanOrEqual(previous);
      previous = t;
    }
    expect(headAt(signal, signal.durationMs, 1)).toBe(signal.arriveAt);
  });

  it("never runs ahead of the reveal's drawn span", () => {
    for (const reveal of [0.05, 0.3, 0.6]) {
      expect(headAt(signal, signal.durationMs, reveal)).toBeLessThanOrEqual(Math.max(reveal, signal.departAt));
    }
  });

  it("is not held by a reveal on a path hop", () => {
    const path = planPathSignal("a", [{ ...candidate({ key: "ab", sourceId: "a", targetId: "b" }), fromId: "a", toId: "b" }], 0, KINEMATICS, false);
    expect(headAt(path.signals[0]!, path.signals[0]!.durationMs, 0)).toBe(path.signals[0]!.arriveAt);
  });
});

describe("arrival and lifetime", () => {
  it("arrives when the head reaches the concept's mark, then blooms and decays", () => {
    const plan = planFocusSignal("focus", [candidate({ key: "e", sourceId: "focus", targetId: "n", lengthPx: 400, targetRadiusPx: 20 })], 0, KINEMATICS, false);
    const signal = plan.signals[0]!;
    stepPlan(plan, signal.durationMs - 1, 1);
    expect(Number.isNaN(signal.arrivedMs)).toBe(true);
    stepPlan(plan, signal.durationMs, 1);
    expect(signal.arrivedMs).toBe(signal.durationMs);
    expect(bloomAt(BLOOM_RISE_MS, KINEMATICS)).toBeCloseTo(KINEMATICS.intensity, 9);
    expect(bloomAt(BLOOM_RISE_MS - 1, KINEMATICS)).toBeLessThan(bloomAt(BLOOM_RISE_MS, KINEMATICS));
    expect(bloomAt(BLOOM_RISE_MS + 1, KINEMATICS)).toBeLessThan(bloomAt(BLOOM_RISE_MS, KINEMATICS));
    expect(isPlanAlive(plan, signal.durationMs + 100, 1, KINEMATICS)).toBe(true);
    const spent = signal.durationMs + BLOOM_RISE_MS + KINEMATICS.bloomTauMs * Math.log(KINEMATICS.intensity / LIGHT_FLOOR) + 1;
    expect(signalFrame(signal, spent, 1, KINEMATICS).done).toBe(true);
    expect(isPlanAlive(plan, spent, 1, KINEMATICS)).toBe(false);
  });

  it("waits at the reveal front, and never waits forever", () => {
    const plan = planFocusSignal("focus", [candidate({ key: "e", sourceId: "focus", targetId: "n" })], 0, KINEMATICS, false);
    const signal = plan.signals[0]!;
    stepPlan(plan, signal.durationMs + 100, 0.5);
    expect(Number.isNaN(signal.arrivedMs)).toBe(true);
    stepPlan(plan, signal.durationMs + 200, 1);
    expect(signal.arrivedMs).toBe(signal.durationMs + 200);
    const stalled = planFocusSignal("focus", [candidate({ key: "e", sourceId: "focus", targetId: "n" })], 0, KINEMATICS, false);
    stepPlan(stalled, 1e6, 0);
    expect(Number.isNaN(stalled.signals[0]!.arrivedMs)).toBe(false);
  });
});

describe("signalled lines", () => {
  afterEach(() => {
    clearSignalledLines();
  });

  it("knows a running line by its drawn curve, and forgets it on clear", () => {
    const a = { x: 1, y: 2 };
    const c = { x: 3, y: 4 };
    const b = { x: 5, y: 6 };
    expect(isEdgeSignalled(a, c, b)).toBe(false);
    for (let i = 0; i < 100; i += 1) markSignalledLine({ x: i, y: 0 }, c, b);
    markSignalledLine(a, c, b);
    expect(isEdgeSignalled(a, c, b)).toBe(true);
    expect(isEdgeSignalled(a, { x: 3, y: 4.5 }, b)).toBe(false);
    clearSignalledLines();
    expect(isEdgeSignalled(a, c, b)).toBe(false);
  });
});
