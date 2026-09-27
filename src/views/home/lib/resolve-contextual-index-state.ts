import type { IndexPanelState } from "@/widgets/topology-index-panel";

export interface ContextualIndexStateInputs {
  baseState: IndexPanelState;
  meaningEditorOpen: boolean;
  selectionActive: boolean;
  selectionManualExpand: boolean;
  graphEmpty: boolean;
  emptyManualExpand: boolean;
  agentDockOpen: boolean;
}

/**
 * The INDEX state for this moment, leaving the persisted preference alone: a contextual work
 * surface borrows
 * the map's width and `baseState` returns when it leaves.
 */
export function resolveContextualIndexState({
  baseState,
  meaningEditorOpen,
  selectionActive,
  selectionManualExpand,
  graphEmpty,
  emptyManualExpand,
  agentDockOpen,
}: ContextualIndexStateInputs): IndexPanelState {
  if (baseState === "collapsed") return "collapsed";
  if (meaningEditorOpen || agentDockOpen) return "collapsed";
  if (selectionActive && !selectionManualExpand) return "collapsed";
  if (graphEmpty && !emptyManualExpand) return "collapsed";
  return "expanded";
}
