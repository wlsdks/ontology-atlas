import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/focus-map-canvas";
import { lastDrawnLabelBoxes } from "./topology-frame-draw";

/** A drawn name on the map, with the disc above it, in client (viewport) px. */
export interface DrawnMapMark {
  nodeId: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The room a node's disc takes above its name. A name hangs under its disc, so a card that
 * covers the space just above a name covers the node the name belongs to.
 */
const DISC_ABOVE_NAME_PX = 36;

/**
 * **Where the last frame drew each node's name and disc**, in client px — for chrome outside
 * the map (the guided tour's card) that must leave what it explains in view. Read from the
 * frame the person is looking at, not from a model of it; a name the frame culled is not here.
 * `include` narrows to the nodes that matter to the caller.
 */
export function readDrawnMapMarks(include?: (nodeId: string) => boolean, doc: Document = document): DrawnMapMark[] {
  const canvas = doc.querySelector(`[data-surface-role="${MAP_CANVAS_SURFACE_ROLE}"]`);
  if (!canvas) return [];
  const origin = canvas.getBoundingClientRect();
  const out: DrawnMapMark[] = [];
  for (const box of lastDrawnLabelBoxes()) {
    if (include && !include(box.nodeId)) continue;
    const top = origin.y + box.minY - DISC_ABOVE_NAME_PX;
    out.push({
      nodeId: box.nodeId,
      top,
      left: origin.x + box.minX,
      width: box.maxX - box.minX,
      height: origin.y + box.maxY - top,
    });
  }
  return out;
}
