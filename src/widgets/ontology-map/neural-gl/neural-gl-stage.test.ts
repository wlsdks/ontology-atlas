import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NeuralFrame } from "../ui/frame-draw/neural/neural-frame";
import type { NeuralGl, NeuralGlOptions } from "./neural-gl";
import { createNeuralGlStage, neuralPainterOf, type NeuralGlStageOptions } from "./neural-gl-stage";

const FRAME = { width: 800, height: 600, neural: 1 } as NeuralFrame;

function fakeGl(): NeuralGl {
  return {
    paint: vi.fn(),
    capture: vi.fn(() => null),
    read: vi.fn((_x: number, _y: number, w: number, h: number) => new Uint8Array(w * h * 4)),
    counts: () => ({ cells: 3, axons: 2 }),
    lose: vi.fn(),
    dispose: vi.fn(),
  };
}

function setup(search: string, options: Omit<NeuralGlStageOptions, "search"> = {}) {
  const container = document.createElement("div");
  const map = document.createElement("canvas");
  container.append(map);
  document.body.append(container);
  const requestFrame = vi.fn();
  const claimContext = vi.fn();
  const contextHeldRef = { current: false };
  let lost: (() => void) | null = null;
  const gl = fakeGl();
  const createNeuralGl = vi.fn((_canvas: HTMLCanvasElement, glOptions: NeuralGlOptions) => {
    lost = glOptions.onLost;
    return gl;
  });
  const load = vi.fn(async () => ({ createNeuralGl }));
  const stage = createNeuralGlStage({ canvasRef: { current: map }, requestFrame, claimContext, contextHeldRef }, { search, load, accelerated: () => true, hasWebgl2: () => true, ...options });
  const frame = () => {
    stage.beginFrame(2);
    const names = stage.surface.paint(FRAME);
    stage.endFrame();
    return names;
  };
  const leave = () => {
    stage.beginFrame(2);
    stage.endFrame();
  };
  return { map, container, stage, gl, load, createNeuralGl, requestFrame, claimContext, contextHeldRef, frame, leave, lose: () => lost?.() };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return { canvas: this, setTransform: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement["getContext"]);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("createNeuralGlStage", () => {
  it("leaves Neural on canvas 2D and loads nothing under ?neuralgl=off", () => {
    const { stage, load, frame } = setup("?neuralgl=off");
    expect(frame()).toBeNull();
    expect([stage.state(), stage.painter(), load.mock.calls.length]).toEqual(["off", "canvas", 0]);
  });

  it("never loads the painter in a browser without WebGL2, even when forced", () => {
    const { stage, load, frame } = setup("?neuralgl=force", { hasWebgl2: () => false });
    expect(frame()).toBeNull();
    expect([stage.state(), load.mock.calls.length]).toEqual(["unaccelerated", 0]);
  });

  it("keeps a software renderer on canvas 2D unless the page forces WebGL", async () => {
    const plain = setup("", { accelerated: () => false });
    expect(plain.frame()).toBeNull();
    expect([plain.stage.state(), plain.load.mock.calls.length]).toEqual(["unaccelerated", 0]);
    const forced = setup("?neuralgl=force", { accelerated: () => false });
    forced.frame();
    await flush();
    expect(forced.stage.state()).toBe("webgl");
  });

  it("draws canvas 2D while the chunk loads, then WebGL after waking the loop once", async () => {
    const { stage, frame, requestFrame, claimContext, createNeuralGl, container } = setup("");
    expect(frame()).toBeNull();
    expect(stage.state()).toBe("loading");
    await flush();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(claimContext.mock.invocationCallOrder[0]).toBeLessThan(createNeuralGl.mock.invocationCallOrder[0]);
    expect(frame()).not.toBeNull();
    expect(stage.painter()).toBe("webgl");
    const order = [...container.children].map((child) => (child as HTMLElement).dataset.testid ?? "map");
    expect(order).toEqual(["map", "map-neural-gl", "map-neural-names"]);
  });

  it("falls back to canvas 2D when the chunk fails to load", async () => {
    const { stage, frame, contextHeldRef } = setup("", { load: () => Promise.reject(new Error("offline")) });
    frame();
    await flush();
    expect(frame()).toBeNull();
    expect([stage.state(), contextHeldRef.current]).toEqual(["failed", false]);
  });

  it("falls back to canvas 2D when the painter throws while it is created", async () => {
    const load = async () => ({
      createNeuralGl: () => {
        throw new Error("no token");
      },
    });
    const { stage, frame, contextHeldRef, container } = setup("", { load });
    frame();
    await flush();
    expect(frame()).toBeNull();
    expect([stage.state(), contextHeldRef.current, container.children.length]).toEqual(["failed", false, 1]);
  });

  it("stays on canvas 2D after a lost context until Neural is entered again", async () => {
    const { stage, frame, leave, lose, gl, requestFrame, contextHeldRef } = setup("");
    frame();
    await flush();
    frame();
    lose();
    expect([stage.state(), contextHeldRef.current, requestFrame.mock.calls.length]).toEqual(["lost", false, 2]);
    expect(gl.dispose).toHaveBeenCalledTimes(1);
    expect(frame()).toBeNull();
    leave();
    frame();
    await flush();
    expect(stage.state()).toBe("webgl");
  });

  it("releases the context and its canvases on the first frame that does not paint Neural", async () => {
    const { stage, frame, leave, gl, container, contextHeldRef, map } = setup("");
    frame();
    await flush();
    frame();
    expect(neuralPainterOf(map)).toBe("webgl");
    leave();
    expect(gl.dispose).toHaveBeenCalledTimes(1);
    expect([container.children.length, contextHeldRef.current, stage.state(), neuralPainterOf(map)]).toEqual([1, false, "idle", "canvas"]);
  });
});
