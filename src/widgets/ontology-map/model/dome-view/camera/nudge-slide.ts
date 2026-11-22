/**
 * The sideways slide (screen px) that moves a selected node and its lit neighbourhood `[litMinPx, litMaxPx]`
 * into the free band `[freeLeftPx, freeRightPx]`: the smallest slide that fits it, centred when it cannot
 * fit, and never so far that the node itself (`nodeXPx`) leaves the band. Zero when the band has no width.
 */
export function domeNudgeSlidePx(
  nodeXPx: number,
  litMinPx: number,
  litMaxPx: number,
  freeLeftPx: number,
  freeRightPx: number,
): number {
  if (freeRightPx <= freeLeftPx) return 0;
  const needAtLeast = litMaxPx - freeRightPx;
  const allowAtMost = litMinPx - freeLeftPx;
  const shift =
    needAtLeast <= allowAtMost
      ? Math.min(allowAtMost, Math.max(needAtLeast, 0))
      : (litMinPx + litMaxPx) / 2 - (freeLeftPx + freeRightPx) / 2;
  return Math.min(nodeXPx - freeLeftPx, Math.max(nodeXPx - freeRightPx, shift));
}
