import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * R4 momentum-glide interruptibility — while a pan flick's deceleration
 * (`projectFlickLanding`) is in flight, a new pointerdown or wheel must zero the
 * camera velocity immediately and "stop right here" (the iOS scroll catch). Only the
 * numeric token fields needed are stubbed, keeping this independent of the camera
 * maths.
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
    // The camera is mid-flick-deceleration — x/y carry residual velocity.
    cameraRef: ref({ x: { value: 120, velocity: -800 }, y: { value: -40, velocity: 300 }, scale: { value: 1, velocity: 0 } }),
    // The target is the landing point the flick projected (different from the current position).
    cameraTargetRef: ref({ tx: -60, ty: 25, tscale: 1 }),
    dampingRef: ref(0.82),
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

function fakePointerDown(): ReactPointerEvent<HTMLCanvasElement> {
  return {
    pointerId: 1,
    clientX: 400,
    clientY: 300,
    currentTarget: {
      setPointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    },
  } as unknown as ReactPointerEvent<HTMLCanvasElement>;
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

describe("createTopologyPointerHandlers — flick 관성 활강 중단", () => {
  it("포인터다운은 진행 중인 flick 속도를 0 으로 잡고 타깃을 현재 위치로 고정한다", () => {
    const refs = buildRefs();
    const { handlePointerDown } = createTopologyPointerHandlers(refs);

    handlePointerDown(fakePointerDown());

    // Velocity stops immediately (the catch).
    expect(refs.cameraRef.current.x.velocity).toBe(0);
    expect(refs.cameraRef.current.y.velocity).toBe(0);
    // The position holds, with the spring target pinned to the current position so it settles.
    expect(refs.cameraRef.current.x.value).toBe(120);
    expect(refs.cameraRef.current.y.value).toBe(-40);
    expect(refs.cameraTargetRef.current.tx).toBe(120);
    expect(refs.cameraTargetRef.current.ty).toBe(-40);
  });

  it("정지 상태(속도 0)의 포인터다운은 타깃을 건드리지 않는다(불필요한 상태 변경 회피)", () => {
    const refs = buildRefs({
      cameraRef: ref({ x: { value: 120, velocity: 0 }, y: { value: -40, velocity: 0 }, scale: { value: 1, velocity: 0 } }),
      cameraTargetRef: ref({ tx: -60, ty: 25, tscale: 1 }),
    });
    const { handlePointerDown } = createTopologyPointerHandlers(refs);

    handlePointerDown(fakePointerDown());

    // The target is untouched (the spring may still be travelling to -60,25 — do not interfere).
    expect(refs.cameraTargetRef.current.tx).toBe(-60);
    expect(refs.cameraTargetRef.current.ty).toBe(25);
  });

  it("휠 줌은 진행 중인 flick 의 x/y 잔여 속도를 흘리지 않는다", () => {
    const refs = buildRefs();
    const { handleWheel } = createTopologyPointerHandlers(refs);

    handleWheel(fakeWheelEvent());

    expect(refs.cameraRef.current.x.velocity).toBe(0);
    expect(refs.cameraRef.current.y.velocity).toBe(0);
  });
});
