import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIER_REVEAL,
  edgeTierAlpha,
  nodeTierAlpha,
} from "./tier-visibility";

// farT: 1 = constellation/overview (zoomed OUT), 0 = circuit (zoomed IN).
const OVERVIEW = 1;
const CIRCUIT = 0;

describe("nodeTierAlpha", () => {
  it("keeps project and domain fully visible at every altitude (level-0 spine)", () => {
    for (const farT of [0, 0.3, 0.62, 0.85, 1]) {
      expect(nodeTierAlpha("project", false, farT, DEFAULT_TIER_REVEAL)).toBe(1);
      expect(nodeTierAlpha("domain", false, farT, DEFAULT_TIER_REVEAL)).toBe(1);
    }
  });

  it("keeps the single hub node visible at overview regardless of its kind", () => {
    expect(nodeTierAlpha("capability", true, OVERVIEW, DEFAULT_TIER_REVEAL)).toBe(1);
    expect(nodeTierAlpha("element", true, OVERVIEW, DEFAULT_TIER_REVEAL)).toBe(1);
  });

  it("hides capabilities and elements at overview (the fan-arc/soup fix)", () => {
    expect(nodeTierAlpha("capability", false, OVERVIEW, DEFAULT_TIER_REVEAL)).toBe(0);
    expect(nodeTierAlpha("element", false, OVERVIEW, DEFAULT_TIER_REVEAL)).toBe(0);
  });

  it("reveals capabilities and elements fully once zoomed into circuit range", () => {
    expect(nodeTierAlpha("capability", false, CIRCUIT, DEFAULT_TIER_REVEAL)).toBe(1);
    expect(nodeTierAlpha("element", false, CIRCUIT, DEFAULT_TIER_REVEAL)).toBe(1);
  });

  it("reveals capabilities before elements as you zoom in (staged semantic zoom)", () => {
    // Just inside the transition band: capabilities should already be more
    // visible than elements at the same altitude.
    const farT = 0.5;
    const cap = nodeTierAlpha("capability", false, farT, DEFAULT_TIER_REVEAL);
    const el = nodeTierAlpha("element", false, farT, DEFAULT_TIER_REVEAL);
    expect(cap).toBeGreaterThan(el);
  });

  it("is monotonic in farT for capabilities (no discrete flip)", () => {
    let prev = Infinity;
    for (let farT = 0; farT <= 1.0001; farT += 0.05) {
      const a = nodeTierAlpha("capability", false, farT, DEFAULT_TIER_REVEAL);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
  });
});

describe("edgeTierAlpha", () => {
  it("is the min of its endpoints' alphas (an edge shows only when both ends do)", () => {
    expect(edgeTierAlpha(1, 0)).toBe(0);
    expect(edgeTierAlpha(0.8, 0.4)).toBe(0.4);
    expect(edgeTierAlpha(1, 1)).toBe(1);
  });
});
