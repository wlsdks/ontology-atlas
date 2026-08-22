/**
 * The Esc ladder for the topology canvas selection layer — the order in which a
 * single Escape keypress dismisses things (a dismissal order, not a value ramp).
 *
 * The composer / search / shortcuts-sheet / docs-drawer overlays already
 * close themselves on Escape (`SearchPalette`, `ShortcutSheet`,
 * `DocsQuickDrawer` each install their own `keydown` listener that calls
 * `onClose`; the ontology/global search dialog is a Radix `Dialog`, which
 * closes on Escape natively). What was missing — the gap this ladder fills,
 * and what the shortcut sheet's `stepCloseOverlays` promise ("Close drawers
 * and overlays one step at a time") did not yet keep — is Escape closing the
 * *selection* layer: the full-detail drawer, the relation lens, the node
 * popover/datasheet itself, and the local-graph ego-drill breadcrumb. Before
 * this, pressing Escape while a node was selected did nothing at all; the
 * local-graph breadcrumb's own Escape binding popped unconditionally
 * regardless of whatever else was open — two things could happen on one
 * keypress. This function is the single decision point both bugs route
 * through now.
 *
 * Pure decision table, no DOM/React — see `topology-esc-ladder.test.ts` for
 * the ladder-order contract and `HomePage.tsx`'s `keydown` effect for the
 * dispatch.
 */
export interface TopologyEscLadderInput {
  /**
   * A realm is expanded (`?realm=`) — the map has switched to one node's world.
   * Owner instruction puts this first in the dismissal order: leaving the world
   * is the primary escape expectation, ahead of any transient overlay inside it,
   * because a realm is the top-level context that changes the whole view.
   */
  realmActive?: boolean;
  /**
   * The edge popover (`TopologyV2EdgePanel`, role=dialog) is open. It is
   * consumed after the realm and before every other overlay, under the same
   * "most recently opened transient surface first" contract as the node popover.
   * This decision used to be inline in `HomePage`'s keydown effect, where the
   * ladder's unit tests could not see this rung — it was lifted here so the
   * regression (edge popover not closing on Escape) stays reproducible.
   */
  selectedEdgeActive?: boolean;
  /** Node right-click context menu open — the newest, most transient
   *  overlay, so it closes first (above even the create-node composer): a
   *  context menu that outlives the keypress meant to dismiss whatever else
   *  is open would read as stuck chrome. */
  contextMenuOpen: boolean;
  /**
   * Guided tour open (`src/features/guided-tour`). Ranked right after the
   * context menu and before the create-node composer, under the "most recently
   * opened transient surface first" contract. It installs its own transparent viewport
   * blocker, so leaving it open on Escape would read as the app ignoring
   * the keypress entirely. Escape closes ONLY the tour (records `skipped`);
   * it does not fall through to anything else on the same press.
   */
  tourOpen: boolean;
  /** Create-node composer open (defense in depth — the composer already
   *  closes itself on Escape while it holds focus; this covers the case
   *  where focus has moved outside it while it's still blocking the page). */
  createNodeOpen: boolean;
  /**
   * The bootstrap panel (`ontology-bootstrap-panel`) is open.
   *
   * It had no rung here at all, so Escape did nothing (reproduced 2026-07-28
   * with a connected vault: `aria-modal` survived the keypress). The app's own
   * shortcut sheet promises that Escape closes open surfaces one step at a time
   * and every other dialog behaves that way, so this one exception reads as the
   * app ignoring the key.
   *
   * As an `aria-modal` blocking surface it must answer before the rungs below —
   * releasing a selection underneath something that covers it is not what the
   * user asked for.
   */
  bootstrapOpen: boolean;
  /** Global search / ontology palette open (`MountedGlobalSearch` → Radix
   *  `Dialog`, which already closes itself on Escape). If this is true the
   *  ladder must return "none" and let the palette's own handler own the
   *  keypress — otherwise the window-level ladder ALSO acts on the same
   *  Escape (e.g. deselecting the node underneath), so one keypress closes
   *  two things at once. Regression: persona hit palette-open + node-selected
   *  → Escape closed the palette AND cleared the selection in one press. */
  searchOpen: boolean;
  /** Full-detail drawer — the popover/datasheet's opt-in full-detail overlay. */
  fullDetailOpen: boolean;
  /** Relation lens active — replaces the popover with a relation-focused view. */
  selectedRelationActive: boolean;
  /** A node/project is selected, so the ego focus (dim) is active. */
  hasSelection: boolean;
  /**
   * The compact node popover/datasheet is currently VISIBLE (a node is
   * selected AND the popover has not yet been dismissed). Clicking a node sets
   * BOTH the ego focus (dim) and the popover; a single Escape used to clear
   * both at once (`hasSelection → deselect`), collapsing the two-rung "close
   * popover, THEN release focus" contract the shortcut sheet promises. When
   * this is true, Escape#1 closes only the popover (ego focus survives);
   * Escape#2 then falls through to `deselect`. A selected *project* (no node
   * popover) or a popover already dismissed leaves this false, so those
   * deselect in one press as before.
   */
  nodePopoverOpen: boolean;
  /** Local-graph ego-drill stack has at least one entry to pop. */
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
 * Resolves what a single Escape keypress should do, in priority order:
 * realm → edge popover → context menu → guided tour → create-node composer →
 * search palette (deferred to its own handler) → full-detail drawer →
 * relation lens → close the node popover (ego focus survives) → deselect the
 * current node → pop one level of the local-graph breadcrumb → nothing. Each
 * tier closes exactly one thing; the caller re-evaluates on the next
 * keypress, which is what makes this "one step at a time" rather than "close
 * everything".
 */
export function resolveTopologyEscLadderAction(
  input: TopologyEscLadderInput,
): TopologyEscLadderAction {
  // A realm changes the whole view, so leaving it outranks every overlay inside
  // it (owner instruction).
  if (input.realmActive) return "close-realm";
  if (input.selectedEdgeActive) return "close-edge-popover";
  if (input.contextMenuOpen) return "close-context-menu";
  if (input.tourOpen) return "close-tour";
  if (input.createNodeOpen) return "close-create-node";
  if (input.bootstrapOpen) return "close-bootstrap";
  // The palette (Radix Dialog) already closes itself on Escape — returning
  // "none" here means the window ladder does nothing this keypress, so only
  // the palette closes. Without this tier, the ladder would fall through to
  // "deselect"/etc. on the SAME keypress the palette handles internally.
  if (input.searchOpen) return "none";
  if (input.fullDetailOpen) return "close-full-detail";
  if (input.selectedRelationActive) return "close-relation-lens";
  // Escape#1 closes only the node popover, leaving the ego focus (dim)
  // in place; the NEXT Escape (with the popover now dismissed, so
  // `nodePopoverOpen` false) falls through to `deselect` and releases focus.
  if (input.hasSelection && input.nodePopoverOpen) return "close-node-popover";
  if (input.hasSelection) return "deselect";
  if (input.hasLocalGraphRoot) return "pop-local-graph";
  return "none";
}
