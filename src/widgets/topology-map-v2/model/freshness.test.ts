import { describe, expect, it } from "vitest";

import { resolveFreshnessVisual } from "./freshness";

describe("resolveFreshnessVisual", () => {
  it("neutral node (no fresh/stale/hub) has no overlays at all", () => {
    const visual = resolveFreshnessVisual({ fresh: false, stale: false, hub: false }, false);
    expect(visual.breatheEnabled).toBe(false);
    expect(visual.strokeIndigoLerp).toBe(0);
    expect(visual.dash).toEqual([]);
    expect(visual.hubRingEnabled).toBe(false);
    expect(visual.useStaleFillStroke).toBe(false);
  });

  it("fresh node breathes and lerps stroke 85% toward indigo", () => {
    const visual = resolveFreshnessVisual({ fresh: true, stale: false, hub: false }, false);
    expect(visual.breatheEnabled).toBe(true);
    expect(visual.strokeIndigoLerp).toBeCloseTo(0.85, 5);
    expect(visual.useStaleFillStroke).toBe(false);
  });

  it("fresh node under reduced motion does not breathe, but keeps the stroke lerp", () => {
    const visual = resolveFreshnessVisual({ fresh: true, stale: false, hub: false }, true);
    expect(visual.breatheEnabled).toBe(false);
    expect(visual.strokeIndigoLerp).toBeCloseTo(0.85, 5);
  });

  it("stale node dashes the border and uses the dim fill/stroke pair, never breathes", () => {
    const visual = resolveFreshnessVisual({ fresh: false, stale: true, hub: false }, false);
    expect(visual.dash).toEqual([3, 3]);
    expect(visual.useStaleFillStroke).toBe(true);
    expect(visual.breatheEnabled).toBe(false);
  });

  it("hub alone only sets hubRingEnabled, independent of fresh/stale", () => {
    const visual = resolveFreshnessVisual({ fresh: false, stale: false, hub: true }, false);
    expect(visual.hubRingEnabled).toBe(true);
    expect(visual.breatheEnabled).toBe(false);
    expect(visual.dash).toEqual([]);
  });

  it("hub+fresh combines both overlays (orthogonal, not exclusive)", () => {
    const visual = resolveFreshnessVisual({ fresh: true, stale: false, hub: true }, false);
    expect(visual.hubRingEnabled).toBe(true);
    expect(visual.breatheEnabled).toBe(true);
  });

  it("hub+stale combines both overlays (orthogonal, not exclusive)", () => {
    const visual = resolveFreshnessVisual({ fresh: false, stale: true, hub: true }, false);
    expect(visual.hubRingEnabled).toBe(true);
    expect(visual.dash).toEqual([3, 3]);
    expect(visual.useStaleFillStroke).toBe(true);
  });

  it("if both fresh and stale flags are somehow true, stale visually wins (dim + dash, no breathe)", () => {
    const visual = resolveFreshnessVisual({ fresh: true, stale: true, hub: false }, false);
    expect(visual.useStaleFillStroke).toBe(true);
    expect(visual.breatheEnabled).toBe(false);
    expect(visual.dash).toEqual([3, 3]);
  });
});
