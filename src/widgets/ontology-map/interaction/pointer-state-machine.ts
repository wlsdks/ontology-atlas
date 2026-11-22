/**
 * Pointer state machine, the click-safe contract (`docs/design/interaction.md` §1). `pointerdown` records `downPoint`
 * and hit-tests a `pressedNodeId` without committing anything. Once `exceedsHysteresisThreshold` trips during
 * `"pressed"` the phase becomes `"dragging"` and `pressedNodeId` clears, so a drag never commits a click even if the
 * pointer returns. `pointerup` while still `"pressed"` emits `commitClick`, the only place a click fires;
 * `pointercancel` always returns to `"idle"`. Hover is not part of this machine (`model/visibility/focus-state.ts`).
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
  /** Non-null exactly once, on a genuine click commit; `nodeId: null` is a click on empty canvas. */
  commitClick: { nodeId: string | null } | null;
}

export const INITIAL_POINTER_MACHINE_STATE: PointerMachineState = {
  phase: "idle",
  downPoint: null,
  pressedNodeId: null,
};

/** One event in, one `{next, commitClick}` out. The caller owns hit-testing (`hitNodeId` arrives with `pointerdown`) and feeds `commitClick` into `focus-state.ts`. */
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

export type ClickAction =
  | { type: "select"; nodeId: string }
  | { type: "deselect" }
  | { type: "none" };

/**
 * Routes a `commitClick` outcome into one `ClickAction`: no commit → `"none"`; empty canvas → `"deselect"` if something
 * was focused, else `"none"`; any node id, the already-focused one included → `"select"` (a repeated click is never an
 * undo: the first tap of a double-click keeps the selection and the second zooms, and a closed panel reopens). It must
 * fire for an ego-revealed child rather than fall through to deselect because a different node was focused a moment ago.
 */
export function resolveClickAction(
  commitClick: { nodeId: string | null } | null,
  focusedNodeId: string | null,
): ClickAction {
  if (!commitClick) return { type: "none" };
  if (commitClick.nodeId === null) {
    return focusedNodeId !== null ? { type: "deselect" } : { type: "none" };
  }
  return { type: "select", nodeId: commitClick.nodeId };
}
