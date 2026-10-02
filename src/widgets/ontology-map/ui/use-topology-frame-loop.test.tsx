import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pipeline = vi.hoisted(() => {
  const order: string[] = [];
  const run = (name: string, result?: unknown) => vi.fn((..._args: unknown[]) => {
    order.push(name);
    return result;
  });
  const gate = run("gate");
  const dome = run("dome", true);
  const motion = run("motion");
  const camera = run("camera", { camera: {}, farT: 0, zoomRatio: 1, focusedNodeId: null });
  const clusters = run("clusters", { effectiveExpanded: new Set(), batchAppearVisible: new Set() });
  const realm = run("realm", { frameClusteredIds: new Set(), frameChips: [] });
  const reveal = run("reveal");
  const presentation = run("presentation");
  const lightPrepare = run("light-prepare");
  const lightRender = run("light-render");
  const lightDispose = vi.fn();
  return { order, gate, dome, motion, camera, clusters, realm, reveal, presentation, lightPrepare, lightRender, lightDispose };
});

const still = vi.hoisted(() => {
  const state = { built: false, building: false, comets: [] as { kind: "depends"; t: number; sourceId: string; targetId: string }[], drawn: [] as { kind: "depends"; t: number; sourceId: string; targetId: string }[] };
  const frame = {
    get building() {
      return state.building;
    },
    get comets() {
      return state.comets;
    },
    ready: vi.fn(() => state.built),
    begin: vi.fn(() => {
      state.building = true;
      return true;
    }),
    nodeLayer: vi.fn((ctx: CanvasRenderingContext2D) => ctx),
    end: vi.fn(() => {
      state.building = false;
      state.built = true;
      state.comets = state.drawn;
    }),
    paint: vi.fn(),
    invalidate: vi.fn(() => {
      state.built = false;
      state.comets = [];
    }),
    release: vi.fn(() => {
      state.built = false;
      state.comets = [];
    }),
  };
  return { state, frame };
});

vi.mock("./frame-cache/still-frame", () => ({ createStillFrame: vi.fn(() => still.frame) }));
vi.mock("./topology-frame-gate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./topology-frame-gate")>()),
  createFrameGate: vi.fn(() => pipeline.gate),
}));
vi.mock("./topology-dome-frame-stage", () => ({ createDomeFrameStage: vi.fn(() => pipeline.dome) }));
vi.mock("./topology-world-motion-frame-stage", () => ({ createWorldMotionFrameStage: vi.fn(() => pipeline.motion) }));
vi.mock("./topology-camera-frame-stage", () => ({ createCameraFrameStage: vi.fn(() => pipeline.camera) }));
vi.mock("./topology-cluster-frame-stage", () => ({ createClusterFrameStage: vi.fn(() => pipeline.clusters) }));
vi.mock("./topology-realm-frame-stage", () => ({ createRealmFrameStage: vi.fn(() => pipeline.realm) }));
vi.mock("./topology-reveal-frame-stage", () => ({ createRevealFrameStage: vi.fn(() => pipeline.reveal) }));
vi.mock("./topology-presentation-frame-stage", () => ({ createPresentationFrameStage: vi.fn(() => pipeline.presentation) }));
vi.mock("../light/light-frame-stage", () => ({
  createLightFrameStage: vi.fn(() => ({ prepare: pipeline.lightPrepare, render: pipeline.lightRender, dispose: pipeline.lightDispose })),
}));

import { createLightFrameStage } from "../light/light-frame-stage";
import { createCameraFrameStage } from "./topology-camera-frame-stage";
import { createFrameGate, FRAME_ASLEEP, FRAME_NOT_READY, IDLE_GRACE_MS } from "./topology-frame-gate";
import { useTopologyActivityState } from "./use-topology-activity-state";
import { requestOntologyMapFrame, useTopologyFrameLoop } from "./use-topology-frame-loop";

const readyFrame = { tokens: {}, world: {}, width: 800, height: 600, dpr: 2, dt: 0.016 };

function configuration(canvas: HTMLCanvasElement) {
  // Stages are substituted above; only the scheduler's own configuration is real.
  return {
    canvasRef: { current: canvas },
    projection: { domeRuntimeRef: { current: null }, cameraRef: { current: {} }, reducedMotionRef: { current: false }, neuralRampRef: { current: 0 } },
    recovery: { lastActiveMsRef: { current: 0 }, viewportRebuildPendingRef: { current: false }, wakeFrameLoopRef: { current: () => {} } },
    domeFrameStage: {}, worldMotionFrameStage: {}, cameraFrameStage: {}, clusterFrameStage: {},
    realmFrameStage: {}, revealFrameStage: {},
    frameGate: {
      galaxyRef: { current: false }, view3dRef: { current: false }, galaxyRampRef: { current: 0 },
      trailLensPropRef: { current: null }, lastInputMsRef: { current: 0 }, ambientSleepDelayRef: { current: undefined },
    },
    presentationFrameStage: { animatedBgRef: { current: null }, tourAnchorNodeIdRef: { current: null } },
  } as unknown as Parameters<typeof useTopologyFrameLoop>[0];
}

describe("topology frame scheduling", () => {
  let nextFrame: FrameRequestCallback;
  let canvas: HTMLCanvasElement;
  let request: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    pipeline.order.length = 0;
    pipeline.gate.mockImplementation(() => { pipeline.order.push("gate"); return readyFrame; });
    pipeline.dome.mockImplementation(() => { pipeline.order.push("dome"); return true; });
    request = vi.fn((callback: FrameRequestCallback) => { nextFrame = callback; return 17; });
    cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", request);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("runs stages in dependency order and passes the same frame clock to reveal", () => {
    const { unmount, rerender } = renderHook(() => useTopologyFrameLoop(configuration(canvas)));
    act(() => nextFrame(1234));
    expect(pipeline.order).toEqual(["gate", "dome", "motion", "camera", "clusters", "realm", "reveal", "light-prepare", "presentation", "light-render"]);
    expect(pipeline.reveal.mock.calls[0]?.slice(0, 2)).toEqual([1234, 0.016]);
    expect(pipeline.lightPrepare.mock.calls[0]?.[0]).toBe(1234);
    expect(pipeline.presentation).toHaveBeenCalledOnce();
    expect(canvas.getContext).toHaveBeenCalledWith("2d", { alpha: false });
    rerender();
    expect(createFrameGate).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(2);
    unmount();
    expect(cancel).toHaveBeenCalledWith(17);
    expect(pipeline.lightDispose).toHaveBeenCalledOnce();
  });

  it("keeps the gate awake on the same light flag the light stage writes", () => {
    const { unmount } = renderHook(() => useTopologyFrameLoop(configuration(canvas)));
    const gateFlag = vi.mocked(createFrameGate).mock.calls[0]?.[0].lightActiveRef;
    const stageFlag = vi.mocked(createLightFrameStage).mock.calls[0]?.[0].lightActiveRef;
    expect(gateFlag).toBeDefined();
    expect(gateFlag).toBe(stageFlag);
    unmount();
  });

  it.each(["gate", "dome"] as const)("reschedules after a %s yield without drawing a partial frame", (stage) => {
    if (stage === "gate") pipeline.gate.mockImplementation(() => { pipeline.order.push("gate"); return FRAME_NOT_READY; });
    else pipeline.dome.mockImplementation(() => { pipeline.order.push("dome"); return false; });
    const { unmount } = renderHook(() => useTopologyFrameLoop(configuration(canvas)));
    act(() => nextFrame(1234));
    expect(pipeline.order).toEqual(stage === "gate" ? ["gate"] : ["gate", "dome"]);
    expect(pipeline.presentation).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("reads changed selection, camera, and mode refs without replacing stages", () => {
    const state = configuration(canvas);
    const focusedSlugRef = { current: "first" as string | null };
    const galaxyRef = { current: false };
    const cameraRef = { current: { scale: { value: 1 } } };
    state.cameraFrameStage = { ...state.cameraFrameStage, focusedSlugRef, cameraRef } as typeof state.cameraFrameStage;
    state.frameGate = { ...state.frameGate, galaxyRef };
    const observed: unknown[] = [];
    vi.mocked(createCameraFrameStage).mockImplementationOnce((dependencies) => (...args) => {
      observed.push([dependencies.focusedSlugRef.current, dependencies.cameraRef.current.scale.value, galaxyRef.current]);
      return pipeline.camera(...args) as ReturnType<ReturnType<typeof createCameraFrameStage>>;
    });
    const { rerender, unmount } = renderHook(() => useTopologyFrameLoop({ ...state }));
    act(() => nextFrame(1000));
    focusedSlugRef.current = "second";
    cameraRef.current.scale.value = 2;
    galaxyRef.current = true;
    rerender();
    act(() => nextFrame(1016));
    expect(observed).toEqual([["first", 1, false], ["second", 2, true]]);
    expect(createCameraFrameStage).toHaveBeenCalledOnce();
    unmount();
  });

  it("restarts when an original camera policy dependency is replaced", () => {
    const state = configuration(canvas);
    const { rerender, unmount } = renderHook(() => useTopologyFrameLoop({ ...state }));
    state.domeFrameStage = { ...state.domeFrameStage, beginCameraTween: vi.fn() };
    rerender();
    expect(createFrameGate).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
    unmount();
  });

  it("recovers a lost context and makes queued callbacks inert after disposal", () => {
    const state = configuration(canvas);
    const { unmount } = renderHook(() => useTopologyFrameLoop(state));
    const lost = new Event("contextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    canvas.dispatchEvent(new Event("contextrestored"));
    expect(state.recovery.lastActiveMsRef.current).toBeGreaterThan(0);
    expect(state.recovery.viewportRebuildPendingRef.current).toBe(true);
    const queued = nextFrame!;
    unmount();
    state.recovery.viewportRebuildPendingRef.current = false;
    canvas.dispatchEvent(new Event("contextrestored"));
    expect(state.recovery.viewportRebuildPendingRef.current).toBe(false);
    act(() => queued(1300));
    expect(pipeline.gate).not.toHaveBeenCalled();
  });
});

describe("a sleeping topology frame loop", () => {
  let queued: FrameRequestCallback[];
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    vi.clearAllMocks();
    queued = [];
    pipeline.gate.mockImplementation(() => FRAME_ASLEEP);
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => queued.push(callback)));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const runQueued = () => {
    const due = queued;
    queued = [];
    act(() => due.forEach((callback) => callback(1000)));
  };

  it("schedules no further frame once the gate reports nothing to draw", () => {
    const { unmount } = renderHook(() => useTopologyFrameLoop(configuration(canvas)));
    expect(queued).toHaveLength(1);
    runQueued();
    expect(queued).toHaveLength(0);
    unmount();
  });

  it("wakes for exactly one frame per wake while a frame is pending", () => {
    const state = configuration(canvas);
    const { unmount } = renderHook(() => useTopologyFrameLoop(state));
    runQueued();
    state.recovery.wakeFrameLoopRef.current();
    state.recovery.wakeFrameLoopRef.current();
    requestOntologyMapFrame();
    expect(queued).toHaveLength(1);
    runQueued();
    expect(pipeline.gate).toHaveBeenCalledTimes(2);
    expect(queued).toHaveLength(0);
    unmount();
  });

  it("wakes on a render, since a render carries new props into the refs the gate reads", () => {
    const state = configuration(canvas);
    const { rerender, unmount } = renderHook(() => useTopologyFrameLoop({ ...state }));
    runQueued();
    rerender();
    expect(queued).toHaveLength(1);
    unmount();
  });

  it("leaves an unmounted map alone when another surface asks for a frame", () => {
    const state = configuration(canvas);
    const { unmount } = renderHook(() => useTopologyFrameLoop(state));
    runQueued();
    unmount();
    requestOntologyMapFrame();
    state.recovery.wakeFrameLoopRef.current();
    expect(queued).toHaveLength(0);
  });

  it("wakes when activity is recorded, which is how the map asks to be drawn once more", () => {
    const { result } = renderHook(() => useTopologyActivityState());
    const wake = vi.fn();
    result.current.wakeFrameLoopRef.current = wake;
    result.current.lastActiveMsRef.current = 42;
    expect(wake).toHaveBeenCalledOnce();
    expect(result.current.lastActiveMsRef.current).toBe(42);
  });
});

describe("a flat map where only the comets move", () => {
  let nextFrame: FrameRequestCallback | null;
  let canvas: HTMLCanvasElement;
  let request: ReturnType<typeof vi.fn>;
  const stillFrame = { ...readyFrame, awake: true, sceneStill: true };

  beforeEach(() => {
    vi.clearAllMocks();
    pipeline.order.length = 0;
    still.state.built = false;
    still.state.building = false;
    still.state.comets = [];
    still.state.drawn = [{ kind: "depends", t: 0.25, sourceId: "a", targetId: "b" }];
    pipeline.gate.mockImplementation(() => stillFrame);
    pipeline.dome.mockImplementation(() => true);
    nextFrame = null;
    request = vi.fn((callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 9;
    });
    vi.stubGlobal("requestAnimationFrame", request);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const runUntil = (from: number, to: number) => {
    for (let t = from; t <= to && nextFrame; t += 16) {
      const due = nextFrame;
      nextFrame = null;
      act(() => due(t));
    }
  };

  it("stops running the frame stages once the scene has held still for the grace window", () => {
    const { unmount } = renderHook(() => useTopologyFrameLoop(configuration(canvas)));
    runUntil(1000, 1000 + IDLE_GRACE_MS + 32);
    expect(still.frame.end).toHaveBeenCalledOnce();
    const drawn = pipeline.presentation.mock.calls.length;
    runUntil(2300, 3300);
    expect(pipeline.presentation.mock.calls.length).toBe(drawn);
    expect(still.frame.paint.mock.calls.length).toBeGreaterThan(50);
    expect(still.state.comets[0]!.t).not.toBe(0.25);
    unmount();
  });

  it("draws whole frames again the moment anything but the comets moves", () => {
    const { unmount } = renderHook(() => useTopologyFrameLoop(configuration(canvas)));
    runUntil(1000, 2400);
    const drawn = pipeline.presentation.mock.calls.length;
    pipeline.gate.mockImplementation(() => ({ ...stillFrame, sceneStill: false }));
    runUntil(2416, 2500);
    expect(pipeline.presentation.mock.calls.length).toBe(drawn + 6);
    unmount();
  });

  it("draws whole frames again after a render, which can carry a change no flag names", () => {
    const { rerender, unmount } = renderHook(() => useTopologyFrameLoop({ ...configuration(canvas) }));
    runUntil(1000, 2400);
    const drawn = pipeline.presentation.mock.calls.length;
    rerender();
    runUntil(2416, 2500);
    expect(pipeline.presentation.mock.calls.length).toBe(drawn + 6);
    unmount();
  });

  it("asks for no further frame when the still scene shows no comet", () => {
    still.state.drawn = [];
    const { unmount } = renderHook(() => useTopologyFrameLoop(configuration(canvas)));
    runUntil(1000, 3000);
    expect(still.frame.end).toHaveBeenCalledOnce();
    expect(still.frame.release).toHaveBeenCalledOnce();
    expect(nextFrame).toBeNull();
    unmount();
  });
});
