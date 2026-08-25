import type { IndexPanelState } from "@/widgets/topology-index-panel";

export interface ContextualIndexStateInputs {
  baseState: IndexPanelState;
  meaningEditorOpen: boolean;
  selectionActive: boolean;
  selectionManualExpand: boolean;
  graphEmpty: boolean;
  emptyManualExpand: boolean;
  agentDockOpen: boolean;
  /** The start checklist is on screen; it centres in the map area and must not be pushed off-centre. */
  startStepsOpen: boolean;
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
  startStepsOpen,
}: ContextualIndexStateInputs): IndexPanelState {
  if (baseState === "collapsed") return "collapsed";
  /*
   * ⚠️ **The start checklist owns the screen while it is up** (owner, 2026-08-25: *"I don't like
   * where the AI-agent-connect guide sits when the left INDEX panel opens — from the user's side it
   * is not actually centred. While that popup is up, INDEX should not be openable at all; just close
   * it."*)
   *
   * The checklist centres itself in the map area, and opening INDEX shrinks that area — so the thing
   * asking for the person's attention drifted off the middle of the window while still claiming the
   * middle. Two surfaces competed for one decision. Collapsing INDEX makes the map area the window
   * again, which puts the checklist where it says it is, and leaves one surface owning the moment —
   * the rule the canonical Don'ts already state for blocking surfaces.
   */
  if (meaningEditorOpen || agentDockOpen || startStepsOpen) return "collapsed";
  if (selectionActive && !selectionManualExpand) return "collapsed";
  if (graphEmpty && !emptyManualExpand) return "collapsed";
  return "expanded";
}
