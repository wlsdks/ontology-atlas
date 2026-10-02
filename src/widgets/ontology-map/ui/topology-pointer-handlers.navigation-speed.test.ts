import type { PointerEvent as ReactPointerEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./topology-read-tokens", () => ({
  readOntologyMapTokensOrNull: vi.fn(() => ({
    hysteresisPx: 7,
    overviewEntryRatio: 1,
    cameraMaxZoomRatio: 8,
    cameraScaleMax: 8,
    cameraMinZoomRatio: 0.1,
    cameraScaleMin: 0.1,
    cameraDampingDefault: 1,
    cameraSpringAngFreqInteractive: 15,
    cameraReleaseVelocityWindowMs: 80,
    cameraFlickMinSpeed: 0.05,
    cameraPanLeash: 0,
    nodeReleaseSettleMs: 900,
  })),
}));

import type { MapNavigationSpeed, MapSpeed } from "@/shared/lib/appearance-preferences";
import { INITIAL_POINTER_MACHINE_STATE } from "../interaction/pointer-state-machine";
import { MOMENTUM_TAU_MS } from "../model/motion-physics";
import type { ZoomEase } from "../model/camera-easing";
import { createTopologyPointerHandlers, type PointerHandlerRefs } from "./topology-pointer-handlers";

function ref<T>(current: T): { current: T } {
  return { current };
}

const WIDE = { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 };

function buildRefs(speed: MapNavigationSpeed): PointerHandlerRefs & { zoomEaseRef: { current: ZoomEase | null } } {
  return {
    navigationSpeedRef: ref(speed),
    zoomEaseRef: ref<ZoomEase | null>(null),
    worldRef: ref({
      nodes: [],
      neighborMap: new Map(),
      nodeById: new Map(),
      bounds: WIDE,
      spineBounds: WIDE,
    } as unknown as PointerHandlerRefs["worldRef"]["current"]),
    cameraRef: ref({ x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } }),
    cameraTargetRef: ref({ tx: 0, ty: 0, tscale: 1 }),
    dampingRef: ref(1),
    cameraAngularFreqRef: ref(null),
    viewportRef: ref({ width: 1200, height: 800, dpr: 1 }),
    pointerMachineRef: ref(INITIAL_POINTER_MACHINE_STATE),
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
  };
}

const canvas = {
  style: { cursor: "" },
  setPointerCapture: vi.fn(),
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
};

function pointer(x: number, y: number): ReactPointerEvent<HTMLCanvasElement> {
  return { pointerId: 1, button: 0, buttons: 1, clientX: x, clientY: y, currentTarget: canvas } as unknown as ReactPointerEvent<HTMLCanvasElement>;
}

function wheel(deltaY: number, ctrlKey: boolean): WheelEvent {
  return {
    preventDefault: vi.fn(),
    clientX: 900,
    clientY: 200,
    deltaY,
    deltaMode: 0,
    ctrlKey,
    timeStamp: performance.now() - 4,
    currentTarget: canvas,
  } as unknown as WheelEvent;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("map drag speed", () => {
  it.each([0.5, 0.75, 1, 1.5, 2] as const)("a 120 px background drag moves the map 120 × %s px", (speed: MapSpeed) => {
    const refs = buildRefs({ drag: speed, zoom: 1 });
    refs.cameraRef.current = { x: { value: 50, velocity: 0 }, y: { value: 20, velocity: 0 }, scale: { value: 2, velocity: 0 } };
    const { handlePointerDown, handlePointerMove } = createTopologyPointerHandlers(refs);
    handlePointerDown(pointer(300, 300));
    handlePointerMove(pointer(330, 310));
    handlePointerMove(pointer(420, 340));
    const camera = refs.cameraRef.current;
    expect((50 - camera.x.value) * 2).toBeCloseTo(120 * speed, 9);
    expect((20 - camera.y.value) * 2).toBeCloseTo(40 * speed, 9);
  });

  it("a flick keeps the map's own speed at release and glides one momentum time constant further", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const refs = buildRefs({ drag: 2, zoom: 1 });
    const { handlePointerDown, handlePointerMove, handlePointerUp } = createTopologyPointerHandlers(refs);
    handlePointerDown(pointer(300, 300));
    for (const x of [330, 360, 390, 420]) {
      now += 10;
      handlePointerMove(pointer(x, 300));
    }
    const atRelease = refs.cameraRef.current.x.value;
    handlePointerUp(pointer(420, 300));
    const releaseSpeed = 3;
    expect(refs.cameraRef.current.x.velocity).toBeCloseTo(-releaseSpeed * 2 * 1000, 6);
    expect(refs.cameraTargetRef.current.tx).toBeCloseTo(atRelease - releaseSpeed * 2 * MOMENTUM_TAU_MS, 6);
    expect(refs.dampingRef.current).toBe(1);
    expect(refs.cameraAngularFreqRef.current).toBeCloseTo(1000 / MOMENTUM_TAU_MS, 9);
  });

  it("a reduced-motion release holds the map where the hand left it", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const refs = buildRefs({ drag: 1, zoom: 1 });
    refs.reducedMotionRef.current = true;
    const { handlePointerDown, handlePointerMove, handlePointerUp } = createTopologyPointerHandlers(refs);
    handlePointerDown(pointer(300, 300));
    for (const x of [330, 360, 390, 420]) {
      now += 10;
      handlePointerMove(pointer(x, 300));
    }
    handlePointerUp(pointer(420, 300));
    expect(refs.cameraRef.current.x.velocity).toBe(0);
    expect(refs.cameraTargetRef.current.tx).toBe(refs.cameraRef.current.x.value);
  });
});

describe("map zoom speed", () => {
  it.each([0.5, 1, 2] as const)("a wheel notch at %sx aims at the notch factor to that power and eases from where the map is", (speed) => {
    const refs = buildRefs({ drag: 1, zoom: speed });
    const { handleWheel } = createTopologyPointerHandlers(refs);
    const notch = wheel(-100, false);
    handleWheel(notch);
    expect(refs.cameraTargetRef.current.tscale).toBeCloseTo(Math.exp(100 * 0.0023 * speed), 9);
    expect(refs.cameraRef.current.scale.value).toBe(1);
    expect(refs.zoomEaseRef.current?.target).toBe(refs.cameraTargetRef.current);
    expect(refs.zoomEaseRef.current?.startMs).toBe(notch.timeStamp);
  });

  it("a trackpad pinch lands at once and keeps the point under the fingers still", () => {
    const refs = buildRefs({ drag: 1, zoom: 1 });
    const { handleWheel } = createTopologyPointerHandlers(refs);
    const before = { x: (900 - 600) / 1 + 0, y: (200 - 400) / 1 + 0 };
    handleWheel(wheel(-100 * Math.log(2), true));
    const camera = refs.cameraRef.current;
    expect(camera.scale.value).toBeCloseTo(2, 9);
    expect(refs.zoomEaseRef.current).toBeNull();
    expect((before.x - camera.x.value) * camera.scale.value + 600).toBeCloseTo(900, 9);
    expect((before.y - camera.y.value) * camera.scale.value + 400).toBeCloseTo(200, 9);
  });

  it("pressing the map during a zoom step stops it where it is drawn", () => {
    const refs = buildRefs({ drag: 1, zoom: 1 });
    const { handleWheel, handlePointerDown } = createTopologyPointerHandlers(refs);
    handleWheel(wheel(-100, false));
    refs.cameraRef.current = { x: { value: 12, velocity: 0 }, y: { value: -6, velocity: 0 }, scale: { value: 1.1, velocity: 0 } };
    handlePointerDown(pointer(500, 500));
    expect(refs.zoomEaseRef.current).toBeNull();
    expect(refs.cameraTargetRef.current).toEqual({ tx: 12, ty: -6, tscale: 1.1 });
  });
});
