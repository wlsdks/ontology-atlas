/**
 * Node pin-drag world-coordinate math: grabbing pins the node 1:1 to the cursor in world space,
 * keeping the grab offset (no centre snap, `docs/design/interaction.md` section 1); the force sim
 * reflows its neighbours.
 */

export interface WorldOffset {
  x: number;
  y: number;
}

export function computeGrabOffsetWorld(
  nodeWorldX: number,
  nodeWorldY: number,
  pointerWorldX: number,
  pointerWorldY: number,
): WorldOffset {
  return { x: nodeWorldX - pointerWorldX, y: nodeWorldY - pointerWorldY };
}

export function computePinWorld(
  pointerWorldX: number,
  pointerWorldY: number,
  grabOffset: WorldOffset,
): WorldOffset {
  return { x: pointerWorldX + grabOffset.x, y: pointerWorldY + grabOffset.y };
}
