import { describe, expect, it } from "vitest";

import {
  classifyZoomTier,
  computeZoomRatio,
  DEFAULT_TIER_REVEAL,
  edgeTierAlpha,
  effectiveNodeAlpha,
  HITTABLE_MIN_TIER_ALPHA,
  isNodeHittable,
  isSpineOnlyZoom,
  nodeTierAlpha,
} from "./tier-visibility";

// zoomRatio: 1 = overview entry, >1 zoomed IN, <1 zoomed OUT.
const ENTRY = 1;
const ZOOMED_IN = 4; // well past both reveal bands
const ZOOMED_OUT = 0.5;

describe("computeZoomRatio", () => {
  it("is 1.0 exactly at the overview entry scale", () => {
    expect(computeZoomRatio(0.87, 0.87)).toBe(1);
  });

  it("is >1 zoomed in and <1 zoomed out", () => {
    expect(computeZoomRatio(1.74, 0.87)).toBeCloseTo(2, 6);
    expect(computeZoomRatio(0.435, 0.87)).toBeCloseTo(0.5, 6);
  });

  it("guards a non-positive entry scale (returns 1)", () => {
    expect(computeZoomRatio(0.9, 0)).toBe(1);
    expect(computeZoomRatio(0.9, -1)).toBe(1);
  });
});

describe("nodeTierAlpha", () => {
  it("keeps project and domain fully visible at every zoom ratio (level-0 spine)", () => {
    for (const ratio of [0.4, 1, 1.5, 2.5, 4]) {
      expect(nodeTierAlpha("project", false, ratio, DEFAULT_TIER_REVEAL)).toBe(1);
      expect(nodeTierAlpha("domain", false, ratio, DEFAULT_TIER_REVEAL)).toBe(1);
    }
  });

  it("keeps the single hub node visible at entry regardless of its kind", () => {
    expect(nodeTierAlpha("capability", true, ENTRY, DEFAULT_TIER_REVEAL)).toBe(1);
    expect(nodeTierAlpha("element", true, ENTRY, DEFAULT_TIER_REVEAL)).toBe(1);
  });

  it("hides capabilities and elements at the overview entry (the fan-arc/soup fix)", () => {
    expect(nodeTierAlpha("capability", false, ENTRY, DEFAULT_TIER_REVEAL)).toBe(0);
    expect(nodeTierAlpha("element", false, ENTRY, DEFAULT_TIER_REVEAL)).toBe(0);
  });

  it("keeps capabilities and elements hidden when zoomed OUT (never soup below entry)", () => {
    expect(nodeTierAlpha("capability", false, ZOOMED_OUT, DEFAULT_TIER_REVEAL)).toBe(0);
    expect(nodeTierAlpha("element", false, ZOOMED_OUT, DEFAULT_TIER_REVEAL)).toBe(0);
  });

  it("reveals capabilities and elements fully once zoomed deep in", () => {
    expect(nodeTierAlpha("capability", false, ZOOMED_IN, DEFAULT_TIER_REVEAL)).toBe(1);
    expect(nodeTierAlpha("element", false, ZOOMED_IN, DEFAULT_TIER_REVEAL)).toBe(1);
  });

  it("reveals capabilities before elements as you zoom in (staged semantic zoom)", () => {
    // At the capability full-reveal ratio, capabilities are fully in while
    // elements (deeper band) have not started yet.
    const ratio = DEFAULT_TIER_REVEAL.capability.fullRatio;
    const cap = nodeTierAlpha("capability", false, ratio, DEFAULT_TIER_REVEAL);
    const el = nodeTierAlpha("element", false, ratio, DEFAULT_TIER_REVEAL);
    expect(cap).toBeGreaterThan(el);
    expect(el).toBe(0);
  });

  it("is monotonic non-decreasing in zoom ratio for capabilities (no discrete flip)", () => {
    let prev = -Infinity;
    for (let ratio = 0.4; ratio <= 4.0001; ratio += 0.05) {
      const a = nodeTierAlpha("capability", false, ratio, DEFAULT_TIER_REVEAL);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-9);
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

/**
 * C1 A2 — focus ego tier exemption. A capability/element with a near-zero
 * tierAlpha (semantic-zoom-hidden at overview) must still become visible when
 * it's in the focused node's ego set, ramping smoothly via `egoRamp` — never
 * a hard pop, and never affecting non-ego-members.
 */
describe("effectiveNodeAlpha", () => {
  it("is unchanged for a non-ego-member regardless of egoRamp", () => {
    expect(effectiveNodeAlpha(0, false, 1)).toBe(0);
    expect(effectiveNodeAlpha(0.3, false, 1)).toBe(0.3);
  });

  it("is the max of tierAlpha and egoRamp for an ego member", () => {
    expect(effectiveNodeAlpha(0, true, 0.7)).toBe(0.7);
    expect(effectiveNodeAlpha(0.9, true, 0.2)).toBe(0.9);
    expect(effectiveNodeAlpha(0, true, 0)).toBe(0);
  });

  it("reaches full opacity for an ego member once its ramp completes", () => {
    expect(effectiveNodeAlpha(0, true, 1)).toBe(1);
  });
});

describe("isSpineOnlyZoom (QA 소실 A — clamp-bounds source)", () => {
  it("is true at the overview entry and while zoomed out (only the spine draws)", () => {
    expect(isSpineOnlyZoom(ENTRY, DEFAULT_TIER_REVEAL)).toBe(true);
    expect(isSpineOnlyZoom(0.5, DEFAULT_TIER_REVEAL)).toBe(true);
    // Just below the capability enter ratio: still spine-only.
    expect(isSpineOnlyZoom(DEFAULT_TIER_REVEAL.capability.enterRatio - 1e-6, DEFAULT_TIER_REVEAL)).toBe(true);
  });

  it("flips false exactly when the capability tier begins revealing (full bounds become honest)", () => {
    expect(isSpineOnlyZoom(DEFAULT_TIER_REVEAL.capability.enterRatio, DEFAULT_TIER_REVEAL)).toBe(false);
    expect(isSpineOnlyZoom(ZOOMED_IN, DEFAULT_TIER_REVEAL)).toBe(false);
  });

  it("agrees with nodeTierAlpha: spine-only zoom ⇔ capabilities are fully hidden", () => {
    for (let ratio = 0.4; ratio <= 4.0001; ratio += 0.05) {
      const spineOnly = isSpineOnlyZoom(ratio, DEFAULT_TIER_REVEAL);
      const capAlpha = nodeTierAlpha("capability", false, ratio, DEFAULT_TIER_REVEAL);
      if (spineOnly) expect(capAlpha).toBe(0);
      else expect(capAlpha).toBeGreaterThanOrEqual(0);
    }
  });
});

/**
 * persona eval (label-clarity, 2026-07) — "child click ejects to overview
 * instead of selecting". `isNodeHittable` is the pure predicate extracted
 * from `ui/topology-pointer-handlers.ts#hitVisibleNode`'s inline filter —
 * mirrors the draw pass's `effectiveNodeAlpha` ego exemption exactly, so a
 * capability revealed only because it's the focused domain's 1-hop neighbor
 * is STILL hittable even though its own tier alpha is 0 at that zoom ratio.
 */
describe("isNodeHittable", () => {
  const domain = { id: "domain:x", kind: "domain" as const, isHub: false };
  const hiddenCapability = { id: "capability:hidden", kind: "capability" as const, isHub: false };
  const otherCapability = { id: "capability:other", kind: "capability" as const, isHub: false };

  it("is always hittable at/above the tier's own hittable threshold, focus or not", () => {
    expect(isNodeHittable(domain, ENTRY, null, undefined)).toBe(true);
    expect(isNodeHittable(domain, ENTRY, "domain:x", new Set())).toBe(true);
  });

  it("is NOT hittable below the tier threshold when no focus is active", () => {
    expect(isNodeHittable(hiddenCapability, ENTRY, null, undefined)).toBe(false);
  });

  it("is hittable when it IS the focused node itself, even below its own tier threshold", () => {
    expect(isNodeHittable(hiddenCapability, ENTRY, "capability:hidden", new Set())).toBe(true);
  });

  it("is hittable when it's a 1-hop neighbor of the focused node (the ego exemption) — the exact 'click a revealed child' case", () => {
    const neighbors = new Set(["capability:hidden"]);
    expect(isNodeHittable(hiddenCapability, ENTRY, "domain:x", neighbors)).toBe(true);
  });

  it("stays UNhittable below threshold when focused elsewhere and not a neighbor of that focus", () => {
    const neighbors = new Set(["capability:hidden"]);
    expect(isNodeHittable(otherCapability, ENTRY, "domain:x", neighbors)).toBe(false);
  });

  it("is NOT hittable when clustered (selective-ego hidden neighbor), even as a 1-hop neighbor of the focus (S3 known gap)", () => {
    const neighbors = new Set(["capability:hidden"]);
    // Without the clustered set the ego exemption keeps it hittable...
    expect(isNodeHittable(hiddenCapability, ENTRY, "domain:x", neighbors)).toBe(true);
    // ...but once it's folded behind the `이웃 +N` chip (in the frame's clustered
    // set) it must not be grabbable — it isn't drawn.
    const clustered = new Set(["capability:hidden"]);
    expect(isNodeHittable(hiddenCapability, ENTRY, "domain:x", neighbors, DEFAULT_TIER_REVEAL, clustered)).toBe(false);
  });

  it("uses the realm depth-tier override so a depth1 element child is hittable at spine zoom (S10 결함 3)", () => {
    // In a realm ('영역') the child's ORIGINAL kind is `element` (tier-gated at
    // spine zoom), but its depth-1 placement makes the draw pass treat it as a
    // `domain`-tier node (always drawn). Without the override the hit test gates
    // it out by its element kind → drawn-but-unclickable (the reported 무반응).
    const depth1Element = { id: "element:child", kind: "element" as const, isHub: false };
    // No override → element tier gated out at overview entry, no focus.
    expect(isNodeHittable(depth1Element, ENTRY, null, undefined)).toBe(false);
    // With the realm tier override (depth1 → domain) it becomes hittable.
    const tierKinds = new Map([["element:child", "domain" as const]]);
    expect(isNodeHittable(depth1Element, ENTRY, null, undefined, DEFAULT_TIER_REVEAL, undefined, tierKinds)).toBe(true);
  });

  it("keeps a clustered node unhittable even with a permissive realm tier override", () => {
    const depth1Element = { id: "element:child", kind: "element" as const, isHub: false };
    const tierKinds = new Map([["element:child", "domain" as const]]);
    const clustered = new Set(["element:child"]);
    expect(isNodeHittable(depth1Element, ENTRY, null, undefined, DEFAULT_TIER_REVEAL, clustered, tierKinds)).toBe(false);
  });

  it("falls back to the node's own kind when the override map has no entry for it", () => {
    const capability = { id: "capability:x", kind: "capability" as const, isHub: false };
    const tierKinds = new Map([["element:other", "domain" as const]]);
    expect(isNodeHittable(capability, ENTRY, null, undefined, DEFAULT_TIER_REVEAL, undefined, tierKinds)).toBe(false);
  });

  it("agrees with nodeTierAlpha at the HITTABLE_MIN_TIER_ALPHA boundary", () => {
    expect(nodeTierAlpha("capability", false, DEFAULT_TIER_REVEAL.capability.fullRatio, DEFAULT_TIER_REVEAL)).toBeGreaterThanOrEqual(
      HITTABLE_MIN_TIER_ALPHA,
    );
    expect(isNodeHittable({ id: "capability:full", kind: "capability", isHub: false }, DEFAULT_TIER_REVEAL.capability.fullRatio, null, undefined)).toBe(
      true,
    );
  });
});

describe("classifyZoomTier (M-5 — corner readout orientation)", () => {
  const C = DEFAULT_TIER_REVEAL;

  it("is 'spine' at the overview entry (nothing below the spine revealed yet)", () => {
    expect(classifyZoomTier(ENTRY, C)).toBe("spine");
  });

  it("is 'spine' while capabilities are still less than half-revealed", () => {
    expect(classifyZoomTier(C.capability.enterRatio, C)).toBe("spine");
  });

  it("is 'circuit' once capabilities are fully revealed but elements are not", () => {
    expect(classifyZoomTier(C.capability.fullRatio, C)).toBe("circuit");
  });

  it("is 'element' once elements are fully revealed — the point the 'zoom in to see elements' hint becomes false", () => {
    expect(classifyZoomTier(C.element.fullRatio, C)).toBe("element");
    expect(classifyZoomTier(ZOOMED_IN, C)).toBe("element");
  });

  it("never reports 'element' while still at the spine (the exact orientation lie the UX round caught)", () => {
    expect(classifyZoomTier(ENTRY, C)).not.toBe("element");
    expect(classifyZoomTier(ZOOMED_OUT, C)).not.toBe("element");
  });
});
