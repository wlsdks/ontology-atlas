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
 * Resolves the INDEX state that is rendered for this moment without changing
 * the user's persisted preference. Contextual work surfaces temporarily own
 * the map's horizontal room; when they leave, `baseState` is restored.
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
