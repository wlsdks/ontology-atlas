import type { FlowWorld } from "../../model/library-flow-layout";
import type { IslandsLayout } from "../../model/library-islands-layout";
import type { IslandField } from "../../model/library-islands-physics";
import { LIBRARY_FIT_PADDING, type LibrarySimulation } from "../../model/library-force-simulation";
import { fitView, type LibraryGraphView } from "../../model/library-graph-view";

/** What the fit reserves on every side, in CSS px; constant, so one folder has one framing. */
export const FIT_PADDING = LIBRARY_FIT_PADDING;
/**
 * What the flow picture's fit keeps clear above and below its laid box, in CSS px. Its sides
 * keep `FIT_PADDING`, where the fit control at the canvas's bottom-right corner and the pane's
 * edges stand; the height is what a folded folder's rows are made of.
 */
export const FLOW_FIT_PADDING_Y = 24;
/** The flow fit's clearance per axis, read by both the camera (`flowFitView`) and the layout's world (`flowWorld`). */
const FLOW_FIT_PADDING = { x: FIT_PADDING, y: FLOW_FIT_PADDING_Y } as const;

/**
 * The flow layout's world: the pixel box the flow fit leaves, seen through the zoom ceiling,
 * shrunk a little so a small folder's fit lands on the ceiling (`LIBRARY_MAX_MARK_PX`).
 */
export function flowWorld(box: { width: number; height: number }, ceiling: number): FlowWorld {
  const shrink = 0.9;
  return {
    width: Math.max(1, ((box.width - FLOW_FIT_PADDING.x * 2) / ceiling) * shrink),
    height: Math.max(1, ((box.height - FLOW_FIT_PADDING.y * 2) / ceiling) * shrink),
    ceiling,
    cameraGain: 1 / shrink,
  };
}

/** The camera that frames a laid flow box with the flow fit's clearance on each axis. */
export function flowFitView(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  box: { width: number; height: number },
  maxScale: number,
): LibraryGraphView {
  // `fitView` keeps one clearance on every side; narrowing the box by the difference gives the
  // sides theirs. Only the scale reads the box: the camera still centres on the bounds.
  return fitView(bounds, { width: box.width - (FLOW_FIT_PADDING.x - FLOW_FIT_PADDING.y) * 2, height: box.height }, FLOW_FIT_PADDING.y, maxScale);
}
/** The islands overview's world: the padded box shrunk a little, so the fit lands at 1:1. */
export function islandsWorld(box: { width: number; height: number }): { width: number; height: number } {
  const shrink = 0.94;
  return {
    width: Math.max(1, (box.width - FIT_PADDING * 2) * shrink),
    height: Math.max(1, (box.height - FIT_PADDING * 2) * shrink),
  };
}

/**
 * Writes island bodies back onto the picture: each island's centre, and each dot at its
 * offset, since the simulation's nodes are the position store every frame reads.
 */
export function placeIslandBodies(
  sim: LibrarySimulation,
  field: IslandField,
  layout: IslandsLayout | null = null,
  offsets: ReadonlyMap<string, { island: string; dx: number; dy: number }> | null = null,
): void {
  const byId = new Map(field.bodies.map((body) => [body.id, body]));
  if (layout) {
    for (const island of layout.islands) {
      const body = byId.get(island.id);
      if (!body) continue;
      island.x = body.x;
      island.y = body.y;
    }
  }
  if (!offsets) return;
  for (const node of sim.nodes) {
    const offset = offsets.get(node.id);
    if (!offset) continue;
    const body = byId.get(offset.island);
    if (!body) continue;
    node.x = body.x + offset.dx;
    node.y = body.y + offset.dy;
  }
}
