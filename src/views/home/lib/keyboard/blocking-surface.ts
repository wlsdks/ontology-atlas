/**
 * One "a blocking surface owns the keyboard" predicate for every global shortcut. A new blocking
 * surface is added here once (`.claude/rules/design.md`: one transient surface at a time).
 */

export interface BlockingSurfaceState {
  createNodeOpen: boolean;
  /**
   * The permission card (`role="alertdialog"`): without it a letter shortcut opens a drawer over
   * the pending decision.
   */
  agentAwaitingDecision: boolean;
}

/** While true, Esc closes the open surface first; a modal owns the keyboard. */
export function shouldSuppressGlobalShortcuts(state: BlockingSurfaceState): boolean {
  return state.createNodeOpen || state.agentAwaitingDecision;
}
