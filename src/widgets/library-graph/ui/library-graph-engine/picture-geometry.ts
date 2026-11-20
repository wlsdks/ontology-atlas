import type { FlowWorld } from "../../model/library-flow-layout";
import type { IslandsLayout } from "../../model/library-islands-layout";
import type { IslandField } from "../../model/library-islands-physics";
import { LIBRARY_FIT_PADDING, type LibrarySimulation } from "../../model/library-force-simulation";
import { fitBox } from "../../model/library-graph-view";

/** What the fit reserves on every side, in CSS px; constant, so one folder has one framing. */
export const FIT_PADDING = LIBRARY_FIT_PADDING;
/**
 * What the flow picture's fit keeps clear above and below its laid box, in CSS px. Its sides
 * keep `FIT_PADDING`, where the fit control at the canvas's bottom-right corner and the pane's
 * edges stand; the height is what a folded folder's rows are made of.
 */
export const FLOW_FIT_PADDING_Y = 24;
/** The flow fit's clearance per axis: the camera fits with it (`paint-frame`), and the layout is laid inside it (`flowWorld`). */
export const FLOW_FIT_PADDING = { x: FIT_PADDING, y: FLOW_FIT_PADDING_Y } as const;

/**
 * A flow column with no names at rest (folded, or given no room) names its marks once the view
 * is zoomed this far past the fit, or to the ceiling: the zoom a person reaches for to read.
 */
const FLOW_NAMES_ZOOM_PAST_FIT = 1.5;

/** Whether the view is zoomed in far enough past the fit for every flow column to name its marks. */
export function zoomedToReadFlowNames(viewScale: number, fitScale: number, ceiling: number): boolean {
  return viewScale > fitScale * (1 + 1e-3) && viewScale >= Math.min(ceiling, fitScale * FLOW_NAMES_ZOOM_PAST_FIT) - 1e-6;
}

/** The flow layout's world: the box the camera fits the flow picture into, and the zoom ceiling. */
export function flowWorld(box: { width: number; height: number }, ceiling: number): FlowWorld {
  return { ...fitBox(box, FLOW_FIT_PADDING), ceiling };
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
