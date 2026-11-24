import type { IndexPanelState } from "@/widgets/topology-index-panel";
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
  /** The code reader needs the list's room while it is open. */
  codeReaderHoldsRoom: boolean;
}

export function resolveContextualIndexState({
  baseState,
  meaningEditorOpen,
  selectionActive,
  selectionManualExpand,
  selectionKeepsIndex,
  graphEmpty,
  emptyManualExpand,
  agentDockOpen,
  codeReaderHoldsRoom,
}: ContextualIndexStateInputs): IndexPanelState {
  if (baseState === "collapsed") return "collapsed";
  if (meaningEditorOpen || agentDockOpen || codeReaderHoldsRoom) return "collapsed";
  if (selectionActive && !selectionManualExpand && !selectionKeepsIndex) return "collapsed";
  if (graphEmpty && !emptyManualExpand) return "collapsed";
  return "expanded";
}
