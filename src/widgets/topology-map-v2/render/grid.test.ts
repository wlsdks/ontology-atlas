import { describe, expect, it, vi } from "vitest";

import { computeVignetteAlpha, draw, lerpColorHex, GRID_TILE_PX, wrapToTile } from "./grid";

/**
 * Minimal Canvas2D mock recording every value assigned to `fillStyle` right
 * before a `fillRect` — enough to prove `draw()` routes to the correct
 * background layer per `variant` (#20), without a real canvas context.
 */
function makeRecordingCtx() {
  const fillStyles: unknown[] = [];
  let current: unknown = null;
  const ctx = {
    set fillStyle(v: unknown) {
      current = v;
    },
    get fillStyle() {
      return current;
    },
    globalAlpha: 1,
    fillRect: () => fillStyles.push(current),
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fillStyles };
}

const BG_TOKENS = {
  canvasBgNear: "#0a0a0d",
  canvasBgFar: "#050507",
  vignetteBaseAlpha: 0.32,
  vignetteFarAlpha: 0.18,
};

const GRID_PATTERN = { tag: "grid" } as unknown as CanvasPattern;

describe("render/grid draw() — background variant routing (#20)", () => {
  const base = {
    viewportWidth: 800,
    viewportHeight: 600,
    farT: 0,
    gridPattern: GRID_PATTERN,
    originX: 0,
    originY: 0,
  };

  it("dot (default) paints the blueprint grid pattern and never calls the animated layer", () => {
    const { ctx, fillStyles } = makeRecordingCtx();
    const paintAnimated = vi.fn();
    draw(ctx, { ...base, variant: "dot", paintAnimated }, BG_TOKENS);
    expect(fillStyles).toContain(GRID_PATTERN);
    expect(paintAnimated).not.toHaveBeenCalled();
  });

  /**
   * 움직이는 배경 셋은 **격자를 그리면 안 된다** — 둘이 겹치면 잉크 상한을
   * 합산으로 넘고, 그 초과는 값 하나만 봐서는 어느 룰에도 안 걸린다.
   */
  it.each(["flow", "web", "gravity"] as const)(
    "%s hands the frame to the animated layer and never paints the grid",
    (variant) => {
      const { ctx, fillStyles } = makeRecordingCtx();
      const paintAnimated = vi.fn();
      draw(ctx, { ...base, variant, paintAnimated }, BG_TOKENS);
      expect(paintAnimated).toHaveBeenCalledWith(ctx, 800, 600);
      expect(fillStyles).not.toContain(GRID_PATTERN);
    },
  );

  /**
   * 엔진이 아직 안 만들어진 첫 프레임(설정 변경 직후) — 콜백이 null 이면
   * 격자로 폴백해야 한다. 아무것도 안 그리면 그 프레임이 **검은 화면**이 된다.
   */
  it("falls back to the grid when the animated layer is not ready yet", () => {
    const { ctx, fillStyles } = makeRecordingCtx();
    draw(ctx, { ...base, variant: "flow", paintAnimated: null }, BG_TOKENS);
    expect(fillStyles).toContain(GRID_PATTERN);
  });

  it("omitting variant defaults to the dot/grid layer (regression-free)", () => {
    const { ctx, fillStyles } = makeRecordingCtx();
    draw(ctx, { ...base }, BG_TOKENS);
    expect(fillStyles).toContain(GRID_PATTERN);
  });
});

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

/**
 * B3 — the grid is anchored to the world, so the pattern origin slides with
 * the camera. `%` alone keeps the sign of a negative origin, which would jump
 * the whole grid by a tile the moment the camera crosses world zero.
 */
describe("wrapToTile", () => {
  it("wraps into [0, tile) for positive offsets", () => {
    expect(wrapToTile(0, 120)).toBe(0);
    expect(wrapToTile(30, 120)).toBe(30);
    expect(wrapToTile(120, 120)).toBe(0);
    expect(wrapToTile(150, 120)).toBe(30);
  });

  it("wraps negative offsets forward instead of returning a negative seam", () => {
    expect(wrapToTile(-30, 120)).toBe(90);
    expect(wrapToTile(-120, 120)).toBe(0);
    expect(wrapToTile(-150, 120)).toBe(90);
  });

  it("stays continuous across zero — no full-tile jump as the camera crosses the origin", () => {
    const justBefore = wrapToTile(-0.5, 120);
    const justAfter = wrapToTile(0.5, 120);
    expect(justBefore).toBeCloseTo(119.5, 5);
    expect(justAfter).toBeCloseTo(0.5, 5);
  });

  it("guards a non-positive tile instead of dividing into NaN", () => {
    expect(wrapToTile(37, 0)).toBe(0);
    expect(wrapToTile(37, -120)).toBe(0);
  });

  it("exports the major-line spacing the pattern is actually built with", () => {
    expect(GRID_TILE_PX).toBe(120);
  });
});
