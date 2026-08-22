import { describe, expect, it, vi } from "vitest";

// Edge hover cards lingering (panel2/3) — the moment a wheel or camera motion starts,
// the card must disappear. `handleWheel` reads tokens to compute the zoom, so only the
// numeric fields it needs are stubbed instead of a real token fixture, keeping this
// test independent of the camera maths.
vi.mock("./topology-read-tokens", () => ({
  readTopologyV2TokensOrNull: vi.fn(() => ({
    overviewEntryRatio: 0.95,
    cameraMaxZoomRatio: 2,
    cameraScaleMax: 2.6,
    cameraMinZoomRatio: 0.5,
    cameraScaleMin: 0.24,
    cameraDampingDefault: 1,
    cameraSpringAngFreqInteractive: 10,
  })),
}));

import { createTopologyPointerHandlers, type PointerHandlerRefs } from "./topology-pointer-handlers";

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
    pointerMachineRef: ref({ phase: "idle" } as unknown as PointerHandlerRefs["pointerMachineRef"]["current"]),
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
    ...overrides,
  };
}

function fakeWheelEvent(): WheelEvent {
  return {
    preventDefault: vi.fn(),
    clientX: 400,
    clientY: 300,
    deltaY: -120,
    deltaMode: 0,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as WheelEvent;
}

describe("createTopologyPointerHandlers — handleWheel dismisses transient hover cards", () => {
  it("휠 줌 첫 틱에 엣지 호버 카드를 즉시 dismiss 한다 (3티어 관통 잔류 차단)", () => {
    const hoveredEdgeRef = ref<{
      sourceId: string;
      targetId: string;
      relationType: string;
      declaredBySlug: string | null;
    } | null>({ sourceId: "a", targetId: "b", relationType: "contains", declaredBySlug: null });
    const onHoverEdge = vi.fn();

    const { handleWheel } = createTopologyPointerHandlers(
      buildRefs({ hoveredEdgeRef, onHoverEdge }),
    );

    handleWheel(fakeWheelEvent());

    expect(hoveredEdgeRef.current).toBeNull();
    expect(onHoverEdge).toHaveBeenCalledWith(null, null);
  });

  it("휠 줌 시 클러스터 호버 툴팁도 함께 dismiss 한다", () => {
    const hoveredClusterIdRef = ref<string | null>("domain:x");
    const onHoverCluster = vi.fn();

    const { handleWheel } = createTopologyPointerHandlers(
      buildRefs({ hoveredClusterIdRef, onHoverCluster }),
    );

    handleWheel(fakeWheelEvent());

    expect(hoveredClusterIdRef.current).toBeNull();
    expect(onHoverCluster).toHaveBeenCalledWith(null);
  });

  it("떠 있는 카드가 없으면 dismiss 콜백을 부르지 않는다 (불필요한 재렌더 방지)", () => {
    const hoveredEdgeRef = ref<{
      sourceId: string;
      targetId: string;
      relationType: string;
      declaredBySlug: string | null;
    } | null>(null);
    const onHoverEdge = vi.fn();

    const { handleWheel } = createTopologyPointerHandlers(
      buildRefs({ hoveredEdgeRef, onHoverEdge }),
    );

    handleWheel(fakeWheelEvent());

    expect(onHoverEdge).not.toHaveBeenCalled();
  });
});
