import { describe, expect, it, vi } from "vitest";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { DialCluster, DialFrameResult, DialScene } from "../../dial/types";
import { branchMemberCount } from "../../dial/branches/member-disclosure";
import type { PointerHandlerRefs } from "./topology-pointer-types";

const frame = vi.hoisted(() => ({ current: null as DialFrameResult | null }));
vi.mock("../../dial/frame/frame", () => ({ lastDialFrame: () => frame.current }));
vi.mock("../../tokens/topology-read-tokens", () => ({ readOntologyMapTokensOrNull: () => ({ hysteresisPx: 4, overviewEntryRatio: 1 }) }));
import { createTopologyPointerHandlers } from "./topology-pointer-handlers";

const ref = <T,>(current: T) => ({ current });
function setup() {
  const cluster = { domainId: "d", items: Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, direct: false })) } as DialCluster;
  const scene = { branches: true, branchPreviewRows: 2, clusters: [cluster], clusterByDomain: new Map([["d", cluster]]) } as unknown as DialScene;
  const row = { id: "d", box: { minX: 80, minY: 80, maxX: 120, maxY: 120 }, action: { type: "branch-members" as const, domainId: "d", direction: "more" as const } };
  frame.current = { branchScene: scene, rows: [row], picks: [{ id: "d", x: 100, y: 100, r: 12 }] } as DialFrameResult;
  const events: string[] = [];
  const onSelect = vi.fn(() => events.push("select"));
  const onFlyToNode = vi.fn(() => events.push(`fly:${branchMemberCount(scene, "d")}`));
  const onPaneClick = vi.fn();
  const onToggleCluster = vi.fn();
  const canvas = document.createElement("canvas");
  const refs: PointerHandlerRefs = {
    worldRef: ref({ nodes: [], nodeById: new Map(), neighborMap: new Map() } as unknown as NonNullable<PointerHandlerRefs["worldRef"]["current"]>),
    cameraRef: ref({ x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } }),
    cameraTargetRef: ref({ tx: 0, ty: 0, tscale: 1 }), dampingRef: ref(1), cameraAngularFreqRef: ref(null),
    viewportRef: ref({ width: 800, height: 600, dpr: 1 }),
    pointerMachineRef: ref({ phase: "idle", downPoint: null, pressedNodeId: null }), dragHistoryRef: ref([]),
    camStartAtDownRef: ref({ x: 0, y: 0 }), canvasRectRef: ref({ left: 0, top: 0 }),
    focusedSlugRef: ref("c0"), hoveredNodeIdRef: ref(null), rippleStartRef: ref(new Map()), reducedMotionRef: ref(false),
    simRef: ref(null), heatRef: ref(0), nodeDragRef: ref(null), dragAffectedSetRef: ref(null), dragStartPosRef: ref(null),
    overviewScaleRef: ref(1), lastTapRef: ref(null), canvasRef: ref(canvas),
    onSelect, onFlyToNode, onPaneClick, onToggleCluster,
  };
  const event = (x = 100, y = 100, buttons = 1) => ({ currentTarget: canvas, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0, buttons }) as unknown as ReactPointerEvent<HTMLCanvasElement>;
  return { refs, scene, canvas, events, onSelect, onFlyToNode, onPaneClick, onToggleCluster, event, handlers: createTopologyPointerHandlers(refs) };
}

describe("branch member controls", () => {
  it("reveals members before selecting and framing the domain, without initiating a parent drag", () => {
    const test = setup();
    test.handlers.handlePointerDown(test.event());
    expect(test.refs.pointerMachineRef.current.pressedNodeId).toBeNull();
    expect(test.refs.nodeDragRef.current).toBeNull();
    test.handlers.handlePointerUp(test.event());
    expect(branchMemberCount(test.scene, "d")).toBe(4);
    expect(test.onSelect).toHaveBeenCalledWith("d", "canvas-dblclick");
    expect(test.onFlyToNode).toHaveBeenCalledWith("d");
    expect(test.events).toEqual(["select", "fly:4"]);
    expect(test.onPaneClick).not.toHaveBeenCalled();
    expect(test.onToggleCluster).not.toHaveBeenCalled();
    frame.current!.rows[0]!.action = { type: "branch-members", domainId: "d", direction: "less" };
    test.handlers.handlePointerDown(test.event());
    test.handlers.handlePointerUp(test.event());
    expect(branchMemberCount(test.scene, "d")).toBe(2);
    expect(test.events).toEqual(["select", "fly:4", "select", "fly:2"]);
  });

  it("expands the visible control instead of selecting an overlapping neighboring domain card", () => {
    const test = setup();
    frame.current!.rows.push({ id: "marketing", box: { minX: 60, minY: 60, maxX: 140, maxY: 140 } });
    frame.current!.picks.push({ id: "marketing", x: 100, y: 100, r: 20 });
    test.handlers.handlePointerMove(test.event(100, 100, 0));
    expect(test.canvas.style.cursor).toBe("pointer");
    test.handlers.handlePointerDown(test.event());
    expect(test.refs.pointerMachineRef.current.pressedNodeId).toBeNull();
    expect(test.refs.nodeDragRef.current).toBeNull();
    test.handlers.handlePointerUp(test.event());
    expect(branchMemberCount(test.scene, "d")).toBe(4);
    expect(test.onSelect).toHaveBeenCalledExactlyOnceWith("d", "canvas-dblclick");
    expect(test.events).toEqual(["select", "fly:4"]);
  });

  it("shows a button cursor and cancels a dragged control without moving the camera", () => {
    const test = setup();
    test.handlers.handlePointerMove(test.event(100, 100, 0));
    expect(test.canvas.style.cursor).toBe("pointer");
    test.handlers.handlePointerDown(test.event());
    test.handlers.handlePointerMove(test.event(140, 100));
    expect(test.refs.pointerMachineRef.current.phase).toBe("idle");
    test.handlers.handlePointerUp(test.event(140, 100));
    expect(branchMemberCount(test.scene, "d")).toBe(2);
    expect(test.refs.cameraTargetRef.current).toEqual({ tx: 0, ty: 0, tscale: 1 });
    expect(test.refs.nodeDragRef.current).toBeNull();
    expect(test.onFlyToNode).not.toHaveBeenCalled();
    expect(test.onSelect).not.toHaveBeenCalled();
  });
});
