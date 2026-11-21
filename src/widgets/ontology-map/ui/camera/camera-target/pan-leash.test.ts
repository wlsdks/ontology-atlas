import { describe, expect, it } from "vitest";

import { focusPanBounds, focusTargetLeashPx } from "./pan-leash";

describe("focusPanBounds", () => {
  it("is the screen leash in world units around the anchor on each axis", () => {
    expect(focusPanBounds({ x: 10, y: 20 }, { x: 200, y: 100 }, 2, 0)).toEqual({ minX: -90, maxX: 110, minY: -30, maxY: 70 });
  });

  it("never tightens below the token margin, and falls back to it with no leash", () => {
    expect(focusPanBounds({ x: 0, y: 0 }, { x: 20, y: 20 }, 4, 50)).toEqual({ minX: -50, maxX: 50, minY: -50, maxY: 50 });
    expect(focusPanBounds({ x: 0, y: 0 }, null, 1, 30)).toEqual({ minX: -30, maxX: 30, minY: -30, maxY: 30 });
  });
});

describe("focusTargetLeashPx", () => {
  it("is half the free extent beside the panels, less the edge pad", () => {
    expect(focusTargetLeashPx({ safeInsetLeft: 200 }, 1000, 800)).toEqual({ x: 280, y: 280 });
  });

  it("is zero on an axis the chrome leaves no room on", () => {
    expect(focusTargetLeashPx({}, 200, 200)).toEqual({ x: 0, y: 0 });
  });
});
