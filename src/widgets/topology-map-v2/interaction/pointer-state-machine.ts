/**
 * Pointer state machine skeleton — the click-safe contract
 * (`.claude/rules/design.md` "Click = Safe Contract";
 * `docs/INTERACTION-DESIGN.md` §1,
 * `docs/TOPOLOGY-V2-DESIGN.md` §3.6) ported from the B2+ prototype's
 * `pointerdown`/`pointermove`/`releaseDrag()` handlers
 * (`docs/prototypes/topology-b2plus.html` §9).
 *
 * Contract (this is the part that must never regress):
 * - `pointerdown` records `downPoint` and hit-tests a `pressedNodeId` —
 *   this is **not** a commit. Nothing durable (focus/camera) changes yet.
 * - `pointermove` while `phase === "pressed"`: once
 *   `engine/hysteresis.ts#exceedsHysteresisThreshold` trips, transition to
 *   `"dragging"` and **clear `pressedNodeId`** (prototype: "Cancel when drag leaves threshold (`HYSTERESIS=7px`)" — a
 *   drag can never commit a click, even if
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
 */

import { exceedsHysteresisThreshold } from "../engine/hysteresis";

type PointerPhase = "idle" | "pressed" | "dragging";

interface PointerPoint {
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
  current: PointerMachineState,
  event: PointerMachineEvent,
  hysteresisThresholdPx: number,
): PointerMachineTransition {
  switch (event.type) {
    case "pointerdown":
      return {
        next: { phase: "pressed", downPoint: event.point, pressedNodeId: event.hitNodeId },
        commitClick: null,
      };

    case "pointermove": {
      if (
        current.phase === "pressed" &&
        current.downPoint &&
        exceedsHysteresisThreshold(current.downPoint, event.point, hysteresisThresholdPx)
      ) {
        return {
          next: { phase: "dragging", downPoint: current.downPoint, pressedNodeId: null },
          commitClick: null,
        };
      }
      return { next: current, commitClick: null };
    }

    case "pointerup":
      return {
        next: INITIAL_POINTER_MACHINE_STATE,
        commitClick: current.phase === "pressed" ? { nodeId: current.pressedNodeId } : null,
      };

    case "pointercancel":
      return { next: INITIAL_POINTER_MACHINE_STATE, commitClick: null };
  }
}

/** The one user-visible effect a `commitClick` outcome should trigger. */
export type ClickAction =
  | { type: "select"; nodeId: string }
  | { type: "deselect" }
  | { type: "none" };

/**
 * Routes a `commitClick` outcome (this module's `pointerup` result) into
 * exactly one `ClickAction` — pure extraction of
 * `ui/topology-pointer-handlers.ts#handlePointerUp`'s commitClick routing so
 * the "click a revealed child = select it, click empty canvas = deselect"
 * contract has its own regression test, independent of canvas/pointer-event
 * plumbing (label-clarity persona eval — "child click ejects to overview
 * instead of selecting").
 *
 * - No commit at all → `"none"`.
 * - Empty-canvas click (`nodeId: null`) → `"deselect"` if something was
 *   focused, `"none"` otherwise (nothing to clear).
 * - Clicking the ALREADY-focused node → `"deselect"` (toggle off).
 * - Clicking any OTHER node id → `"select"` that node. This is the branch
 *   that must fire for an ego-revealed child — it never falls through to
 *   deselect just because a DIFFERENT node was focused a moment ago.
 */
export function resolveClickAction(
  commitClick: { nodeId: string | null } | null,
  focusedNodeId: string | null,
): ClickAction {
  if (!commitClick) return { type: "none" };
  if (commitClick.nodeId === null) {
    return focusedNodeId !== null ? { type: "deselect" } : { type: "none" };
  }
  if (commitClick.nodeId === focusedNodeId) return { type: "deselect" };
  return { type: "select", nodeId: commitClick.nodeId };
}
