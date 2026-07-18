import { describe, expect, it } from "vitest";

import { computeDomainWatermarkAlpha, computeLabelAlpha } from "./labels";

/**
 * `render/labels.ts#draw`'s canvas text painting has no extractable
 * geometric invariant beyond the alpha formula below — its visual contrast/
 * legibility (light mode in particular) is a Design Guardian screenshot-review
 * question the design doc explicitly defers (§2.2: "라이트 대비는 P3 게이트에서
 * 스크린샷 필수"), left as `test.todo`.
 *
 * (label-clarity, 2026-07) — REDESIGN. Persona eval: domain names only
 * existed as an ultra-low-contrast far-field watermark; ego-revealed
 * children (capability/element) drew as unlabeled dark circles; the
 * selected/hovered node's own name never got a contrast floor. New contract:
 * - `project`/`domain`: readable at EVERY zoom band (not gated by farT at
 *   all here — the domain far-field spaced-caps watermark is a SEPARATE
 *   decorative effect drawn in `draw()`, not part of this alpha function).
 * - `capability`/`element`: eligibility ramps with the node's own
 *   `revealAlpha` (tier alpha, or the ego-reveal ramp when exempted) — "잡을
 *   수 있으면 읽을 수 있다" (if you can click it, you can read it).
 * - `egoState === "center"` (selected) or `isHovered`: ALWAYS 1, any kind,
 *   any zoom band — overrides everything except `dim`.
 * - `egoState === "dim"`: always 0, regardless of anything else.
 */
describe("computeLabelAlpha", () => {
  const base = { farT: 0, egoState: "normal" as const, isHovered: false, revealAlpha: 1 };

  it("project is always fully visible, at any farT/revealAlpha", () => {
    expect(computeLabelAlpha({ ...base, kind: "project", farT: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "project", farT: 1 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "project", revealAlpha: 0 })).toBe(1);
  });

  it("domain reads at EVERY zoom band — full at circuit (farT=0), fading only toward the far-field handoff", () => {
    expect(computeLabelAlpha({ ...base, kind: "domain", farT: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "domain", farT: 0.5 })).toBeCloseTo(0.5, 6);
    expect(computeLabelAlpha({ ...base, kind: "domain", farT: 1 })).toBe(0);
  });

  it("capability/element are ineligible below the hittable reveal threshold (0.5) — matches HITTABLE_MIN_TIER_ALPHA", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0.3 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "element", revealAlpha: 0.4 })).toBe(0);
  });

  it("capability/element ramp in once revealAlpha crosses 0.5, reaching full by ~0.85 — the 'ego-revealed child gets a label' fix", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0.5 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0.7 })).toBeGreaterThan(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0.7 })).toBeLessThan(1);
    expect(computeLabelAlpha({ ...base, kind: "element", revealAlpha: 0.85 })).toBeCloseTo(1, 6);
    expect(computeLabelAlpha({ ...base, kind: "element", revealAlpha: 1 })).toBe(1);
  });

  it("is 0 whenever the node is dim, regardless of kind/farT/revealAlpha/hover", () => {
    expect(computeLabelAlpha({ ...base, kind: "project", egoState: "dim" })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "domain", egoState: "dim", farT: 0 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "dim", revealAlpha: 1 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "dim", isHovered: true })).toBe(0);
  });

  it("the SELECTED (center) node is always fully readable, any kind/farT/revealAlpha (never just an unlabeled circle)", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "center", revealAlpha: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "element", egoState: "center", revealAlpha: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "domain", egoState: "center", farT: 1 })).toBe(1);
  });

  it("the HOVERED node is always fully readable while hovered, same as selected", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", isHovered: true, revealAlpha: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "element", isHovered: true, revealAlpha: 0 })).toBe(1);
  });

  it("neighbor (ego-revealed, non-hovered, non-center) capability/element still follows the ramp — only its OWN revealAlpha decides eligibility", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "neighbor", revealAlpha: 0 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "neighbor", revealAlpha: 1 })).toBe(1);
  });

  it.todo(
    "light-mode label color contrast (labelDomain/labelCapability/labelElement tokens) — design doc §2.2 explicitly defers exact light values to a P3 Design Guardian pass",
  );
});

/**
 * Live regression caught during label-clarity verification: at farT=1 (pure
 * constellation), `computeLabelAlpha`'s compact-domain-label formula is 0 —
 * correct on its own, but `ui/topology-frame-draw.ts`'s label-candidate
 * ELIGIBILITY gate used to check ONLY that value, so it skipped building a
 * candidate at all once it hit 0 — silently deleting the watermark
 * (`computeDomainWatermarkAlpha`) along with it. The far-field constellation
 * went completely nameless instead of keeping its atmosphere layer. The gate
 * now takes `Math.max(compactAlpha, watermarkAlpha)`; this locks down that
 * `computeDomainWatermarkAlpha` stays independently meaningful right where
 * the compact label goes to 0.
 */
describe("computeDomainWatermarkAlpha", () => {
  it("ramps 1:1 with farT, reaching full at the far-field constellation (where the compact label has faded to 0)", () => {
    expect(computeDomainWatermarkAlpha(0, "normal")).toBe(0);
    expect(computeDomainWatermarkAlpha(0.5, "normal")).toBe(0.5);
    expect(computeDomainWatermarkAlpha(1, "normal")).toBe(1);
  });

  it("is 0 while dim, regardless of farT", () => {
    expect(computeDomainWatermarkAlpha(1, "dim")).toBe(0);
  });

  it("stays meaningful at farT=1 even though computeLabelAlpha's compact-label alpha is 0 there (the eligibility-gate regression)", () => {
    const compactAlpha = computeLabelAlpha({ kind: "domain", farT: 1, egoState: "normal", isHovered: false, revealAlpha: 1 });
    const watermarkAlpha = computeDomainWatermarkAlpha(1, "normal");
    expect(compactAlpha).toBe(0);
    expect(watermarkAlpha).toBe(1);
    expect(Math.max(compactAlpha, watermarkAlpha)).toBeGreaterThan(0.02);
  });
});
