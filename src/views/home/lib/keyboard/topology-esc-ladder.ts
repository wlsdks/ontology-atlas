/** One Escape dismisses one surface, including a review still acquiring focus. */
export interface TopologyEscLadderInput {
  /** The review may be open before its animated surface can take keyboard focus. */
  workbenchOpen?: boolean;
  /** Leaving a realm outranks any overlay inside it, since it changes the whole view. */
  realmActive?: boolean;
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
   * An `aria-modal` blocking surface answers before the rungs below, or Escape releases a selection
   * under it.
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
   * False for a selected project, a dismissed popover or the Flat map, which deselect in one press.
   */
  nodePopoverOpen: boolean;
  hasLocalGraphRoot: boolean;
}

export type TopologyEscLadderAction =
  | "close-workbench"
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
 * An open workbench dismisses its nested surfaces before itself. Otherwise the map keeps this
 * priority order: realm, edge popover, context menu, tour,
 * composer, search (deferred), full detail, relation lens, node popover, deselect, local-graph pop,
 * nothing.
 */
export function resolveTopologyEscLadderAction(
  input: TopologyEscLadderInput,
): TopologyEscLadderAction {
  // Match the review's local Escape handler while focus is still on its opener.
  // A nested surface must retain its own first dismissal.
  if (input.workbenchOpen) {
    if (input.searchOpen) return "none";
    if (input.contextMenuOpen) return "close-context-menu";
    if (input.tourOpen) return "close-tour";
    if (input.createNodeOpen) return "close-create-node";
    if (input.bootstrapOpen) return "close-bootstrap";
    if (input.fullDetailOpen) return "close-full-detail";
    return "close-workbench";
  }
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
