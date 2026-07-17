import { describe, expect, it } from "vitest";

import { computeVignetteAlpha, lerpColorHex } from "./grid";

/**
 * `render/grid.ts`'s `draw()`/`buildGridPattern()` bodies are Canvas 2D
 * painting with no extractable pure-geometry invariant beyond the two
 * formulas below (the pattern tile itself needs a real `HTMLCanvasElement`
 * 2D context to build, which jsdom does not implement meaningfully). Those
 * two `test.todo`s are left as-is — P5's production-build screenshot gate
 * (`docs/TOPOLOGY-V2-DESIGN.md` §4 P5) is the actual verification for visual
 * correctness there.
 */
describe("render/grid", () => {
  it.todo(
    "buildGridPattern produces a 120px tile (24px minor x5) matching the prototype's buildGrid() — needs a real canvas 2D context, not jsdom",
  );
  it.todo(
    "vignette stays a transparent-center gradient (regression guard for the prototype's own noted opaque-vignette bug) — needs pixel-level readback, deferred to P5",
  );
});

describe("lerpColorHex", () => {
  it("is hexA at t=0", () => {
    expect(lerpColorHex("#0a0a0d", "#050507", 0)).toBe("rgb(10, 10, 13)");
  });

  it("is hexB at t=1", () => {
    expect(lerpColorHex("#0a0a0d", "#050507", 1)).toBe("rgb(5, 5, 7)");
  });

  it("is the rounded midpoint at t=0.5", () => {
    // 0x0a=10 -> 0x05=5: mid 7.5 rounds to 8; 0x0d=13 -> 0x07=7: mid 10 exactly
    expect(lerpColorHex("#0a0a0d", "#050507", 0.5)).toBe("rgb(8, 8, 10)");
  });
});

describe("computeVignetteAlpha", () => {
  it("is baseAlpha at farT=0 (circuit — least vignette)", () => {
    expect(computeVignetteAlpha(0.32, 0.18, 0)).toBeCloseTo(0.32, 6);
  });

  it("is baseAlpha+farAlpha at farT=1 (constellation — most vignette)", () => {
    expect(computeVignetteAlpha(0.32, 0.18, 1)).toBeCloseTo(0.5, 6);
  });
});
