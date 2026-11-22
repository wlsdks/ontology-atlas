import { describe, expect, it } from "vitest";

import { computeOverviewCameraTarget } from "./fit-targets";
import { centerForInsets, clampFitInsets, MAX_FIT_CHROME_SHARE, readSafeInsets } from "./safe-insets";

describe("centerForInsets", () => {
  it("moves the camera back by half the difference of the side insets, as a shorter world distance the further in", () => {
    expect(centerForInsets(100, 50, { left: 300, right: 100, top: 0, bottom: 40 }, 2)).toEqual({ tx: 50, ty: 60 });
  });

  it("treats a zero scale as 1 instead of dividing by it", () => {
    expect(centerForInsets(100, 50, { left: 300, right: 100, top: 0, bottom: 0 }, 0)).toEqual({ tx: 0, ty: 50 });
  });

  it("leaves the centre alone when the panels balance", () => {
    expect(centerForInsets(7, 9, { left: 120, right: 120, top: 30, bottom: 30 }, 3)).toEqual({ tx: 7, ty: 9 });
  });
});

describe("readSafeInsets", () => {
  it("is all zero for a fit with no chrome, so a pure camera test sees a plain fit", () => {
    expect(readSafeInsets({})).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it("adds the fit's own pad to each token inset", () => {
    expect(readSafeInsets({ safeInsetLeft: 100, safeInsetTop: 10 }, undefined, undefined, { left: 20, right: 5, top: 0, bottom: 0 })).toEqual({
      left: 120, right: 5, top: 10, bottom: 0,
    });
  });

  it("adds the label allowance only under a real bottom inset", () => {
    expect(readSafeInsets({ safeInsetBottom: 10 }, undefined, undefined, undefined, 6).bottom).toBe(16);
    expect(readSafeInsets({}, undefined, undefined, { left: 0, right: 0, top: 0, bottom: 4 }, 6).bottom).toBe(4);
  });

  it("keeps the chrome from taking more than half an axis once a viewport is known", () => {
    const insets = readSafeInsets({ safeInsetLeft: 600, safeInsetRight: 600 }, 1000, 800);
    expect(insets.left + insets.right).toBeLessThanOrEqual(500);
    expect(insets.left).toBe(insets.right);
  });
});

describe("clampFitInsets — the chrome may not eat the map", () => {
  it("leaves a desktop reservation alone: 470 of 1216 is under the ceiling", () => {
    expect(clampFitInsets(350, 120, 1216)).toEqual({ lo: 350, hi: 120 });
  });

  it("shrinks both sides in proportion when they pass the ceiling", () => {
    // 390-wide canvas: 470 asked, 195 allowed.
    const { lo, hi } = clampFitInsets(350, 120, 390);
    expect(lo + hi).toBeCloseTo(390 * MAX_FIT_CHROME_SHARE, 6);
    expect(lo / hi).toBeCloseTo(350 / 120, 6);
    expect(390 - lo - hi).toBeCloseTo(390 * (1 - MAX_FIT_CHROME_SHARE), 6);
  });

  it("side lanes give way equally, so the drawing stays centred between INDEX and the rail", () => {
    const freeCentre = (width: number) => (324 + (width - 60)) / 2;
    for (const width of [768, 800, 900, 1000]) {
      for (const floors of [[324, 0], [324, 60], [0, 0]] as const) {
        const { lo, hi } = clampFitInsets(376, 112, width, floors[0], floors[1], "equal");
        expect(lo + hi, `${width} ${floors}`).toBeLessThanOrEqual(width * MAX_FIT_CHROME_SHARE + 1e-6);
                expect((lo + (width - hi)) / 2, `${width} ${floors}`).toBeCloseTo(freeCentre(width), 6);
                expect(lo).toBeGreaterThanOrEqual(floors[0]);
                expect(hi).toBeGreaterThanOrEqual(floors[1]);
            }
        }
        // A side at its floor hands the rest of the cut to the other side: 90 px must go,
        // the left has 16 above its panel, so the right gives the other 74.
        expect(clampFitInsets(340, 200, 900, 324, 0, "equal")).toEqual({ lo: 324, hi: 126 });
        // A floor wider than the ceiling still wins, whatever the share.
        expect(clampFitInsets(600, 120, 900, 600, 0, "equal")).toEqual({ lo: 600, hi: 0 });
    });
    it("the overview on a narrow canvas lands centred between INDEX and the rail", () => {
        // The resting lanes and what the map's chrome measurably covers with INDEX open:
        // the panel's right edge at 324, the rail's column 60 from the right edge.
        const tokens = {
            cameraScaleMax: 2.6,
            cameraScaleMin: 0.24,
            cameraSmallGraphScaleMax: 1.3,
            overviewEntryRatio: 0.95,
            safeInsetLeft: 376,
            safeInsetRight: 112,
            safeInsetTop: 148,
            safeInsetBottom: 96,
        };
        const bounds = { minX: -300, minY: -300, maxX: 300, maxY: 300 };
        for (const width of [768, 800, 900, 1000]) {
            for (const obstacles of [{}, { obstacleInsetLeft: 324 }, { obstacleInsetLeft: 324, obstacleInsetRight: 60 }]) {
                const target = computeOverviewCameraTarget(bounds, width, 1000, { ...tokens, ...obstacles });
                // The bounds' centre (world 0) lands on screen at the free map's centre.
                const screenCentre = (0 - target.tx) * target.tscale + width / 2;
                expect(screenCentre, `${width} ${JSON.stringify(obstacles)}`).toBeCloseTo((324 + (width - 60)) / 2, 6);
            }
        }
    });
    it("never shrinks below what a panel measurably covers", () => {
        // An 820-wide canvas with a 324 px panel on the left and nothing on the right.
        const { lo, hi } = clampFitInsets(350, 120, 820, 324, 0);
        expect(lo, "the graph would slide under the open panel").toBeGreaterThanOrEqual(324);
        expect(lo + hi).toBeCloseTo(820 * MAX_FIT_CHROME_SHARE, 6);
    });
    it("a floor wider than the ceiling wins — occlusion is not negotiable", () => {
        const { lo, hi } = clampFitInsets(600, 120, 900, 600, 0);
        expect(lo).toBe(600);
        expect(hi).toBe(0);
    });
    it("a zero or unknown extent changes nothing", () => {
        expect(clampFitInsets(350, 120, 0)).toEqual({ lo: 350, hi: 120 });
    });
});
