import { describe, expect, it } from "vitest";

import { centerForInsets, readSafeInsets } from "./safe-insets";

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
