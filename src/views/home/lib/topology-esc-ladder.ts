/**
 * The order one Escape dismisses the canvas selection layer; overlays with their own Escape
 * handler are not here.
 * Pure decision table: `HomePage.tsx`'s `keydown` effect dispatches it, and one rung per keypress
 * keeps
 * the shortcut sheet's "one step at a time" promise.
 */
export interface TopologyEscLadderInput {
  /** Leaving a realm outranks any overlay inside it, since it changes the whole view. */
  realmActive?: boolean;
  /** Lives here, not inline in `HomePage`, so the ladder tests can see this rung. */
  selectedEdgeActive?: boolean;
  /** The newest, most transient overlay closes first, or it reads as stuck chrome. */
  contextMenuOpen: boolean;
  /**
   * Its viewport blocker would make an ignored Escape look like a frozen app; Escape closes only
   * the tour.
   */
  tourOpen: boolean;
  /** Defense in depth: focus may have left the composer while it still blocks the page. */
  createNodeOpen: boolean;
  /**
   * An `aria-modal` blocking surface answers before the rungs below, or Escape releases a
   * selection under it.
   */
  bootstrapOpen: boolean;
  /**
   * The palette closes itself; returning "none" keeps one keypress from also deselecting the node
   * below.
   */
  searchOpen: boolean;
  fullDetailOpen: boolean;
  selectedRelationActive: boolean;
  hasSelection: boolean;
  /**
   * Escape#1 closes only the popover and keeps ego focus; Escape#2 then deselects.
   * False for a selected project or a dismissed popover, which deselect in one press.
   */
  nodePopoverOpen: boolean;
  hasLocalGraphRoot: boolean;
}

export type TopologyEscLadderAction =
  | "close-realm"
  | "close-edge-popover"
  | "close-context-menu"
  | "close-tour"
  | "close-create-node"
  | "close-bootstrap"
  | "close-full-detail"
  | "close-relation-lens"
  | "close-node-popover"
  | "deselect"
  | "pop-local-graph"
  | "none";

/**
 * One thing per keypress, in this priority order: realm, edge popover, context menu, tour,
 * composer,
 * search (deferred), full detail, relation lens, node popover, deselect, local-graph pop, nothing.
 */
export function resolveTopologyEscLadderAction(
  input: TopologyEscLadderInput,
): TopologyEscLadderAction {
  if (input.realmActive) return "close-realm";
  if (input.selectedEdgeActive) return "close-edge-popover";
  if (input.contextMenuOpen) return "close-context-menu";
  if (input.tourOpen) return "close-tour";
  if (input.createNodeOpen) return "close-create-node";
  if (input.bootstrapOpen) return "close-bootstrap";
  // The palette handles this keypress itself.
  if (input.searchOpen) return "none";
  if (input.fullDetailOpen) return "close-full-detail";
  if (input.selectedRelationActive) return "close-relation-lens";
  if (input.hasSelection && input.nodePopoverOpen) return "close-node-popover";
  if (input.hasSelection) return "deselect";
  if (input.hasLocalGraphRoot) return "pop-local-graph";
  return "none";
}
