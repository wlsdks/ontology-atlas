/**
 * Node pin-drag world-coordinate math — the headline fix for the owner's
 * "노드를 클릭 드래그하면 그 노드가 force graph처럼 움직여야 하는데 통으로
 * 화면만 이동된다" report. Grabbing a node pins it 1:1 to the cursor in *world*
 * space (respecting where inside the node you grabbed), and the force sim
 * (`model/force-layout.ts`) reflows its neighbors around the pinned position.
 *
 * These two pure functions isolate the coordinate algebra so it can be tested
 * without a camera/canvas; the caller (`topology-pointer-handlers.ts`)
 * supplies pointer→world conversions via `topology-camera-math.ts#screenToWorld`.
 *
 * The grab offset (node position − pointer world position at grab time) is the
 * "respect the grab point, no center-snap" rule from `docs/INTERACTION-DESIGN.md`
 * §1 ("잡은 지점의 offset을 존중 (중심 스냅 금지)").
 */

export interface WorldOffset {
  x: number;
  y: number;
}

/** Offset from the pointer's world position to the node's world position at grab time. */
export function computeGrabOffsetWorld(
  nodeWorldX: number,
  nodeWorldY: number,
  pointerWorldX: number,
  pointerWorldY: number,
): WorldOffset {
  return { x: nodeWorldX - pointerWorldX, y: nodeWorldY - pointerWorldY };
}

/** World position the node should be pinned to for the current pointer world position, preserving the grab offset. */
export function computePinWorld(
  pointerWorldX: number,
  pointerWorldY: number,
  grabOffset: WorldOffset,
): WorldOffset {
  return { x: pointerWorldX + grabOffset.x, y: pointerWorldY + grabOffset.y };
}
