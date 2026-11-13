import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelInsets } from "../../interaction/free-area";
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
