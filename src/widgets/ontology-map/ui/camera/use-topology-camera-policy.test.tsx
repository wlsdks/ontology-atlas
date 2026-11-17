import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelInsets } from "../../interaction/free-area";
import { CANVAS_SPRING_PAN_MS, selectionTweenDurationMs, type CameraTween } from "../../model/camera/camera-easing";
import * as freeArea from "../../interaction/free-area";
import { useTopologyCameraPolicy } from "./use-topology-camera-policy";

class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  readonly observed = new Set<Element>();
  constructor(readonly notify: () => void) {
    FakeResizeObserver.last = this;
  }
  observe(el: Element) { this.observed.add(el); }
  unobserve(el: Element) { this.observed.delete(el); }
  disconnect() { this.observed.clear(); }
}

describe("the chrome boxes map names yield to", () => {
  let frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  function setup(view3d = false) {
    const canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, toJSON: () => ({}) });
    const panel = document.createElement("aside");
    panel.setAttribute("data-topology-camera-obstacle", "side-panel");
    const key = document.createElement("div");
    key.setAttribute("data-map-name-obstacle", "");
    document.body.append(canvas, panel, key);
    const deps = {
      canvasRef: { current: canvas },
      panelInsetsRef: { current: null as PanelInsets | null },
      domeFitInsetsRef: { current: null },
      reducedMotionRef: { current: false },
      cameraTweenRef: { current: null },
      cameraRef: { current: { x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } } },
      view3dRef: { current: view3d },
      lastActiveMsRef: { current: 0 },
    };
    const { result } = renderHook(() => useTopologyCameraPolicy(deps));
    return { deps, result, panel, key };
  }

  it("re-measures once, in the next frame, when the chrome changes size between camera moments, and asks for that frame", () => {
    const names = vi.spyOn(freeArea, "measureNameObstacles");
    const { deps, result, panel, key } = setup();
    const query = vi.spyOn(document, "querySelectorAll");
    result.current.cameraTokens({ safeInsetLeft: 0, safeInsetRight: 0 });
    expect(names).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.filter(([selector]) => selector === "body *"), "the insets and the names share one walk of the page").toHaveLength(1);
    const watch = FakeResizeObserver.last!;
    expect([...watch.observed]).toEqual(expect.arrayContaining([panel, key]));
    names.mockReturnValueOnce([{ minX: 800, maxX: 1200, minY: 0, maxY: 700 }]);
    watch.notify();
    watch.notify();
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(names).toHaveBeenCalledTimes(2);
    expect(deps.panelInsetsRef.current?.nameObstacles).toEqual([{ minX: 800, maxX: 1200, minY: 0, maxY: 700 }]);
    expect(deps.lastActiveMsRef.current).toBeGreaterThan(0);
  });

  it("measures no name boxes in 3D, where no name reads them", () => {
    const names = vi.spyOn(freeArea, "measureNameObstacles");
    const { deps, result } = setup(true);
    result.current.cameraTokens({ safeInsetLeft: 0, safeInsetRight: 0 });
    expect(names).not.toHaveBeenCalled();
    expect(deps.panelInsetsRef.current?.nameObstacles).toEqual([]);
  });
});

describe("a selection's camera tween", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function setup() {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const deps = {
      canvasRef: { current: document.createElement("canvas") },
      panelInsetsRef: { current: null as PanelInsets | null },
      domeFitInsetsRef: { current: null },
      reducedMotionRef: { current: false },
      cameraTweenRef: { current: null as CameraTween | null },
      cameraRef: { current: { x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } } },
      view3dRef: { current: false },
      lastActiveMsRef: { current: 0 },
    };
    const { result } = renderHook(() => useTopologyCameraPolicy(deps));
    return { deps, begin: result.current.beginCameraTween };
  }

  it("zooms for 360 ms an octave, longer than the spring's pan", () => {
    const { deps, begin } = setup();
    begin({ tx: 40, ty: 0, tscale: 4 }, undefined, "spring");
    expect(deps.cameraTweenRef.current!.durationMs).toBeGreaterThan(CANVAS_SPRING_PAN_MS);
    expect(deps.cameraTweenRef.current!.durationMs).toBe(selectionTweenDurationMs({ x: 0, y: 0, scale: 1 }, { x: 40, y: 0, scale: 4 }));
  });

  it("leaves a second selection from the drawn camera at the speed the first one had", () => {
    const { deps, begin } = setup();
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    begin({ tx: 40, ty: 0, tscale: 4 }, undefined, "spring");
    now.mockReturnValue(1200);
    deps.cameraRef.current = { x: { value: 20, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 2, velocity: 0 } };
    begin({ tx: 60, ty: 0, tscale: 6 }, undefined, "spring");
    const tween = deps.cameraTweenRef.current!;
    expect(tween.start).toEqual({ x: 20, y: 0, scale: 2 });
    expect(tween.startSpeed!.logScale).toBeGreaterThan(0);
    expect(tween.startSpeed!.x).toBeGreaterThan(0);
  });
});
