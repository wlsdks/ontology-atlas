import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./topology-read-tokens", () => ({
  readOntologyMapTokensOrNull: vi.fn(() => ({ hysteresisPx: 4 }) as unknown),
}));

import { buildDomeModel, createDomeRuntime, type DomeInputNode } from "../model/dome-view";
import { createTopologyPointerHandlers, type PointerHandlerRefs } from "./topology-pointer-handlers";

function ref<T>(current: T): { current: T } {
  return { current };
}

const nodes: DomeInputNode[] = [
  { id: "p", kind: "project", x: 0, y: 0, parentId: null },
  { id: "d", kind: "domain", x: 60, y: 0, parentId: "p" },
  { id: "c", kind: "capability", x: 120, y: 0, parentId: "d" },
];

function pressOnNode(settling: boolean) {
  const dome = createDomeRuntime(buildDomeModel(nodes));
  dome.active = true;
  dome.settling = settling;
  const sim = { hasNode: () => true, pin: vi.fn(), movePin: vi.fn(), clearPin: vi.fn() };
  const refs: PointerHandlerRefs = {
    worldRef: ref({
      nodes,
      nodeById: new Map(nodes.map((node) => [node.id, node])),
      neighborMap: new Map(),
    } as unknown as PointerHandlerRefs["worldRef"]["current"]),
    cameraRef: ref({ x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } }),
    cameraTargetRef: ref({ tx: 0, ty: 0, tscale: 1 }),
    dampingRef: ref(1),
    cameraAngularFreqRef: ref(null),
    viewportRef: ref({ width: 800, height: 600, dpr: 1 }),
    pointerMachineRef: ref({ phase: "pressed", downPoint: { x: 100, y: 100 }, pressedNodeId: "c" }),
    dragHistoryRef: ref([{ x: 100, y: 100, t: 0 }]),
    camStartAtDownRef: ref({ x: 0, y: 0 }),
    canvasRectRef: ref({ left: 0, top: 0 }),
    focusedSlugRef: ref(null),
    hoveredNodeIdRef: ref(null),
    rippleStartRef: ref(new Map()),
    reducedMotionRef: ref(false),
    simRef: ref(sim as unknown as PointerHandlerRefs["simRef"]["current"]),
    heatRef: ref(0),
    nodeDragRef: ref(null),
    dragAffectedSetRef: ref(null),
    dragStartPosRef: ref(null),
    overviewScaleRef: ref(1),
    domeRuntimeRef: ref(dome),
    domeGripRef: ref(true),
  };
  createTopologyPointerHandlers(refs).handlePointerMove({
    clientX: 140,
    clientY: 100,
    buttons: 1,
    pointerType: "mouse",
    pointerId: 1,
    currentTarget: { style: { cursor: "" } },
  } as unknown as ReactPointerEvent<HTMLCanvasElement>);
  return { dome, refs, sim };
}

describe("a drag begun on a node of the 3D map", () => {
  it("turns the dome while the layout settles, and moves the node once it is final", () => {
    const settling = pressOnNode(true);
    expect(settling.dome.drag).toBeNull();
    expect(settling.refs.nodeDragRef.current).toBeNull();
    expect(settling.sim.pin).not.toHaveBeenCalled();
    expect(settling.dome.orbiting).toBe(true);

    const final = pressOnNode(false);
    expect(final.dome.drag?.nodeId).toBe("c");
    expect(final.refs.nodeDragRef.current?.nodeId).toBe("c");
    expect(final.dome.orbiting).toBe(false);
  });
});
