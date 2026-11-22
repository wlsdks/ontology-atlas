/** Camera-space conversions and picking (`worldToScreen`, `screenToWorld`, `hitTestWorld`). `camera.x`/`camera.y` are the WORLD point the camera is centered on, `camera.scale` the world-to-screen zoom factor. The camera targets (fits, leashes, zoom range, focus framing) live in `target/`. */

import type { CameraAxes } from "../../engine/camera";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { radiusForKind } from "../world/geometry/node-radius";
import { type TopologyWorld } from "../world/topology-world";
import type { WorldNode } from "../world/topology-world";

interface Point {
  x: number;
  y: number;
}

/**
 * Optional depth argument to `worldToScreen`: `z` is recession behind the layout plane, `focal` the
 * weak-perspective focal length (`s = focal / (focal + z)`), `lift` a constant plane spacing.
 * Omitted, the output is the original formula (`topology-camera-math.test.ts`, `dome-view.test.ts`).
 */
export interface DepthTerm {
  z: number;
  lift: number;
  focal: number;
}

export function worldToScreen(camera: CameraAxes, viewportWidth: number, viewportHeight: number, wx: number, wy: number, depth?: DepthTerm): Point {
  if (depth !== undefined) {
    const s = depth.focal / (depth.focal + depth.z);
    return {
      x: (wx - camera.x.value) * s * camera.scale.value + viewportWidth / 2,
      y: ((wy - camera.y.value) * s + depth.lift * s) * camera.scale.value + viewportHeight / 2,
    };
  }
  return {
    x: (wx - camera.x.value) * camera.scale.value + viewportWidth / 2,
    y: (wy - camera.y.value) * camera.scale.value + viewportHeight / 2,
  };
}

export function screenToWorld(camera: CameraAxes, viewportWidth: number, viewportHeight: number, sx: number, sy: number): Point {
  return {
    x: (sx - viewportWidth / 2) / camera.scale.value + camera.x.value,
    y: (sy - viewportHeight / 2) / camera.scale.value + camera.y.value,
  };
}

/** The courtesy ring outside a node's painted disc (screen px): an element draws at 7 px world radius and can be under 4 px in 3D, not pressable alone. A slack ring, not a second disc: `hitTestWorld` ranks painted ink above it. */
export const HIT_TOUCH_SLACK_PX = 5;

/** The node under `(screenX, screenY)`, `null` if none is within its padded radius. */
export function hitTestWorld(
  world: TopologyWorld,
  camera: CameraAxes,
  viewportWidth: number,
  viewportHeight: number,
  tokens: OntologyMapTokens,
  screenX: number,
  screenY: number,
  /** Optional filter — skips nodes that aren't currently hittable (e.g. semantic-zoom-hidden tiers). Defaults to "all hittable". */
  isHittable?: (node: WorldNode) => boolean,
  /** Optional per-node render offset (world units): the draw shifts deep realm nodes by the depth-parallax offset, so the clickable disc must follow. Defaults to none. */
  renderOffsetForNode?: (node: WorldNode) => Point,
  /** 3D: multiplies the hit disc by the perspective factor (`DomeNodeFrame.s`) the draw applied to the node radius. Omitted means 1. */
  radiusScaleForNode?: (node: WorldNode) => number,
  /**
   * 3D view: the node's normalised depth (0 near, 1 far, `DomeNodeFrame.u`). When given, the
   * nearer node wins overlapping discs and distance breaks ties among equal depths. Omitted,
   * distance alone decides.
   */
  depthForNode?: (node: WorldNode) => number,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;
  let bestDepth = Infinity;
  let bestOnInk = false;
  for (const node of world.nodes) {
    if (isHittable && !isHittable(node)) continue;
    const off = renderOffsetForNode ? renderOffsetForNode(node) : null;
    const screen = worldToScreen(
      camera,
      viewportWidth,
      viewportHeight,
      node.x + (off?.x ?? 0),
      node.y + (off?.y ?? 0),
    );
    // The disc the draw actually paints (`frame-draw/nodes/paint-nodes.ts`'s `screenRadius`)
    // and, around it, the courtesy ring that makes a 7 px element pressable.
    const drawnRadius =
      radiusForKind(node.kind, tokens) * node.magnitudeScale * (radiusScaleForNode ? radiusScaleForNode(node) : 1) * camera.scale.value;
    const effRadius = drawnRadius + HIT_TOUCH_SLACK_PX;
    const distance = Math.hypot(screenX - screen.x, screenY - screen.y);
    // Compare positively — a NaN coordinate (mocked or unprojected) cannot pass `<=`.
    if (!(distance <= effRadius)) continue;
    // Is the cursor on this node's **painted** disc, or only inside its slack ring?
    const onInk = distance <= drawnRadius;
    const depth = depthForNode ? depthForNode(node) : 0;
    /*
     * Rank: ink first, then depth, then distance. The slack ring is a courtesy for small targets,
     * not an occluder, so it decides only among points on no painted disc; depth orders real
     * overlaps.
     */
    const better = onInk === bestOnInk
      ? depth < bestDepth - 1e-6 || (Math.abs(depth - bestDepth) <= 1e-6 && distance < bestDistance)
      : onInk;
    if (better) {
      bestId = node.id;
      bestDistance = distance;
      bestDepth = depth;
      bestOnInk = onInk;
    }
  }
  return bestId;
}

/**
 * Whether any node is on screen. Moving the window to another monitor or resizing it changes viewport
 * and DPR while the camera stays put, possibly leaving an empty map. It corrects only when no node is
 * visible, so a user-set zoom survives. `marginPx` counts a barely clipped node as visible.
 */
export function hasAnyNodeOnScreen(
  camera: CameraAxes,
  viewportWidth: number,
  viewportHeight: number,
  nodes: ReadonlyArray<{ x: number; y: number }>,
  marginPx = 24,
): boolean {
  if (nodes.length === 0) return true; // With no nodes, nothing has 'disappeared' either.
  if (viewportWidth <= 0 || viewportHeight <= 0) return true; // Before layout.
  for (const node of nodes) {
    const p = worldToScreen(camera, viewportWidth, viewportHeight, node.x, node.y);
    if (
      p.x >= -marginPx &&
      p.x <= viewportWidth + marginPx &&
      p.y >= -marginPx &&
      p.y <= viewportHeight + marginPx
    ) {
      return true;
    }
  }
  return false;
}
