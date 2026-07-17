import { describe, expect, it } from "vitest";

import {
  INITIAL_POINTER_MACHINE_STATE,
  transitionPointerState,
  type PointerMachineState,
} from "./pointer-state-machine";

const THRESHOLD_PX = 7; // --topology-v2-hysteresis-px

describe("transitionPointerState — click-safe contract", () => {
  it("pointerdown moves idle -> pressed and records the hit node, without committing anything", () => {
    const { next, commitClick } = transitionPointerState(
      INITIAL_POINTER_MACHINE_STATE,
      { type: "pointerdown", point: { x: 10, y: 10 }, hitNodeId: "node-a" },
      THRESHOLD_PX,
    );

    expect(next.phase).toBe("pressed");
    expect(next.pressedNodeId).toBe("node-a");
    expect(commitClick).toBeNull();
  });

  it("pointerup right after pointerdown (no movement) commits a click on the pressed node", () => {
    const pressed: PointerMachineState = {
      phase: "pressed",
      downPoint: { x: 10, y: 10 },
      pressedNodeId: "node-a",
    };

    const { next, commitClick } = transitionPointerState(
      pressed,
      { type: "pointerup" },
      THRESHOLD_PX,
    );

    expect(commitClick).toEqual({ nodeId: "node-a" });
    expect(next.phase).toBe("idle");
  });

  it("pointerup on empty canvas (no hit node) commits a click with nodeId: null", () => {
    const pressed: PointerMachineState = {
      phase: "pressed",
      downPoint: { x: 10, y: 10 },
      pressedNodeId: null,
    };

    const { commitClick } = transitionPointerState(pressed, { type: "pointerup" }, THRESHOLD_PX);

    expect(commitClick).toEqual({ nodeId: null });
  });

  it("pointermove past the hysteresis threshold transitions pressed -> dragging and clears pressedNodeId", () => {
    const pressed: PointerMachineState = {
      phase: "pressed",
      downPoint: { x: 10, y: 10 },
      pressedNodeId: "node-a",
    };

    const { next, commitClick } = transitionPointerState(
      pressed,
      { type: "pointermove", point: { x: 30, y: 10 } }, // distance 20 > 7px
      THRESHOLD_PX,
    );

    expect(next.phase).toBe("dragging");
    expect(next.pressedNodeId).toBeNull();
    expect(commitClick).toBeNull();
  });

  it("pointermove within the hysteresis threshold stays pressed and keeps pressedNodeId", () => {
    const pressed: PointerMachineState = {
      phase: "pressed",
      downPoint: { x: 10, y: 10 },
      pressedNodeId: "node-a",
    };

    const { next } = transitionPointerState(
      pressed,
      { type: "pointermove", point: { x: 13, y: 10 } }, // distance 3 < 7px
      THRESHOLD_PX,
    );

    expect(next.phase).toBe("pressed");
    expect(next.pressedNodeId).toBe("node-a");
  });

  it("pointerup while dragging ends the drag WITHOUT committing a click, even if released near the down-point", () => {
    const dragging: PointerMachineState = {
      phase: "dragging",
      downPoint: { x: 10, y: 10 },
      pressedNodeId: null,
    };

    const { next, commitClick } = transitionPointerState(
      dragging,
      { type: "pointerup" },
      THRESHOLD_PX,
    );

    expect(commitClick).toBeNull();
    expect(next.phase).toBe("idle");
  });

  it("pointercancel always returns to idle with no commit, from either pressed or dragging", () => {
    const pressed: PointerMachineState = {
      phase: "pressed",
      downPoint: { x: 10, y: 10 },
      pressedNodeId: "node-a",
    };
    const dragging: PointerMachineState = {
      phase: "dragging",
      downPoint: { x: 10, y: 10 },
      pressedNodeId: null,
    };

    const fromPressed = transitionPointerState(pressed, { type: "pointercancel" }, THRESHOLD_PX);
    const fromDragging = transitionPointerState(dragging, { type: "pointercancel" }, THRESHOLD_PX);

    expect(fromPressed.commitClick).toBeNull();
    expect(fromPressed.next.phase).toBe("idle");
    expect(fromDragging.commitClick).toBeNull();
    expect(fromDragging.next.phase).toBe("idle");
  });

  it("once dragging, further pointermove events never re-arm a pending click even if they return within threshold of downPoint", () => {
    const dragging: PointerMachineState = {
      phase: "dragging",
      downPoint: { x: 10, y: 10 },
      pressedNodeId: null,
    };

    // pointer wanders back to within 1px of the original down-point
    const { next } = transitionPointerState(
      dragging,
      { type: "pointermove", point: { x: 10.5, y: 10 } },
      THRESHOLD_PX,
    );

    expect(next.phase).toBe("dragging");
    expect(next.pressedNodeId).toBeNull();
  });
});
