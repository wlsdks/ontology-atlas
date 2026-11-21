import { describe, expect, it } from "vitest";

import { computeUnfocusedPanBounds, focusLeashPx, focusLeashWorld, focusPanBounds, focusTargetLeashPx, FOCUS_LEASH_EDGE_PAD_PX } from "./pan-leash";

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

describe("computeUnfocusedPanBounds: pan leash", () => {
  const bounds = { minX: -400, minY: -300, maxX: 400, maxY: 300 };

  it("with the leash off the old envelope stays (world bbox +/- 320)", () => {
    // The workbench default is 0 — this pins the claim that this change does not
    // touch `/topology` by a single pixel.
    const off = computeUnfocusedPanBounds(bounds, 1, { cameraPanLeash: 0, safeInsetLeft: 350 });
    expect(off).toEqual({ minX: -720, minY: -620, maxX: 720, maxY: 620 });
    // Passing no tokens at all gives the same (the pure camera-math test contract).
    expect(computeUnfocusedPanBounds(bounds, 1, {})).toEqual(off);
  });

  it("with the leash on the envelope narrows to the **fit anchor** +/- the leash", () => {
    // The reference point uses the same formula as the overview fit:
    // centre − (left − right) / (2 · scale). Anchoring on the fit rather than the
    // bbox is what makes the envelope's size independent of vault size.
    const leashed = computeUnfocusedPanBounds(bounds, 2, {
      cameraPanLeash: 220,
      safeInsetLeft: 544,
      safeInsetRight: 0,
    });
    const anchorX = 0 - (544 - 0) / (2 * 2); // = -136
    expect(leashed).toEqual({
      minX: anchorX - 220,
      maxX: anchorX + 220,
      minY: -220,
      maxY: 220,
    });
  });

  it("the envelope stays put when the vault triples in size, whereas the old envelope grew with it", () => {
    const tokens = { cameraPanLeash: 220, safeInsetLeft: 544 };
    const small = computeUnfocusedPanBounds(bounds, 1, tokens);
    const huge = computeUnfocusedPanBounds(
      { minX: -1200, minY: -900, maxX: 1200, maxY: 900 },
      1,
      tokens);
    expect(huge).toEqual(small);
    // Without a leash these two differ — which is why the old envelope could not
    // guarantee "outside the reserved column" at any value.
    expect(computeUnfocusedPanBounds({ minX: -1200, minY: -900, maxX: 1200, maxY: 900 }, 1, {})).not.toEqual(
      computeUnfocusedPanBounds(bounds, 1, {}));
  });
});

describe("focusLeashPx and focusLeashWorld", () => {
  it("focusLeashPx: half the free width less the pad, never negative", () => {
    const leash = focusLeashPx(1448, 806, { left: 0, right: 384, top: 148, bottom: 96 });
    expect(leash.x).toBe((1448 - 384) / 2 - FOCUS_LEASH_EDGE_PAD_PX);
    expect(leash.y).toBe((806 - 148 - 96) / 2 - FOCUS_LEASH_EDGE_PAD_PX);
    expect(focusLeashPx(200, 200, { left: 0, right: 100, top: 0, bottom: 0 }).x).toBe(0);
    expect(focusLeashWorld(412, 0.872, 180)).toBeCloseTo(412 / 0.872, 6);
    expect(focusLeashWorld(100, 1, 180)).toBe(180);
    expect(focusLeashWorld(412, 0, 180)).toBe(180);
  });
});
