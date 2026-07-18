/**
 * P0#3 — Esc staged-close ladder for the topology canvas selection layer.
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
  /** W2-B node right-click context menu open — the newest, most transient
   *  overlay, so it closes first (above even the create-node composer): a
   *  context menu that outlives the keypress meant to dismiss whatever else
   *  is open would read as stuck chrome. */
  contextMenuOpen: boolean;
  /** Create-node composer open (defense in depth — the composer already
   *  closes itself on Escape while it holds focus; this covers the case
   *  where focus has moved outside it while it's still blocking the page). */
  createNodeOpen: boolean;
  /** Global search / ontology palette open (`MountedGlobalSearch` → Radix
   *  `Dialog`, which already closes itself on Escape). If this is true the
   *  ladder must return "none" and let the palette's own handler own the
   *  keypress — otherwise the window-level ladder ALSO acts on the same
   *  Escape (e.g. deselecting the node underneath), so one keypress closes
   *  two things at once. Regression: persona hit palette-open + node-selected
   *  → Escape closed the palette AND cleared the selection in one press. */
  searchOpen: boolean;
  /** "전체 상세" drawer — the popover/datasheet's opt-in full-detail overlay. */
  fullDetailOpen: boolean;
  /** Relation lens active — replaces the popover with a relation-focused view. */
  selectedRelationActive: boolean;
  /** A node/project is selected, so the popover/datasheet is showing. */
  hasSelection: boolean;
  /** Local-graph ego-drill stack has at least one entry to pop. */
  hasLocalGraphRoot: boolean;
}

export type TopologyEscLadderAction =
  | "close-context-menu"
  | "close-create-node"
  | "close-full-detail"
  | "close-relation-lens"
  | "deselect"
  | "pop-local-graph"
  | "none";

/**
 * Resolves what a single Escape keypress should do, in priority order:
 * context menu → create-node composer → search palette (deferred to its own
 * handler) → full-detail drawer → relation lens → deselect the current node
 * → pop one level of the local-graph breadcrumb → nothing. Each tier closes
 * exactly one thing; the caller re-evaluates on the next keypress, which is
 * what makes this "one step at a time" rather than "close everything".
 */
export function resolveTopologyEscLadderAction(
  input: TopologyEscLadderInput,
): TopologyEscLadderAction {
  if (input.contextMenuOpen) return "close-context-menu";
  if (input.createNodeOpen) return "close-create-node";
  // The palette (Radix Dialog) already closes itself on Escape — returning
  // "none" here means the window ladder does nothing this keypress, so only
  // the palette closes. Without this tier, the ladder would fall through to
  // "deselect"/etc. on the SAME keypress the palette handles internally.
  if (input.searchOpen) return "none";
  if (input.fullDetailOpen) return "close-full-detail";
  if (input.selectedRelationActive) return "close-relation-lens";
  if (input.hasSelection) return "deselect";
  if (input.hasLocalGraphRoot) return "pop-local-graph";
  return "none";
}
