/**
 * The map's "a blocking surface owns the keyboard" contract.
 *
 * Each global shortcut used to carry its own ad-hoc guard
 * (`if (createNodeOpen) return;`). They covered the concept composer but missed
 * the guided tour, so pressing `?` during a tour stacked the shortcut modal on
 * the tour card: two live `role="dialog"` surfaces with nobody owning focus
 * (measured 2026-07-25).
 *
 * `.claude/rules/design.md` requires a transient surface to close or demote
 * unrelated surfaces, so two conflicting overlays standing at once is a defect.
 * Collecting the guards into one predicate means a new blocking surface is added
 * here once, and this file's tests catch it if it is not.
 *
 * This pairs with the opposite-direction contract (`openCreateNode`,
 * `openGuidedTour`): opening closes the others, and staying open monopolises the
 * keyboard.
 */

export interface BlockingSurfaceState {
  /** The concept composer — a modal that dims the map and blocks interaction. */
  createNodeOpen: boolean;
  /** The guided tour — a sequence with its own scrim and focus trap. */
  tourOpen: boolean;
  /**
   * An agent has stopped and is waiting for a yes or no.
   *
   * ⚠️ **Measured 2026-08-24, installed app.** The permission card declares
   * `role="alertdialog"` and is the most expensive single decision in this product, yet it was
   * missing from this predicate. A single unmodified letter still fired — `d` opened the documents
   * drawer directly over the pending card, and Escape then went to the card, not the drawer, so the
   * person could neither answer the question nor clear the thing covering it. Both ways out were
   * gone at once.
   *
   * That is the exact failure this file was written for, arriving through a surface added later —
   * which is why the guard belongs here and not as another ad-hoc `if` beside one shortcut.
   */
  agentAwaitingDecision: boolean;
}

/**
 * Whether global shortcuts must be ignored right now. While true the user closes
 * the open surface with Esc first — the ordinary contract that a modal owns the
 * keyboard.
 */
export function shouldSuppressGlobalShortcuts(state: BlockingSurfaceState): boolean {
  return state.createNodeOpen || state.tourOpen || state.agentAwaitingDecision;
}
