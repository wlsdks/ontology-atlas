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

  it("scale rises monotonically toward 1+delta and alpha falls monotonically toward 0", () => {
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

  it("reaches ~1+delta scale just before the duration ends (easeOutCubic lands flat)", () => {
    const pulse = computeSelectionPulse(199, 200, 0.28);
    expect(pulse?.scaleFactor).toBeCloseTo(1.28, 2);
  });

  /**
   * A3 — a commit gesture must DECELERATE to read as "received" (Apple HIG).
   * Linear channels cut off with non-zero slope: the ring vanished instead of
   * completing. Both channels now end with ~zero slope.
   */
  it("decelerates: more than half the ring growth happens in the first half", () => {
    const mid = computeSelectionPulse(90, 180, 0.28);
    const growthAtMid = (mid!.scaleFactor - 1) / 0.28;
    expect(growthAtMid).toBeGreaterThan(0.8); // easeOutCubic(0.5) = 0.875
  });

  it("alpha dies smoothly — quadratic, near-zero slope at the end", () => {
    const nearEnd = computeSelectionPulse(178, 180, 0.28);
    expect(nearEnd!.alpha).toBeLessThan(0.001);
    const mid = computeSelectionPulse(90, 180, 0.28);
    expect(mid!.alpha).toBeCloseTo(0.25, 6); // (1-0.5)^2
  });

  it("threads the token scale delta through (default 0.28 when omitted)", () => {
    const withToken = computeSelectionPulse(179, 180, 0.4);
    expect(withToken!.scaleFactor).toBeCloseTo(1.4, 2);
    const withDefault = computeSelectionPulse(179, 180);
    expect(withDefault!.scaleFactor).toBeCloseTo(1.28, 2);
  });
});
