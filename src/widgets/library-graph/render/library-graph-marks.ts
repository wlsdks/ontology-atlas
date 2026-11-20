import type { LibraryGraphNode, LibraryGraphNodeKind } from "../model/build-library-graph";
import type { LayoutPoint } from "../model/library-graph-layout";
import type { LibraryGraphFrame } from "./draw-library-graph";

/**
 * Half-extent in world units without graded radii. The source is smaller because a square
 * reads heavier than a circle of the same extent.
 */
export const NODE_RADIUS: Record<LibraryGraphNodeKind, number> = {
  page: 5,
  source: 3.5,
  concept: 5,
};

/** A citation, the heavier relation and the widest line, which the label halo is stated against. */
export const CITES_WIDTH = 1.5;

export function nodeCentre(frame: LibraryGraphFrame, id: string): LayoutPoint | null {
  return frame.positions.get(id) ?? null;
}

export function radiusOf(frame: Pick<LibraryGraphFrame, "radii">, node: LibraryGraphNode): number {
  return frame.radii?.get(node.id) ?? NODE_RADIUS[node.kind];
}
