import { describe, expect, it } from "vitest";

import {
  classifyAltitudeTier,
  computeAltitudeBand,
  computeFarT,
  smoothstep,
} from "./altitude";

describe("smoothstep", () => {
  it("is 0 at edge0 and 1 at edge1", () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
  });

  it("is exactly 0.5 at the midpoint (symmetric cubic)", () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it("clamps below edge0 to 0 and above edge1 to 1", () => {
    expect(smoothstep(10, 20, 5)).toBe(0);
    expect(smoothstep(10, 20, 25)).toBe(1);
  });

  it("matches t*t*(3-2t) at a known non-midpoint sample (t=0.25 -> 0.15625)", () => {
    expect(smoothstep(0, 1, 0.25)).toBeCloseTo(0.15625, 10);
  });
});

describe("computeAltitudeBand", () => {
  it("scales both ratios off the same overviewScale", () => {
    const band = computeAltitudeBand(1, 0.92, 0.62);
    expect(band.farHigh).toBeCloseTo(0.92, 10);
    expect(band.farLow).toBeCloseTo(0.62, 10);
  });

  it("scales proportionally for a non-unit overviewScale", () => {
    const band = computeAltitudeBand(2, 0.92, 0.62);
    expect(band.farHigh).toBeCloseTo(1.84, 10);
    expect(band.farLow).toBeCloseTo(1.24, 10);
  });
});

describe("computeFarT", () => {
  const FAR_HIGH = 0.92;
  const FAR_LOW = 0.62;

  it("is 0 (pure circuit) at or above FAR_HIGH", () => {
    expect(computeFarT(FAR_HIGH, FAR_LOW, FAR_HIGH)).toBe(0);
    expect(computeFarT(1.5, FAR_LOW, FAR_HIGH)).toBe(0);
  });

  it("is 1 (pure constellation) at or below FAR_LOW", () => {
    expect(computeFarT(FAR_LOW, FAR_LOW, FAR_HIGH)).toBe(1);
    expect(computeFarT(0.1, FAR_LOW, FAR_HIGH)).toBe(1);
  });

  it("has no discrete jump — is continuous across closely-spaced samples in the transition band", () => {
    const samples: number[] = [];
    const steps = 60;
    for (let i = 0; i <= steps; i += 1) {
      const scale = FAR_LOW + ((FAR_HIGH - FAR_LOW) * i) / steps;
      samples.push(computeFarT(scale, FAR_LOW, FAR_HIGH));
    }
    for (let i = 1; i < samples.length; i += 1) {
      const jump = Math.abs(samples[i] - samples[i - 1]);
      // With 60 even steps across the band, any single-step jump larger than
      // ~0.1 would indicate a discrete branch rather than a continuous curve.
      expect(jump).toBeLessThan(0.1);
    }
    // and it should be monotonically non-increasing as scale rises
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + 1e-9);
    }
  });
});

describe("classifyAltitudeTier", () => {
  it("is circuit below 0.15", () => {
    expect(classifyAltitudeTier(0)).toBe("circuit");
    expect(classifyAltitudeTier(0.14)).toBe("circuit");
  });

  it("is constellation above 0.85", () => {
    expect(classifyAltitudeTier(0.86)).toBe("constellation");
    expect(classifyAltitudeTier(1)).toBe("constellation");
  });

  it("is transitioning strictly between 0.15 and 0.85", () => {
    expect(classifyAltitudeTier(0.5)).toBe("transitioning");
    expect(classifyAltitudeTier(0.15)).toBe("transitioning");
    expect(classifyAltitudeTier(0.85)).toBe("transitioning");
  });
});
