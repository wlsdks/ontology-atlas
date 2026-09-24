import type { IndexPanelState } from "@/widgets/topology-index-panel";

/**
 * Below this width INDEX folds while a node panel is open, even when the node was picked from
 * INDEX. Measured 2026-09-25: at 1040x720 INDEX (right edge 388) and the node panel (x 664) left
 * 276px of map and covered the selected node; at 1280x800 the panel still sat on the node's label.
 * At 1512 the three fit side by side, which is where the meaning workbench already shows the tab.
 */
export const INDEX_SELECTION_CROWDED_BELOW_PX = 1440;

export interface ContextualIndexStateInputs {
  baseState: IndexPanelState;
  meaningEditorOpen: boolean;
  selectionActive: boolean;
  selectionManualExpand: boolean;
  /**
   * The window is too narrow for INDEX, the node panel and a usable map at once (below
   * `INDEX_SELECTION_CROWDED_BELOW_PX`). There, only pressing the folded tab during the selection
   * keeps INDEX open — picking the row in INDEX no longer does.
   */
  selectionCrowded?: boolean;
  /** The expansion during this selection came from the folded tab. */
  selectionManualExpandByTab?: boolean;
  graphEmpty: boolean;
  emptyManualExpand: boolean;
  agentDockOpen: boolean;
}

/**
 * Resolves the INDEX state that is rendered for this moment without changing
 * the user's persisted preference. Contextual work surfaces temporarily own
 * the map's horizontal room; when they leave, `baseState` is restored.
 */
export function resolveContextualIndexState({
  baseState,
  meaningEditorOpen,
  selectionActive,
  selectionManualExpand,
  selectionCrowded = false,
  selectionManualExpandByTab = false,
  graphEmpty,
  emptyManualExpand,
  agentDockOpen,
}: ContextualIndexStateInputs): IndexPanelState {
  if (baseState === "collapsed") return "collapsed";
  if (meaningEditorOpen || agentDockOpen) return "collapsed";
  if (selectionActive && !selectionManualExpand) return "collapsed";
  if (selectionActive && selectionCrowded && !selectionManualExpandByTab) return "collapsed";
  if (graphEmpty && !emptyManualExpand) return "collapsed";
  return "expanded";
}
