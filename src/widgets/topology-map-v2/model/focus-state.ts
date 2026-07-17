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
 *
 * STUB: the lead implements the bodies. See `focus-state.test.ts`.
 */

export type NodeEgoState = "center" | "neighbor" | "dim" | "normal";
export type EdgeEgoState = "ego" | "dim" | "normal";

/**
 * `"center"` if `nodeId === focusedNodeId`, `"neighbor"` if `nodeId` is a
 * 1-hop neighbor of the focused node, `"dim"` otherwise — but only when a
 * focus is active at all; with no focus, every node is `"normal"`.
 */
export function resolveNodeEgoState(
  _nodeId: string,
  _focusedNodeId: string | null,
  _neighborsOfFocused: ReadonlySet<string>,
): NodeEgoState {
  throw new Error(
    "TODO(lead): implement resolveNodeEgoState per the prototype's nodeEgoState() — focus-state.test.ts pins the contract.",
  );
}

/** `"ego"` if the edge touches the focused node, `"dim"` otherwise; `"normal"` with no focus. */
export function resolveEdgeEgoState(
  _edgeTouchesFocusedNode: boolean,
  _focusedNodeId: string | null,
): EdgeEgoState {
  throw new Error(
    "TODO(lead): implement resolveEdgeEgoState per the prototype's edgeEgoState() — focus-state.test.ts pins the contract.",
  );
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
  _hoveredNodeId: string,
  _nowMs: number,
  _neighborIds: readonly string[],
  _baseDelayMs: number,
  _perNeighborDelayMs: number,
): readonly RippleSchedule[] {
  throw new Error(
    "TODO(lead): implement scheduleRipple per the prototype's startRipple() — focus-state.test.ts pins the contract.",
  );
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
  _currentEmphasis: number,
  _isInActiveEgoSet: boolean,
  _rippleHasStarted: boolean,
  _dt: number,
  _riseTau: number,
  _decayTau: number,
): number {
  throw new Error(
    "TODO(lead): implement stepEmphasis per the prototype's updateEmphasis() — focus-state.test.ts pins the contract.",
  );
}
