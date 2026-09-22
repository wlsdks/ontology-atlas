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
  const camera = run("camera", { camera: {}, farT: 0, zoomRatio: 1 });
  const clusters = run("clusters", { effectiveExpanded: new Set(), batchAppearVisible: new Set() });
  const realm = run("realm", { frameClusteredIds: new Set(), frameChips: [] });
  const reveal = run("reveal");
  const presentation = run("presentation");
  return { order, gate, dome, motion, camera, clusters, realm, reveal, presentation };
});

vi.mock("./topology-frame-gate", () => ({ createFrameGate: vi.fn(() => pipeline.gate) }));
vi.mock("./topology-dome-frame-stage", () => ({ createDomeFrameStage: vi.fn(() => pipeline.dome) }));
vi.mock("./topology-world-motion-frame-stage", () => ({ createWorldMotionFrameStage: vi.fn(() => pipeline.motion) }));
vi.mock("./topology-camera-frame-stage", () => ({ createCameraFrameStage: vi.fn(() => pipeline.camera) }));
vi.mock("./topology-cluster-frame-stage", () => ({ createClusterFrameStage: vi.fn(() => pipeline.clusters) }));
vi.mock("./topology-realm-frame-stage", () => ({ createRealmFrameStage: vi.fn(() => pipeline.realm) }));
vi.mock("./topology-reveal-frame-stage", () => ({ createRevealFrameStage: vi.fn(() => pipeline.reveal) }));
vi.mock("./topology-presentation-frame-stage", () => ({ createPresentationFrameStage: vi.fn(() => pipeline.presentation) }));

import { createCameraFrameStage } from "./topology-camera-frame-stage";
import { createFrameGate } from "./topology-frame-gate";
import { useTopologyFrameLoop } from "./use-topology-frame-loop";

const readyFrame = { tokens: {}, world: {}, width: 800, height: 600, dpr: 2, dt: 0.016 };

function configuration(canvas: HTMLCanvasElement) {
  // Stages are substituted above; only the scheduler's own configuration is real.
  return {
    canvasRef: { current: canvas },
    projection: { domeRuntimeRef: { current: null }, cameraRef: { current: {} }, reducedMotionRef: { current: false }, neuralRampRef: { current: 0 } },
    recovery: { lastActiveMsRef: { current: 0 }, viewportRebuildPendingRef: { current: false } },
    domeFrameStage: {}, worldMotionFrameStage: {}, cameraFrameStage: {}, clusterFrameStage: {},
    realmFrameStage: {}, revealFrameStage: {}, frameGate: {}, presentationFrameStage: {},
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
    expect(pipeline.order).toEqual(["gate", "dome", "motion", "camera", "clusters", "realm", "reveal", "presentation"]);
    expect(pipeline.reveal.mock.calls[0]?.slice(0, 2)).toEqual([1234, 0.016]);
    expect(pipeline.presentation).toHaveBeenCalledOnce();
    expect(canvas.getContext).toHaveBeenCalledWith("2d", { alpha: false });
    rerender();
    expect(createFrameGate).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(2);
    unmount();
    expect(cancel).toHaveBeenCalledWith(17);
  });

  it.each(["gate", "dome"] as const)("reschedules after a %s yield without drawing a partial frame", (stage) => {
    if (stage === "gate") pipeline.gate.mockImplementation(() => { pipeline.order.push("gate"); return null; });
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
