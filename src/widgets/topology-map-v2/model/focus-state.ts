/**
 * Focus / ego-state machine + hover-ripple emphasis — ported from the B2+
 * prototype's `nodeEgoState()`/`edgeEgoState()`/`startRipple()`/
 * `updateEmphasis()` (`docs/prototypes/topology-b2plus.html` §9, §11, §13).
 *
 * Contract (`docs/TOPOLOGY-V2-DESIGN.md` §3.2 "State Contract 매핑",
 * §3.6 "클릭=안전 계약"):
 * - **Click** sets a *durable* focus (`focusedNode`) — the ego-set (focused
 *   node + its 1-hop neighbors) reads as `"center"`/`"neighbor"`, everything
 *   else as `"dim"` (opaque dim tokens, never alpha — see
 *   `--topology-v2-node-fill-dim`/`node-stroke-dim`).
 * - **Hover** only raises `emphasis` (ripple) — it never touches focus/camera,
 *   and is suppressed entirely while a focus is active ("포커스가 emphasis
 *   소유권 독점", prototype: `if (focusedNode) return;` in pointermove).
 * - `emphasis` per node is a scalar 0..1 that exponentially rises toward 1
 *   while the node is in the active hover's ego-set AND its ripple delay has
 *   elapsed, and decays toward 0 otherwise:
 *   ```
 *   rising:  emphasis += (1 - emphasis) * (1 - exp(-dt / riseTau))   // riseTau  = --topology-v2-emphasis-rise-tau  (0.09s)
 *   falling: emphasis += (0 - emphasis) * (1 - exp(-dt / decayTau))  // decayTau = --topology-v2-emphasis-decay-tau (0.15s)
 *   ```
 * - Ripple stagger: hovering node N schedules its own ramp to start
 *   immediately, and each 1-hop neighbor's ramp to start
 *   `baseDelayMs + i*perNeighborDelayMs` later (`--topology-v2-ripple-stagger-ms`
 *   = 55, `+12`/neighbor — both numbers live under that one token in the
 *   design doc's §2.4 table, the prototype's `startRipple()`).
 *
 * Pure state — no DOM/pointer-event/canvas knowledge. `interaction/pointer-state-machine.ts`
 * owns translating raw pointer events into `focusedNodeId`/`hoveredNodeId`
 * changes that this module reacts to.
 */

export type NodeEgoState = "center" | "neighbor" | "dim" | "normal";
export type EdgeEgoState = "ego" | "dim" | "normal";

/**
 * `"center"` if `nodeId === focusedNodeId`, `"neighbor"` if `nodeId` is a
 * 1-hop neighbor of the focused node, `"dim"` otherwise — but only when a
 * focus is active at all; with no focus, every node is `"normal"`.
 */
export function resolveNodeEgoState(
  nodeId: string,
  focusedNodeId: string | null,
  neighborsOfFocused: ReadonlySet<string>,
): NodeEgoState {
  if (focusedNodeId === null) return "normal";
  if (nodeId === focusedNodeId) return "center";
  if (neighborsOfFocused.has(nodeId)) return "neighbor";
  return "dim";
}

/** `"ego"` if the edge touches the focused node, `"dim"` otherwise; `"normal"` with no focus. */
export function resolveEdgeEgoState(
  edgeTouchesFocusedNode: boolean,
  focusedNodeId: string | null,
): EdgeEgoState {
  if (focusedNodeId === null) return "normal";
  return edgeTouchesFocusedNode ? "ego" : "dim";
}

/**
 * 엣지 선택 = 페어 포커스 (사용자 요청: "선을 클릭하면 그 선과 연결된
 * 노드간만 표시"). 노드 포커스가 없고 엣지가 선택된 동안:
 * - 양끝 노드는 "neighbor" 급 (주인공은 '선'이므로 center 링 없음)
 * - 나머지 노드/엣지는 "dim"
 * - 선택된 엣지 자체는 "ego" (+ 별도 selected 스트로크는 드로어 소관)
 * 노드 포커스가 있으면 기존 ego 규칙이 우선한다 (클릭=안전 계약 유지).
 */
export interface EdgePairFocus {
  sourceId: string;
  targetId: string;
}

export function resolveNodeEgoStateWithPair(
  nodeId: string,
  focusedNodeId: string | null,
  neighborsOfFocused: ReadonlySet<string>,
  pair: EdgePairFocus | null,
): NodeEgoState {
  if (focusedNodeId === null && pair !== null) {
    return nodeId === pair.sourceId || nodeId === pair.targetId ? "neighbor" : "dim";
  }
  return resolveNodeEgoState(nodeId, focusedNodeId, neighborsOfFocused);
}

export function resolveEdgeEgoStateWithPair(
  edgeTouchesFocusedNode: boolean,
  focusedNodeId: string | null,
  pair: EdgePairFocus | null,
  isSelectedEdge: boolean,
): EdgeEgoState {
  if (focusedNodeId === null && pair !== null) {
    return isSelectedEdge ? "ego" : "dim";
  }
  return resolveEdgeEgoState(edgeTouchesFocusedNode, focusedNodeId);
}

/**
 * Ambient comet-tail advance speed for one `depends` edge (`world.edges[].t +=
 * dt * speed`). When a node is clicked ("powered"), its own incident edges carry
 * *more current* — the pulse advances at `egoSpeed` instead of the ambient
 * `baseSpeed`, so the selected subgraph visibly reads as energized (B2+ circuit
 * metaphor, lead spec §2). Every other edge keeps the ambient `baseSpeed`.
 *
 * Pure — the caller decides `edgeTouchesFocusedNode` from
 * `edge.sourceId/targetId === focusedNodeId`. Speeds are tokens
 * (`--topology-v2-edge-pulse-speed` / `-ego`).
 */
export function resolveEdgePulseSpeed(
  edgeTouchesFocusedNode: boolean,
  focusedNodeId: string | null,
  baseSpeed: number,
  egoSpeed: number,
): number {
  return focusedNodeId !== null && edgeTouchesFocusedNode ? egoSpeed : baseSpeed;
}

/**
 * Whether a node may ramp its `emphasis` (hover-ripple) this frame.
 *
 * - **No focus:** hover owns the ripple — the hovered node and its 1-hop
 *   neighbors (`isHoverEgoMember`) ramp.
 * - **Focus active:** hover is suppressed (focus owns attention), EXCEPT the one
 *   node the user is hovering in the detail panel's "연결된 노드" list
 *   (`panelEmphasisNodeId`). That single neighbor still ramps so the panel row
 *   and the on-canvas node/edge light up together ("emphasis ripple" linkage,
 *   lead spec §4). `panelEmphasisNodeId` is null until the panel-hover API feeds
 *   it in.
 */
export function isNodeEmphasisActive(
  nodeId: string,
  focusedNodeId: string | null,
  isHoverEgoMember: boolean,
  panelEmphasisNodeId: string | null,
): boolean {
  if (focusedNodeId !== null) return nodeId === panelEmphasisNodeId;
  return isHoverEgoMember;
}

export interface RippleSchedule {
  nodeId: string;
  /** Absolute ms timestamp (same clock as `performance.now()`) when this node's ramp may begin. */
  startAtMs: number;
}

/**
 * Schedules the hovered node's own immediate ramp plus each neighbor's
 * staggered ramp. `baseDelayMs`/`perNeighborDelayMs` = 55/12 per
 * `--topology-v2-ripple-stagger-ms`.
 */
export function scheduleRipple(
  hoveredNodeId: string,
  nowMs: number,
  neighborIds: readonly string[],
  baseDelayMs: number,
  perNeighborDelayMs: number,
  maxTotalStaggerMs: number = Number.POSITIVE_INFINITY,
): readonly RippleSchedule[] {
  const own: RippleSchedule = { nodeId: hoveredNodeId, startAtMs: nowMs };
  // A7 — the stagger has a TOTAL budget (`--topology-v2-ripple-stagger-max-ms`).
  // Uncapped, a 40-neighbor hub started its last neighbor 523ms in — a slow
  // enumeration, while a 3-neighbor node finished in 91ms. The ripple says
  // "these are the neighbors"; it doesn't count them. High-degree nodes
  // compress the per-neighbor delay so every ripple ends inside the budget.
  const perDelay =
    neighborIds.length > 0 ? Math.min(perNeighborDelayMs, maxTotalStaggerMs / neighborIds.length) : perNeighborDelayMs;
  const neighbors = neighborIds.map((nodeId, i) => ({
    nodeId,
    startAtMs: nowMs + baseDelayMs + i * perDelay,
  }));
  return [own, ...neighbors];
}

/**
 * One exponential-smoothing step of a single node's emphasis value.
 *
 * @param currentEmphasis 0..1
 * @param isInActiveEgoSet true if this node is the hovered node or one of its
 *   1-hop neighbors AND no focus is currently suppressing hover
 * @param rippleHasStarted true once `nowMs >= scheduledStartAtMs` for this
 *   node (ignored when `isInActiveEgoSet` is false)
 * @param dt elapsed seconds since the last step
 * @param riseTau `--topology-v2-emphasis-rise-tau` = 0.09
 * @param decayTau `--topology-v2-emphasis-decay-tau` = 0.15
 */
export function stepEmphasis(
  currentEmphasis: number,
  isInActiveEgoSet: boolean,
  rippleHasStarted: boolean,
  dt: number,
  riseTau: number,
  decayTau: number,
): number {
  if (isInActiveEgoSet) {
    if (!rippleHasStarted) return currentEmphasis;
    return currentEmphasis + (1 - currentEmphasis) * (1 - Math.exp(-dt / riseTau));
  }
  return currentEmphasis + (0 - currentEmphasis) * (1 - Math.exp(-dt / decayTau));
}
