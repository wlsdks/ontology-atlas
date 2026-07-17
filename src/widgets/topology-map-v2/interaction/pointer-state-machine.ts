/**
 * Pointer state machine skeleton — the click-safe contract
 * (`.claude/rules/design.md` "클릭=안전 계약", `docs/INTERACTION-DESIGN.md` §1,
 * `docs/TOPOLOGY-V2-DESIGN.md` §3.6) ported from the B2+ prototype's
 * `pointerdown`/`pointermove`/`releaseDrag()` handlers
 * (`docs/prototypes/topology-b2plus.html` §9).
 *
 * Contract (this is the part that must never regress):
 * - `pointerdown` records `downPoint` and hit-tests a `pressedNodeId` —
 *   this is **not** a commit. Nothing durable (focus/camera) changes yet.
 * - `pointermove` while `phase === "pressed"`: once
 *   `engine/hysteresis.ts#exceedsHysteresisThreshold` trips, transition to
 *   `"dragging"` and **clear `pressedNodeId`** (prototype: "드래그 이탈
 *   (`HYSTERESIS=7px`) 시 취소" — a drag can never commit a click, even if
 *   the pointer later returns near the down-point).
 * - `pointerup` while still `"pressed"` (never exceeded hysteresis) emits a
 *   `commitClick` — the ONLY place a click fires. `pointerup` while
 *   `"dragging"` emits no click, only ends the drag (camera keeps whatever
 *   momentum `engine/momentum.ts` projected).
 * - `pointercancel` always returns to `"idle"` with no commit, matching
 *   `pointerup`'s drag-cancel path in the prototype (`releaseDrag` is
 *   registered for both events).
 * - Hover state is **not** part of this state machine — the prototype only
 *   computes `hoveredNode` in `pointermove` while `pointer.down` is false at
 *   all (i.e., phase `"idle"`), and only when `focusedNode` is null
 *   (`model/focus-state.ts` owns the suppression rule). This module only
 *   answers "is the pointer idle/pressed/dragging", not "what is hovered".
 *
 * STUB: the lead implements the body (wiring `engine/hysteresis.ts`'s
 * `exceedsHysteresisThreshold`). See `pointer-state-machine.test.ts`.
 */

export type PointerPhase = "idle" | "pressed" | "dragging";

export interface PointerPoint {
  x: number;
  y: number;
}

export interface PointerMachineState {
  phase: PointerPhase;
  /** Screen point at the most recent pointerdown, or null while idle. */
  downPoint: PointerPoint | null;
  /** Node hit-tested at pointerdown — cleared the instant dragging begins. */
  pressedNodeId: string | null;
}

export type PointerMachineEvent =
  | { type: "pointerdown"; point: PointerPoint; hitNodeId: string | null }
  | { type: "pointermove"; point: PointerPoint }
  | { type: "pointerup" }
  | { type: "pointercancel" };

export interface PointerMachineTransition {
  next: PointerMachineState;
  /**
   * Non-null exactly once: on a genuine click commit (pointerup while phase
   * was `"pressed"`, never `"dragging"`). `nodeId: null` means "clicked empty
   * canvas" — the caller (`ui/TopologyMapV2.tsx`) maps that to `clearFocus()`
   * (or a no-op if nothing was focused), and a non-null id to `setFocus(id)`
   * or `clearFocus()` if it matches the already-focused node (toggle).
   */
  commitClick: { nodeId: string | null } | null;
}

export const INITIAL_POINTER_MACHINE_STATE: PointerMachineState = {
  phase: "idle",
  downPoint: null,
  pressedNodeId: null,
};

/**
 * Pure transition function — one event in, one `{next, commitClick}` out.
 * The caller owns hit-testing (`hitNodeId` is provided by the caller on
 * `pointerdown`, not computed here) and owns feeding the result's
 * `commitClick` into `model/focus-state.ts`'s focus transitions.
 */
export function transitionPointerState(
  _current: PointerMachineState,
  _event: PointerMachineEvent,
  _hysteresisThresholdPx: number,
): PointerMachineTransition {
  throw new Error(
    "TODO(lead): implement transitionPointerState per docs/TOPOLOGY-V2-DESIGN.md §3.6 " +
      "and the prototype's pointerdown/pointermove/releaseDrag() — pointer-state-machine.test.ts pins the contract.",
  );
}
