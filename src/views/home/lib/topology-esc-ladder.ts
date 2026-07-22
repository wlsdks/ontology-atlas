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
  /**
   * "영역 전개" (S4) 활성 — 지도가 한 노드의 세계로 전환된 상태(`?realm=`).
   * 소유자 지시로 Esc 사다리 최우선: 영역 안에서 Esc 는 무엇보다 먼저 영역을
   * 벗어난다(전체 지도 복귀). 영역은 뷰 전체를 바꾸는 최상위 컨텍스트라, 그
   * 안의 어떤 전이 오버레이보다 "이 세계에서 나가기"가 사용자의 1차 탈출
   * 기대다. 미지정/false 면 사다리는 종전과 동일(회귀 0).
   */
  realmActive?: boolean;
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
  /** A node/project is selected, so the ego focus (dim) is active. */
  hasSelection: boolean;
  /**
   * M-7 — the compact node popover/datasheet is currently VISIBLE (a node is
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
  | "close-context-menu"
  | "close-create-node"
  | "close-full-detail"
  | "close-relation-lens"
  | "close-node-popover"
  | "deselect"
  | "pop-local-graph"
  | "none";

/**
 * Resolves what a single Escape keypress should do, in priority order:
 * context menu → create-node composer → search palette (deferred to its own
 * handler) → full-detail drawer → relation lens → close the node popover (ego
 * focus survives) → deselect the current node → pop one level of the
 * local-graph breadcrumb → nothing. Each tier closes exactly one thing; the
 * caller re-evaluates on the next keypress, which is what makes this "one step
 * at a time" rather than "close everything".
 */
export function resolveTopologyEscLadderAction(
  input: TopologyEscLadderInput,
): TopologyEscLadderAction {
  // S4 — 영역 전개는 뷰 전체를 바꾸는 최상위 컨텍스트라 Esc 사다리 최우선
  // (소유자 지시). 영역 안에서 Esc 는 무엇보다 먼저 전체 지도로 복귀한다.
  if (input.realmActive) return "close-realm";
  if (input.contextMenuOpen) return "close-context-menu";
  if (input.createNodeOpen) return "close-create-node";
  // The palette (Radix Dialog) already closes itself on Escape — returning
  // "none" here means the window ladder does nothing this keypress, so only
  // the palette closes. Without this tier, the ladder would fall through to
  // "deselect"/etc. on the SAME keypress the palette handles internally.
  if (input.searchOpen) return "none";
  if (input.fullDetailOpen) return "close-full-detail";
  if (input.selectedRelationActive) return "close-relation-lens";
  // M-7 — Escape#1 closes only the node popover, leaving the ego focus (dim)
  // in place; the NEXT Escape (with the popover now dismissed, so
  // `nodePopoverOpen` false) falls through to `deselect` and releases focus.
  if (input.hasSelection && input.nodePopoverOpen) return "close-node-popover";
  if (input.hasSelection) return "deselect";
  if (input.hasLocalGraphRoot) return "pop-local-graph";
  return "none";
}
