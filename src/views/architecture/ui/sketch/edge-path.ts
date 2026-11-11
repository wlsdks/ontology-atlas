import type { FlowAxis, Placed } from './types';

export const OPPOSED_PAIR_OFFSET = 6;
/** The narrow ladder already parts rule from traffic by 12, so an opposed pair there takes half. */
export const opposedPairOffset = (rulesShareTrafficLine: boolean) =>
  rulesShareTrafficLine ? OPPOSED_PAIR_OFFSET / 2 : OPPOSED_PAIR_OFFSET;

/**
 * One stroke's path. A stroke leaves the face edge that looks at its target and lands on the edge that
 * looks back; a skip arcs beside a ladder or runs under an across chain, so none passes through a face. O(1).
 */
export function edgePath({
  axis,
  skipSide,
  portShift,
  from,
  to,
  boxW,
  boxH,
  columnSpan,
  climbs,
  trackOffset,
  swing,
  colGap,
  rowGap,
}: {
  axis: FlowAxis;
  /** The side of the face a ladder's skip leaves and arrives at. */
  skipSide: 'left' | 'right';
  /** How far a side arc's ends move toward each other off mid-height; negative moves them apart. */
  portShift: number;
  from: Placed;
  to: Placed;
  boxW: number;
  boxH: number;
  columnSpan: number;
  climbs: boolean;
  /** Sideways shift off the centre line, across the flow. */
  trackOffset: number;
  /** From the centre line to a skip's apex. */
  swing: number;
  colGap: number;
  rowGap: number;
}): string {
  const toward = climbs ? -1 : 1;
  if (axis === 'across') {
    const sx = climbs ? from.x : from.x + boxW;
    const tx = climbs ? to.x + boxW : to.x;
    const sy = from.y + boxH / 2 + trackOffset;
    const ty = to.y + boxH / 2 + trackOffset;
    if (columnSpan <= 1) {
      const reach = toward * colGap * 0.6;
      return `M ${sx} ${sy} C ${sx + reach} ${sy}, ${tx - reach} ${ty}, ${tx} ${ty}`;
    }
    const midY = Math.max(sy, ty) + swing;
    const turn = (toward * colGap) / 2;
    return `M ${sx} ${sy} C ${sx + turn} ${sy}, ${sx + turn} ${midY}, ${sx + 2 * turn} ${midY} L ${tx - 2 * turn} ${midY} C ${tx - turn} ${midY}, ${tx - turn} ${ty}, ${tx} ${ty}`;
  }
  if (columnSpan > 1) {
    const edgeX = (face: Placed) => (skipSide === 'left' ? face.x : face.x + boxW);
    const inward = Math.sign(to.y - from.y) * portShift;
    const sy = from.y + boxH / 2 + inward;
    const ty = to.y + boxH / 2 - inward;
    const apex =
      skipSide === 'left'
        ? Math.min(from.x, to.x) - (swing - boxW / 2)
        : Math.max(from.x, to.x) + boxW + (swing - boxW / 2);
    return `M ${edgeX(from)} ${sy} C ${apex} ${sy}, ${apex} ${ty}, ${edgeX(to)} ${ty}`;
  }
  const sx = from.x + boxW / 2 + trackOffset;
  const tx = to.x + boxW / 2 + trackOffset;
  const sy = climbs ? from.y : from.y + boxH;
  const ty = climbs ? to.y + boxH : to.y;
  const reach = toward * rowGap * 0.6;
  return `M ${sx} ${sy} C ${sx} ${sy + reach}, ${tx} ${ty - reach}, ${tx} ${ty}`;
}
