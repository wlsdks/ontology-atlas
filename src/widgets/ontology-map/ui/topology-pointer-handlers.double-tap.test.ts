import { describe, expect, it, vi } from "vitest";
import type { PointerEvent as ReactPointerEvent } from "react";

vi.mock("./topology-read-tokens", () => ({
  readOntologyMapTokensOrNull: vi.fn(() => ({ hysteresisPx: 4 }) as unknown),
}));

import { createTopologyPointerHandlers, DOUBLE_TAP_WINDOW_MS, type PointerHandlerRefs } from "./topology-pointer-handlers";

function ref<T>(current: T): { current: T } {
  return { current };
}

function buildRefs(overrides: Partial<PointerHandlerRefs> = {}): PointerHandlerRefs {
  return {
    worldRef: ref({ nodes: [], neighborMap: new Map() } as unknown as PointerHandlerRefs["worldRef"]["current"]),
    cameraRef: ref({ x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } }),
    cameraTargetRef: ref({ tx: 0, ty: 0, tscale: 1 }),
    dampingRef: ref(1),
    cameraAngularFreqRef: ref(null),
    viewportRef: ref({ width: 800, height: 600, dpr: 1 }),
    pointerMachineRef: ref({ phase: "idle", downPoint: null, pressedNodeId: null }),
    dragHistoryRef: ref([]),
    camStartAtDownRef: ref({ x: 0, y: 0 }),
    canvasRectRef: ref({ left: 0, top: 0 }),
    focusedSlugRef: ref(null),
    hoveredNodeIdRef: ref(null),
    rippleStartRef: ref(new Map()),
    reducedMotionRef: ref(false),
    simRef: ref(null),
    heatRef: ref(0),
    nodeDragRef: ref(null),
    dragAffectedSetRef: ref(null),
    dragStartPosRef: ref(null),
    overviewScaleRef: ref(1),
    lastTapRef: ref(null),
    ...overrides,
  };
}

/** One tap = the machine already holds the press on `nodeId`; pointerup commits it. */
function tap(refs: PointerHandlerRefs, handlers: ReturnType<typeof createTopologyPointerHandlers>, nodeId: string, at: number) {
  vi.spyOn(performance, "now").mockReturnValue(at);
  refs.pointerMachineRef.current = { phase: "pressed", downPoint: { x: 100, y: 100 }, pressedNodeId: nodeId };
  handlers.handlePointerUp({ pointerType: "mouse", pointerId: 1 } as unknown as ReactPointerEvent<HTMLCanvasElement>);
}

describe("createTopologyPointerHandlers — a double-click opens the node's children", () => {
  it("the second tap within the window toggles the cluster instead of deselecting", () => {
    const onSelect = vi.fn();
    const onToggleCluster = vi.fn();
    const refs = buildRefs({
      onSelect,
      onToggleCluster,
      clusterChipsRef: ref([{ parentId: "domain:order", count: 5, expanded: false, anchor: { x: 0, y: 0 } }]),
    });
    const handlers = createTopologyPointerHandlers(refs);

    tap(refs, handlers, "domain:order", 1_000);
    expect(onSelect).toHaveBeenCalledWith("domain:order");
    // The first tap's selection has landed by the time the second tap arrives.
    refs.focusedSlugRef.current = "domain:order";

    tap(refs, handlers, "domain:order", 1_000 + DOUBLE_TAP_WINDOW_MS - 1);
    expect(onToggleCluster).toHaveBeenCalledWith("domain:order");
    // Exactly one select, never a deselect: the second tap kept the selection.
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("a second quick tap on a leaf keeps the selection rather than undoing it", () => {
    const onSelect = vi.fn();
    const onToggleCluster = vi.fn();
    const refs = buildRefs({ onSelect, onToggleCluster, clusterChipsRef: ref([]) });
    const handlers = createTopologyPointerHandlers(refs);

    tap(refs, handlers, "capability:pay", 2_000);
    refs.focusedSlugRef.current = "capability:pay";
    tap(refs, handlers, "capability:pay", 2_100);

    expect(onToggleCluster).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("a slow second tap is an ordinary click: it deselects, as before", () => {
    const onSelect = vi.fn();
    const onPaneClick = vi.fn();
    const onToggleCluster = vi.fn();
    const refs = buildRefs({
      onSelect,
      onPaneClick,
      onToggleCluster,
      clusterChipsRef: ref([{ parentId: "domain:order", count: 5, expanded: false, anchor: { x: 0, y: 0 } }]),
    });
    const handlers = createTopologyPointerHandlers(refs);

    tap(refs, handlers, "domain:order", 3_000);
    refs.focusedSlugRef.current = "domain:order";
    tap(refs, handlers, "domain:order", 3_000 + DOUBLE_TAP_WINDOW_MS + 1);

    expect(onToggleCluster).not.toHaveBeenCalled();
    // One select, then the 2D toggle's deselect (a pane click), exactly as before.
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onPaneClick).toHaveBeenCalledTimes(1);
  });

  it("a double-click on an already selected node opens it and keeps it selected", () => {
    const onSelect = vi.fn();
    const onPaneClick = vi.fn();
    const onToggleCluster = vi.fn();
    const refs = buildRefs({
      onSelect,
      onPaneClick,
      onToggleCluster,
      focusedSlugRef: ref("domain:order"),
      clusterChipsRef: ref([{ parentId: "domain:order", count: 5, expanded: false, anchor: { x: 0, y: 0 } }]),
    });
    const handlers = createTopologyPointerHandlers(refs);

    tap(refs, handlers, "domain:order", 4_000);
    // The first tap of the pair deselected (the 2D rule for a focused node) …
    expect(onPaneClick).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    refs.focusedSlugRef.current = null;
    tap(refs, handlers, "domain:order", 4_120);
    // … and the second tap restores the selection while opening the children.
    expect(onToggleCluster).toHaveBeenCalledWith("domain:order");
    expect(onSelect).toHaveBeenLastCalledWith("domain:order");
  });
});
