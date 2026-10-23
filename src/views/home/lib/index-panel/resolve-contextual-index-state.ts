import type { IndexPanelState } from "@/widgets/topology-index-panel";
/** Keep both panels only where their remaining map span can hold a readable branch. */
export const FLAT_SELECTION_KEEPS_INDEX_FROM_PX = 1280;

export interface ContextualIndexStateInputs {
  baseState: IndexPanelState;
  meaningEditorOpen: boolean;
  selectionActive: boolean;
  selectionManualExpand: boolean;
  selectionKeepsIndex: boolean;
  graphEmpty: boolean;
  emptyManualExpand: boolean;
  agentDockOpen: boolean;
}

/**
 * The INDEX state for this moment, leaving the persisted preference alone: a contextual work
 * surface borrows the map's width and `baseState` returns when it leaves.
 */
export function resolveContextualIndexState({
  baseState,
  meaningEditorOpen,
  selectionActive,
  selectionManualExpand,
  selectionKeepsIndex,
  graphEmpty,
  emptyManualExpand,
  agentDockOpen,
}: ContextualIndexStateInputs): IndexPanelState {
  if (baseState === "collapsed") return "collapsed";
  if (meaningEditorOpen || agentDockOpen) return "collapsed";
  if (selectionActive && !selectionManualExpand && !selectionKeepsIndex) return "collapsed";
  if (graphEmpty && !emptyManualExpand) return "collapsed";
  return "expanded";
}
