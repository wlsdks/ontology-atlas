import { describe, expect, it } from "vitest";

import { computeSelectionPulse } from "./selection-pulse";

describe("computeSelectionPulse", () => {
  it("is scale=1, alpha=1 at the exact commit instant (elapsed=0)", () => {
    const pulse = computeSelectionPulse(0, 200);
    expect(pulse).not.toBeNull();
    expect(pulse?.scaleFactor).toBeCloseTo(1, 6);
    expect(pulse?.alpha).toBeCloseTo(1, 6);
  });

  it("is null once elapsed reaches the duration (one-shot, never loops)", () => {
    expect(computeSelectionPulse(200, 200)).toBeNull();
    expect(computeSelectionPulse(250, 200)).toBeNull();
  });

  it("is null for a negative elapsed (defensive — no pulse before commit)", () => {
    expect(computeSelectionPulse(-5, 200)).toBeNull();
  });

  it("scale rises monotonically toward 1.15x and alpha falls monotonically toward 0", () => {
    let prevScale = -Infinity;
    let prevAlpha = Infinity;
    for (let ms = 0; ms < 200; ms += 10) {
      const pulse = computeSelectionPulse(ms, 200);
      expect(pulse).not.toBeNull();
      if (!pulse) continue;
      expect(pulse.scaleFactor).toBeGreaterThanOrEqual(prevScale - 1e-9);
      expect(pulse.alpha).toBeLessThanOrEqual(prevAlpha + 1e-9);
      prevScale = pulse.scaleFactor;
      prevAlpha = pulse.alpha;
    }
  });

  it("reaches ~1.15x scale just before the duration ends", () => {
    const pulse = computeSelectionPulse(199, 200);
    expect(pulse?.scaleFactor).toBeCloseTo(1.15, 2);
  });

  it("respects a custom duration (e.g. the 180ms token default)", () => {
    const mid = computeSelectionPulse(90, 180);
    expect(mid?.scaleFactor).toBeCloseTo(1.075, 6);
    expect(mid?.alpha).toBeCloseTo(0.5, 6);
  });
});
