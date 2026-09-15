import type { CameraTarget } from "../engine/camera";
import type { Rect } from "../interaction/free-area";

export interface GalaxyInspectionTargetInput {
  camera: CameraTarget;
  node: { x: number; y: number };
  viewport: { width: number; height: number };
  canvasRect: Rect;
  freeArea: Rect;
  targetScale: number;
}

/**
 * Place an inspected star at the centre of the unobscured canvas while applying
 * the caller's bounded focus scale. The graph itself remains mounted; this is a
 * camera approach to one real star, not a layout or visibility change.
 */
export function galaxyInspectionTarget(input: GalaxyInspectionTargetInput): CameraTarget {
  const { camera, node, viewport, canvasRect, freeArea } = input;
  const targetScale = Math.max(camera.tscale, input.targetScale);
  const desiredX = freeArea.x + freeArea.width / 2;
  const desiredY = freeArea.y + freeArea.height / 2;

  return {
    tx: node.x - (desiredX - canvasRect.x - viewport.width / 2) / targetScale,
    ty: node.y - (desiredY - canvasRect.y - viewport.height / 2) / targetScale,
    tscale: targetScale,
  };
}
