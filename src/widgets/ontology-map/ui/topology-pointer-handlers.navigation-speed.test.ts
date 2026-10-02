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
import { listenForGesturePinch } from "../interaction/gesture-pinch";
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

  it("at 2x a grabbed node still moves exactly with the pointer and the map stays put", () => {
    const refs = buildRefs({ drag: 2, zoom: 1 });
    const node = { id: "c", kind: "capability", x: 120, y: 0 };
    refs.worldRef.current = {
      nodes: [node],
      nodeById: new Map([[node.id, node]]),
      neighborMap: new Map(),
      bounds: WIDE,
      spineBounds: WIDE,
    } as unknown as PointerHandlerRefs["worldRef"]["current"];
    refs.cameraRef.current = { x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 2, velocity: 0 } };
    refs.pointerMachineRef.current = { phase: "pressed", downPoint: { x: 840, y: 400 }, pressedNodeId: "c" };
    const sim = { hasNode: () => true, pin: vi.fn(), movePin: vi.fn(), clearPin: vi.fn() };
    refs.simRef.current = sim as unknown as PointerHandlerRefs["simRef"]["current"];
    const { handlePointerMove } = createTopologyPointerHandlers(refs);
    handlePointerMove(pointer(860, 410));
    handlePointerMove(pointer(900, 430));
    const [[grabX, grabY], [pinX, pinY]] = sim.movePin.mock.calls as [number, number][];
    expect([grabX, grabY]).toEqual([120, 0]);
    expect((pinX - grabX) * 2).toBeCloseTo(40, 9);
    expect((pinY - grabY) * 2).toBeCloseTo(20, 9);
    expect(refs.cameraRef.current.x.value).toBe(0);
    expect(refs.cameraRef.current.y.value).toBe(0);
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
    for (let step = 0; step < 10; step += 1) handleWheel(wheel((-100 * Math.log(2)) / 10, true));
    const camera = refs.cameraRef.current;
    expect(camera.scale.value).toBeCloseTo(2, 9);
    expect(refs.zoomEaseRef.current).toBeNull();
    expect((before.x - camera.x.value) * camera.scale.value + 600).toBeCloseTo(900, 9);
    expect((before.y - camera.y.value) * camera.scale.value + 400).toBeCloseTo(200, 9);
  });

  it("a fast pinch that coalesces into a 60 px event still zooms exactly as far as the fingers", () => {
    const refs = buildRefs({ drag: 1, zoom: 1 });
    const { handleWheel } = createTopologyPointerHandlers(refs);
    for (const deltaY of [-10, -60, -10]) handleWheel(wheel(deltaY, true));
    expect(refs.cameraRef.current.scale.value).toBeCloseTo(Math.exp(0.8), 9);
    expect(refs.zoomEaseRef.current).toBeNull();
  });

  it("Ctrl + a mouse notch eases one plain notch, and its stream stays notches", () => {
    const refs = buildRefs({ drag: 1, zoom: 1 });
    const { handleWheel } = createTopologyPointerHandlers(refs);
    handleWheel(wheel(-100, true));
    expect(refs.cameraTargetRef.current.tscale).toBeCloseTo(Math.exp(100 * 0.0023), 9);
    handleWheel(wheel(-10, true));
    expect(refs.cameraTargetRef.current.tscale).toBeCloseTo(Math.exp(110 * 0.0023), 9);
    expect(refs.cameraRef.current.scale.value).toBe(1);
    expect(refs.zoomEaseRef.current?.target).toBe(refs.cameraTargetRef.current);
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

function gesture(type: string, scale: number, clientX = 900, clientY = 200): Event {
  return Object.assign(new Event(type, { cancelable: true }), { scale, clientX, clientY });
}

function pinchWithGestures(refs: ReturnType<typeof buildRefs>, events: Event[]): HTMLCanvasElement {
  const element = document.createElement("canvas");
  refs.canvasRef = ref<HTMLCanvasElement | null>(element);
  const { handleGesturePinch } = createTopologyPointerHandlers(refs);
  const stop = listenForGesturePinch(element, handleGesturePinch);
  for (const event of events) element.dispatchEvent(event);
  stop();
  return element;
}

describe("WebKit gesture pinch", () => {
  it("a gesture to scale 2 doubles the scale, keeps the point under the fingers still and stops the page zoom", () => {
    const refs = buildRefs({ drag: 1, zoom: 1 });
    const events = [gesture("gesturestart", 1), gesture("gesturechange", 1.25), gesture("gesturechange", 2), gesture("gestureend", 2)];
    const anchor = { x: (900 - 600) / 1, y: (200 - 400) / 1 };
    pinchWithGestures(refs, events);
    const camera = refs.cameraRef.current;
    expect(camera.scale.value).toBeCloseTo(2, 9);
    expect(refs.cameraTargetRef.current.tscale).toBeCloseTo(2, 9);
    expect((anchor.x - camera.x.value) * camera.scale.value + 600).toBeCloseTo(900, 9);
    expect((anchor.y - camera.y.value) * camera.scale.value + 400).toBeCloseTo(200, 9);
    expect(events.map((event) => event.defaultPrevented)).toEqual([true, true, true, true]);
  });

  it("raises the pinch to the zoom speed", () => {
    const refs = buildRefs({ drag: 1, zoom: 2 });
    pinchWithGestures(refs, [gesture("gesturestart", 1), gesture("gesturechange", 1.5)]);
    expect(refs.cameraRef.current.scale.value).toBeCloseTo(2.25, 9);
  });

  it("anchors a gesture without a point at the last pointer position", () => {
    const refs = buildRefs({ drag: 1, zoom: 1 });
    const move = Object.assign(new Event("pointermove"), { clientX: 300, clientY: 500 });
    pinchWithGestures(refs, [move, gesture("gesturestart", 1, 0, 0), gesture("gesturechange", 2, 0, 0)]);
    const camera = refs.cameraRef.current;
    expect((300 - 600 - camera.x.value) * camera.scale.value + 600).toBeCloseTo(300, 9);
    expect((500 - 400 - camera.y.value) * camera.scale.value + 400).toBeCloseTo(500, 9);
  });

  it("leaves a two-finger touch pinch in charge of the camera", () => {
    const refs = buildRefs({ drag: 1, zoom: 1 });
    refs.activeTouchesRef = ref(
      new Map([
        [1, { x: 100, y: 100 }],
        [2, { x: 200, y: 200 }],
      ]),
    );
    pinchWithGestures(refs, [gesture("gesturestart", 1), gesture("gesturechange", 2)]);
    expect(refs.cameraRef.current.scale.value).toBe(1);
  });
});
