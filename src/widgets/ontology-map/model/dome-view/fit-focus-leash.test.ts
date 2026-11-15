import { describe, expect, it } from 'vitest';

import { domeFitFocusLeash } from './runtime';

const SCALE = 0.56;
const TOKEN_MARGIN_WORLD = 180;

/** The box `focusPanBounds` holds the camera centre in: the leash on each axis round the anchor. */
function holds(anchor: { x: number; y: number }, leashPx: { x: number; y: number } | null, camera: { tx: number; ty: number }) {
  const mx = Math.max(TOKEN_MARGIN_WORLD, (leashPx?.x ?? 0) / SCALE);
  const my = Math.max(TOKEN_MARGIN_WORLD, (leashPx?.y ?? 0) / SCALE);
  return Math.abs(camera.tx - anchor.x) <= mx && Math.abs(camera.ty - anchor.y) <= my;
}

describe("a focused camera aimed at Neural's fit", () => {
  it('can reach a fit that puts the node inside the free area but far from the viewport centre', () => {
    const node = { x: -150, y: 260 };
    const cloudCentre = { x: 0, y: 0 };
    // A 480 px detail panel on the right and a taller bottom band move the free area's centre left and up.
    const freeArea = { centreX: -240, centreY: -30, halfW: 400, halfH: 330 };
    const fit = { tx: cloudCentre.x - freeArea.centreX / SCALE, ty: cloudCentre.y - freeArea.centreY / SCALE, tscale: SCALE, freeArea };
    expect(Math.abs(node.x - cloudCentre.x) * SCALE).toBeLessThan(freeArea.halfW);
    expect(Math.abs(node.y - cloudCentre.y) * SCALE).toBeLessThan(freeArea.halfH);

    expect(holds(node, null, fit)).toBe(false);
    const leash = domeFitFocusLeash(node, fit, SCALE)!;
    expect(holds(leash.anchor, leash.leashPx, fit)).toBe(true);
  });
});
