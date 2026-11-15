import type { TreeDrawList } from "./types";

/**
 * The node of the nearest mark whose own circle holds the point; failing that, the nearest whose
 * circle grown by `slopPx` does; -1 when none. Same-depth marks go to the closer centre.
 * O(m) for m marks, no allocation.
 */
export function pickTreeMark(list: TreeDrawList, x: number, y: number, slopPx: number): number {
  let hit = -1;
  let hitDepth = 0;
  let hitDistSq = 0;
  let near = -1;
  let nearDepth = 0;
  let nearDistSq = 0;
  for (let i = list.count - 1; i >= 0; i -= 1) {
    const mark = list.marks[i]!;
    if (hit >= 0 && mark.depth !== hitDepth) break;
    const dx = x - mark.x;
    const dy = y - mark.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= mark.radius * mark.radius) {
      if (hit < 0 || distSq < hitDistSq) {
        hit = mark.node;
        hitDepth = mark.depth;
        hitDistSq = distSq;
      }
      continue;
    }
    const reach = mark.radius + slopPx;
    if (!(distSq <= reach * reach)) continue;
    if (near < 0 || (mark.depth === nearDepth && distSq < nearDistSq)) {
      near = mark.node;
      nearDepth = mark.depth;
      nearDistSq = distSq;
    }
  }
  return hit >= 0 ? hit : near;
}
