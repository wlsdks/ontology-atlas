import type { TreeDrawList } from "./types";

/**
 * The node of the nearest mark whose circle, grown by `slopPx`, holds the point, or -1.
 * Marks at the same depth go to the closer centre. O(m) for m marks, no allocation.
 */
export function pickTreeMark(list: TreeDrawList, x: number, y: number, slopPx: number): number {
  let best = -1;
  let bestDepth = 0;
  let bestDistSq = 0;
  for (let i = list.count - 1; i >= 0; i -= 1) {
    const mark = list.marks[i]!;
    if (best >= 0 && mark.depth !== bestDepth) break;
    const dx = x - mark.x;
    const dy = y - mark.y;
    const distSq = dx * dx + dy * dy;
    const reach = mark.radius + slopPx;
    if (distSq > reach * reach) continue;
    if (best < 0 || distSq < bestDistSq) {
      best = mark.node;
      bestDepth = mark.depth;
      bestDistSq = distSq;
    }
  }
  return best;
}
