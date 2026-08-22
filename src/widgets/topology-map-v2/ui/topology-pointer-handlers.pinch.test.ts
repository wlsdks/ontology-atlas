import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * rank4 touch pinch zoom (responsive audit, 2026-07-23) — verifies that the distance
 * ratio of two touch pointers drives the camera TARGET scale (the same
 * target-compound contract as the wheel), that midpoint movement falls out as a
 * two-finger pan, and that the instant a second finger lands the single-finger
 * gesture is cancelled without committing a click. Only the token fields the camera
 * maths needs are stubbed.
 */
vi.mock("./topology-read-tokens", () => ({
  readTopologyV2TokensOrNull: vi.fn(() => ({
    hysteresisPx: 7,
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
    worldRef: ref({ nodes: [], neighborMap: new Map(), nodeById: new Map() } as unknown as PointerHandlerRefs["worldRef"]["current"]),
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
    // rank4 — pinch is opt-in: it activates only when the hook-owned refs are passed.
    activeTouchesRef: ref(new Map<number, { x: number; y: number }>()),
    pinchRef: ref<{ dist: number; midX: number; midY: number } | null>(null),
    ...overrides,
  };
}

function touchEvent(pointerId: number, x: number, y: number): ReactPointerEvent<HTMLCanvasElement> {
  return {
    pointerId,
    pointerType: "touch",
    clientX: x,
    clientY: y,
    buttons: 1,
    currentTarget: {
      setPointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      // Always present on a real canvas — the cursor affordance assignment
      // (2026-07-28) moved outside the hover block, so this path is taken too.
      style: {} as CSSStyleDeclaration,
    },
  } as unknown as ReactPointerEvent<HTMLCanvasElement>;
}

function mouseEvent(x: number, y: number): ReactPointerEvent<HTMLCanvasElement> {
  return {
    pointerId: 99,
    pointerType: "mouse",
    clientX: x,
    clientY: y,
    buttons: 1,
    currentTarget: {
      setPointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      // Always present on a real canvas — the cursor affordance assignment
      // (2026-07-28) moved outside the hover block, so this path is taken too.
      style: {} as CSSStyleDeclaration,
    },
  } as unknown as ReactPointerEvent<HTMLCanvasElement>;
}

describe("createTopologyPointerHandlers — 터치 핀치줌 (rank4)", () => {
  it("두 손가락을 벌리면 target 스케일이 거리 비율로 커지고 중점이 앵커된다", () => {
    const refs = buildRefs();
    const h = createTopologyPointerHandlers(refs);

    h.handlePointerDown(touchEvent(1, 300, 300));
    h.handlePointerDown(touchEvent(2, 500, 300));
    // Entering the pinch: dist 200, mid (400, 300) = dead centre of the viewport.
    expect(refs.pinchRef!.current).not.toBeNull();

    // Move B 100px right — dist 300 (factor 1.5), mid (450, 300).
    h.handlePointerMove(touchEvent(2, 600, 300));

    expect(refs.cameraTargetRef.current.tscale).toBeCloseTo(1.5, 5);
    // worldAtPrevMid = (400-400)/1 + 0 = 0 → after tx = 0 - (450-400)/1.5.
    expect(refs.cameraTargetRef.current.tx).toBeCloseTo(-50 / 1.5, 3);
    expect(refs.cameraTargetRef.current.ty).toBeCloseTo(0, 5);
    // Switches to the same interactive spring as the wheel.
    expect(refs.cameraAngularFreqRef.current).toBe(10);
  });

  it("두 번째 손가락은 단일 손가락 프레스를 클릭 커밋 없이 취소한다", () => {
    const onSelect = vi.fn();
    const refs = buildRefs({ onSelect });
    const h = createTopologyPointerHandlers(refs);

    h.handlePointerDown(touchEvent(1, 300, 300));
    h.handlePointerDown(touchEvent(2, 500, 300));
    // The machine cancels to idle on entering a pinch — putting two fingers down is not a selection.
    expect(refs.pointerMachineRef.current.phase).toBe("idle");

    h.handlePointerUp(touchEvent(2, 500, 300));
    h.handlePointerUp(touchEvent(1, 300, 300));
    expect(onSelect).not.toHaveBeenCalled();
    expect(refs.pinchRef!.current).toBeNull();
    expect(refs.activeTouchesRef!.current.size).toBe(0);
  });

  it("손가락을 모으면 effective 최소 스케일에서 클램프된다", () => {
    const refs = buildRefs();
    const h = createTopologyPointerHandlers(refs);

    h.handlePointerDown(touchEvent(1, 200, 300));
    h.handlePointerDown(touchEvent(2, 600, 300)); // dist 400
    h.handlePointerMove(touchEvent(2, 210, 300)); // dist 10 → factor 0.025

    // effectiveScaleMin = max(cameraScaleMin 0.24, overviewEntry(0.95) * minRatio(0.5)) = 0.475.
    expect(refs.cameraTargetRef.current.tscale).toBeCloseTo(0.475, 5);
  });

  it("한 손가락이 떨어지면 핀치가 끝나고, 남은 손가락의 up 은 클릭 로직을 타지 않는다", () => {
    const refs = buildRefs();
    const h = createTopologyPointerHandlers(refs);

    h.handlePointerDown(touchEvent(1, 300, 300));
    h.handlePointerDown(touchEvent(2, 500, 300));
    h.handlePointerUp(touchEvent(1, 300, 300));
    expect(refs.pinchRef!.current).toBeNull();
    expect(refs.activeTouchesRef!.current.size).toBe(1);

    // Movement after the pinch ends does not touch the camera (machine idle plus pinch null).
    const before = { ...refs.cameraTargetRef.current };
    h.handlePointerMove(touchEvent(2, 550, 300));
    expect(refs.cameraTargetRef.current).toEqual(before);
  });

  it("마우스 포인터는 터치 부기에 잡히지 않는다", () => {
    const refs = buildRefs();
    const h = createTopologyPointerHandlers(refs);

    h.handlePointerDown(mouseEvent(400, 300));
    expect(refs.activeTouchesRef!.current.size).toBe(0);
    expect(refs.pinchRef!.current).toBeNull();
  });
});
