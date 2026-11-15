import type { RefObject } from "react";

import { webglAccelerated } from "@/shared/lib/map-canvas/webgl-probe";

import type { NeuralFrame, NeuralSurface } from "../ui/frame-draw/neural-frame";
import type { NeuralGl } from "./neural-gl";
import { installNeuralGlProbe, type NeuralGlPoint } from "./neural-gl-probe";

type NeuralGlModule = Pick<typeof import("./neural-gl"), "createNeuralGl">;

/**
 * Who paints Neural: `webgl`, or the step that left it on canvas 2D. `off` is `?neuralgl=off`,
 * `unaccelerated` a software renderer without `?neuralgl=force`, `loading` the chunk on its way,
 * `failed` the chunk or the renderer refusing, `lost` a lost context. `idle` outside Neural.
 */
export type NeuralGlState = "idle" | "off" | "unaccelerated" | "loading" | "webgl" | "failed" | "lost";

export type NeuralPainter = "webgl" | "canvas";

export interface NeuralGlStageDependencies {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Wakes the loop for one drawn frame. */
  requestFrame: () => void;
  /** Releases the map's other WebGL context; called before Neural creates its own. */
  claimContext: () => void;
  /** True from the moment Neural asks for a context until it releases it. */
  contextHeldRef: { current: boolean };
}

export interface NeuralGlStageOptions {
  search?: string;
  load?: () => Promise<NeuralGlModule>;
  accelerated?: () => boolean;
  hasWebgl2?: () => boolean;
}

export interface NeuralGlStage {
  /** Handed to the frame draw as `neuralSurface`. */
  readonly surface: NeuralSurface;
  /** Before the frame draw: the backing pixels per CSS pixel this frame rasterises at. */
  beginFrame(devicePixelRatio: number): void;
  /** After the frame draw: a frame that did not paint Neural releases the context. */
  endFrame(): void;
  painter(): NeuralPainter;
  state(): NeuralGlState;
  /** Draws the GL and names canvases over `into`, a copy of the map canvas at CSS size. */
  composeSnapshot(into: HTMLCanvasElement): void;
  dispose(): void;
}

async function loadNeuralGl(): Promise<NeuralGlModule> {
  const { createNeuralGl } = await import("./neural-gl");
  return { createNeuralGl };
}

const stages = new WeakMap<HTMLCanvasElement, NeuralGlStage>();

/** Which painter drew the last Neural frame on the map whose canvas this is. */
export function neuralPainterOf(canvas: HTMLCanvasElement | null): NeuralPainter {
  return (canvas && stages.get(canvas)?.painter()) ?? "canvas";
}

/** Adds what Neural's sibling canvases show to a leaving snapshot of the map canvas. */
export function composeNeuralSnapshot(canvas: HTMLCanvasElement | null, into: HTMLCanvasElement | null): void {
  if (canvas && into) stages.get(canvas)?.composeSnapshot(into);
}

function siblingCanvas(doc: Document, testId: string): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.testid = testId;
  canvas.style.position = "absolute";
  canvas.style.pointerEvents = "none";
  return canvas;
}

export function createNeuralGlStage(dependencies: NeuralGlStageDependencies, options: NeuralGlStageOptions = {}): NeuralGlStage {
  const { canvasRef, requestFrame, claimContext, contextHeldRef } = dependencies;
  const params = new URLSearchParams(options.search ?? (typeof window === "undefined" ? "" : window.location.search));
  const mode = params.get("neuralgl");
  const load = options.load ?? loadNeuralGl;
  const accelerated = options.accelerated ?? webglAccelerated;
  const hasWebgl2 = options.hasWebgl2 ?? (() => typeof WebGL2RenderingContext !== "undefined");

  let state: NeuralGlState = "idle";
  let gl: NeuralGl | null = null;
  let glCanvas: HTMLCanvasElement | null = null;
  let namesCanvas: HTMLCanvasElement | null = null;
  let namesCtx: CanvasRenderingContext2D | null = null;
  let host: HTMLCanvasElement | null = null;
  let pixelRatio = 1;
  let fitted = { width: -1, height: -1, ratio: -1 };
  let opacity = 0;
  let paintedThisFrame = false;
  let lastPainter: NeuralPainter = "canvas";
  let frames = 0;
  let disposed = false;
  const samples: { points: readonly NeuralGlPoint[]; resolve: (rgba: number[][] | null) => void }[] = [];

  const answerSamples = (rgba: (point: NeuralGlPoint) => number[] | null) => {
    for (const { points, resolve } of samples.splice(0)) {
      const read = points.map(rgba);
      resolve(read.every((value) => value !== null) ? (read as number[][]) : null);
    }
  };

  const release = () => {
    gl?.dispose();
    gl = null;
    glCanvas?.remove();
    namesCanvas?.remove();
    glCanvas = null;
    namesCanvas = null;
    namesCtx = null;
    host = null;
    fitted = { width: -1, height: -1, ratio: -1 };
    contextHeldRef.current = false;
    lastPainter = "canvas";
    answerSamples(() => null);
  };

  const onLost = () => {
    if (disposed || state !== "webgl") return;
    state = "lost";
    release();
    requestFrame();
  };

  const arrive = (module: NeuralGlModule) => {
    if (disposed || state !== "loading") return;
    const map = canvasRef.current;
    if (!map) {
      state = "failed";
      contextHeldRef.current = false;
      return;
    }
    const doc = map.ownerDocument;
    glCanvas = siblingCanvas(doc, "map-neural-gl");
    namesCanvas = siblingCanvas(doc, "map-neural-names");
    namesCtx = namesCanvas.getContext("2d");
    claimContext();
    gl = namesCtx ? module.createNeuralGl(glCanvas, { pixelRatio: () => pixelRatio, onLost }) : null;
    if (!gl) {
      state = "failed";
      release();
      return;
    }
    host = map;
    map.after(glCanvas, namesCanvas);
    state = "webgl";
    requestFrame();
  };

  const enter = () => {
    if (mode === "off") state = "off";
    else if (!hasWebgl2() || (mode !== "force" && !accelerated())) state = "unaccelerated";
    else {
      state = "loading";
      contextHeldRef.current = true;
      load().then(arrive, () => {
        if (state !== "loading") return;
        state = "failed";
        contextHeldRef.current = false;
      });
    }
  };

  const fit = (width: number, height: number) => {
    if (!host || !glCanvas || !namesCanvas) return;
    if (fitted.width === width && fitted.height === height && fitted.ratio === pixelRatio) return;
    fitted = { width, height, ratio: pixelRatio };
    for (const sibling of [glCanvas, namesCanvas]) {
      sibling.style.left = `${host.offsetLeft}px`;
      sibling.style.top = `${host.offsetTop}px`;
      sibling.style.width = `${width}px`;
      sibling.style.height = `${height}px`;
    }
    namesCanvas.width = Math.max(1, Math.round(width * pixelRatio));
    namesCanvas.height = Math.max(1, Math.round(height * pixelRatio));
  };

  const surface: NeuralSurface = {
    paint(frame: NeuralFrame) {
      paintedThisFrame = true;
      if (state === "idle") enter();
      if (state !== "webgl" || !gl || !glCanvas || !namesCtx) {
        lastPainter = "canvas";
        return null;
      }
      fit(frame.width, frame.height);
      gl.paint(frame);
      if (samples.length > 0) {
        const painter = gl;
        answerSamples((point) => Array.from(painter.read(Math.round(point.x * pixelRatio), Math.round(point.y * pixelRatio), 1, 1)));
      }
      if (opacity !== frame.neural) {
        opacity = frame.neural;
        glCanvas.style.opacity = String(opacity);
      }
      namesCtx.setTransform(1, 0, 0, 1, 0, 0);
      namesCtx.clearRect(0, 0, namesCtx.canvas.width, namesCtx.canvas.height);
      namesCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      frames += 1;
      lastPainter = "webgl";
      return namesCtx;
    },
  };

  const removeProbe = params.has("e2e") && typeof window !== "undefined"
    ? installNeuralGlProbe({
      state: () => state,
      frames: () => frames,
      counts: () => gl?.counts() ?? { cells: 0, axons: 0 },
      sample: (points) => {
        if (!gl) return Promise.resolve(null);
        const answer = new Promise<number[][] | null>((resolve) => samples.push({ points, resolve }));
        requestFrame();
        return answer;
      },
      lose: () => gl?.lose(),
    })
    : null;

  const stage: NeuralGlStage = {
    surface,
    beginFrame(devicePixelRatio) {
      pixelRatio = devicePixelRatio;
      paintedThisFrame = false;
    },
    endFrame() {
      if (paintedThisFrame || state === "idle") return;
      release();
      state = "idle";
    },
    painter: () => lastPainter,
    state: () => state,
    composeSnapshot(into) {
      if (!gl || !glCanvas || !namesCanvas || lastPainter !== "webgl") return;
      const ctx = into.getContext("2d");
      const drawn = gl.capture();
      if (!ctx || !drawn) return;
      ctx.globalAlpha = opacity;
      ctx.drawImage(drawn, 0, 0, into.width, into.height);
      ctx.globalAlpha = 1;
      ctx.drawImage(namesCanvas, 0, 0, into.width, into.height);
    },
    dispose() {
      disposed = true;
      release();
      state = "idle";
      removeProbe?.();
      if (mapCanvas && stages.get(mapCanvas) === stage) stages.delete(mapCanvas);
    },
  };
  const mapCanvas = canvasRef.current;
  if (mapCanvas) stages.set(mapCanvas, stage);
  return stage;
}
