import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";

import type { NeuralFrame } from "../ui/frame-draw/neural-frame";
import { readNeuralGlTokens, type NeuralGlTokens, type NeuralTokens } from "../tokens/read-neural-tokens";
import {
  CELL_FLOATS,
  createNeuralGlBuffers,
  fillNeuralGlBuffers,
  RIBBON_FLOATS,
  SHELL_FLOATS,
  SPOT_FLOATS,
  type GlInk,
  type NeuralGlBatch,
  type NeuralGlBuffers,
  type NeuralGlInks,
} from "./neural-gl-buffers";
import {
  CELL_FRAGMENT,
  CELL_VERTEX,
  RIBBON_FRAGMENT,
  RIBBON_SEGMENTS,
  RIBBON_VERTEX,
  SHELL_FRAGMENT,
  SHELL_VERTEX,
  SPOT_FRAGMENT,
  SPOT_VERTEX,
} from "./neural-gl-shaders";

type DrawName = Exclude<keyof NeuralGlBuffers, "cellCount" | "axonCount">;
const DRAW_ORDER: readonly DrawName[] = ["shells", "halos", "veiledCells", "cells", "rings", "restAxons", "restDots", "litAxons", "litSpots"];

export interface NeuralGlOptions {
  /** Backing pixels per CSS pixel for the frame being painted; the loop lowers it while a drag runs. */
  pixelRatio: () => number;
  /** The context was lost; the painter is spent and the caller falls back to canvas 2D. */
  onLost: () => void;
}

/** Neural drawn by three.js on its own canvas, one frame at a time, from the frame's screen coordinates. */
export interface NeuralGl {
  paint(frame: NeuralFrame): void;
  /** Draws the last frame again and returns the canvas, to be composited before this task ends. */
  capture(): CanvasImageSource | null;
  /** RGBA rows top-down of the backing-pixel box; call inside the task that painted. */
  read(x: number, y: number, w: number, h: number): Uint8Array;
  counts(): { cells: number; axons: number };
  /** Test hook: forces a context loss. */
  lose(): void;
  dispose(): void;
}

const SPOT_ATTRIBUTES = ["aSpot", "aBody", "aGlow", "aInner", "aRing", "aExtent"] as const;
const RIBBON_ATTRIBUTES = ["aCurve0", "aCurve1", "aWidth", "aColor"] as const;
const CELL_ATTRIBUTES = ["aCell", "aInk", "aCore"] as const;
const SHELL_ATTRIBUTES = ["aShell", "aColor"] as const;

/** `none` paints over everything, `test` hides behind a nearer cell, `write` is a cell itself. */
type DepthUse = "none" | "test" | "write";

function quadGeometry(): BufferGeometry {
  const base = new BufferGeometry();
  base.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3));
  base.setIndex([0, 1, 2, 2, 1, 3]);
  return base;
}

function ribbonGeometry(): BufferGeometry {
  const positions = new Float32Array((RIBBON_SEGMENTS + 1) * 2 * 3);
  const index: number[] = [];
  for (let s = 0; s <= RIBBON_SEGMENTS; s += 1) {
    const t = s / RIBBON_SEGMENTS;
    positions.set([t, -1, 0, t, 1, 0], s * 6);
    if (s < RIBBON_SEGMENTS) {
      const k = s * 2;
      index.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
  }
  const base = new BufferGeometry();
  base.setAttribute("position", new BufferAttribute(positions, 3));
  base.setIndex(index);
  return base;
}

function material(vertexShader: string, fragmentShader: string, depth: DepthUse, uniforms: ShaderMaterial["uniforms"] = {}): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    premultipliedAlpha: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    depthTest: depth !== "none",
    depthWrite: depth === "write",
    // The camera's y runs down the screen, which mirrors every triangle's winding.
    side: DoubleSide,
  });
}

/** One instanced draw whose per-instance records come from a `NeuralGlBatch`. */
class InstancedDraw {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private data: Float32Array | null = null;
  private buffer: InstancedInterleavedBuffer | null = null;

  constructor(
    private readonly base: BufferGeometry,
    private readonly names: readonly string[],
    private readonly stride: number,
    shader: ShaderMaterial,
    order: number,
  ) {
    this.mesh = new Mesh(this.geometryFor(new Float32Array(stride)), shader);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
  }

  private geometryFor(data: Float32Array): InstancedBufferGeometry {
    const geometry = new InstancedBufferGeometry();
    geometry.setIndex(this.base.index!.clone());
    geometry.setAttribute("position", this.base.getAttribute("position").clone());
    const buffer = new InstancedInterleavedBuffer(data, this.stride, 1);
    buffer.setUsage(DynamicDrawUsage);
    this.names.forEach((name, slot) => geometry.setAttribute(name, new InterleavedBufferAttribute(buffer, 4, slot * 4)));
    this.data = data;
    this.buffer = buffer;
    return geometry;
  }

  update(batch: NeuralGlBatch): void {
    if (batch.data !== this.data) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = this.geometryFor(batch.data);
    }
    const buffer = this.buffer!;
    buffer.clearUpdateRanges();
    buffer.addUpdateRange(0, batch.count * this.stride);
    buffer.needsUpdate = true;
    this.mesh.geometry.instanceCount = batch.count;
    this.mesh.visible = batch.count > 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const inkCache = new WeakMap<NeuralTokens, NeuralGlInks>();

/** Resolves a CSS colour of any syntax to straight rgba by painting one pixel. */
function resolveInk(ctx: CanvasRenderingContext2D, css: string): GlInk {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255, a / 255];
}

function inksOf(tokens: NeuralTokens, glTokens: NeuralGlTokens, doc: Document): NeuralGlInks {
  let inks = inkCache.get(tokens);
  if (inks) return inks;
  const ctx = doc.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const ink = (css: string): GlInk => (ctx ? resolveInk(ctx, css) : [1, 1, 1, 1]);
  const t = tokens.inks;
  inks = { strong: ink(t.strong), arc: ink(t.arc), reach: ink(t.reach), project: ink(t.project), warning: ink(t.warning), ground: ink(t.ground), ...glTokens };
  inkCache.set(tokens, inks);
  return inks;
}

/** The only place the map constructs a `WebGLRenderer`; loaded with `import()` on first entry to Neural. */
export function createNeuralGl(canvas: HTMLCanvasElement, options: NeuralGlOptions): NeuralGl | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, depth: true, stencil: false });
  } catch {
    return null;
  }
  const gl = renderer.getContext();
  renderer.setClearColor(0x000000, 0);
  renderer.sortObjects = false;
  renderer.autoClear = true;

  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, 1, 0, 4);
  const quadBase = quadGeometry();
  const ribbonBase = ribbonGeometry();
  const cellUniforms = { uGround: { value: new Vector3() }, uHighlight: { value: new Vector3() } };
  const spot = (order: number, depth: DepthUse) => new InstancedDraw(quadBase, SPOT_ATTRIBUTES, SPOT_FLOATS, material(SPOT_VERTEX, SPOT_FRAGMENT, depth), order);
  const ribbon = (order: number) => new InstancedDraw(ribbonBase, RIBBON_ATTRIBUTES, RIBBON_FLOATS, material(RIBBON_VERTEX, RIBBON_FRAGMENT, "test"), order);
  const cell = (order: number, depth: DepthUse) => new InstancedDraw(quadBase, CELL_ATTRIBUTES, CELL_FLOATS, material(CELL_VERTEX, CELL_FRAGMENT, depth, cellUniforms), order);
  // Cells first and opaque, writing depth; connections after, behind every cell they cross.
  const draws: Record<DrawName, InstancedDraw> = {
    shells: new InstancedDraw(quadBase, SHELL_ATTRIBUTES, SHELL_FLOATS, material(SHELL_VERTEX, SHELL_FRAGMENT, "none"), 0),
    halos: spot(1, "none"),
    veiledCells: cell(2, "none"),
    cells: cell(3, "write"),
    rings: spot(4, "test"),
    restAxons: ribbon(5),
    restDots: spot(6, "test"),
    litAxons: ribbon(7),
    litSpots: spot(8, "none"),
  };
  for (const draw of Object.values(draws)) scene.add(draw.mesh);
  const buffers = createNeuralGlBuffers();
  const glTokens = readNeuralGlTokens();

  let width = 0;
  let height = 0;
  let ratio = 0;
  let painted = false;
  let disposed = false;

  const onLost = (event: Event) => {
    event.preventDefault();
    if (!disposed) options.onLost();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  const fit = (w: number, h: number, dpr: number) => {
    if (w === width && h === height && dpr === ratio) return;
    width = w;
    height = h;
    ratio = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.right = w;
    camera.bottom = h;
    camera.updateProjectionMatrix();
  };

  return {
    paint(frame) {
      if (disposed) return;
      fit(frame.width, frame.height, options.pixelRatio());
      const inks = inksOf(frame.tokens, glTokens, canvas.ownerDocument);
      fillNeuralGlBuffers(buffers, frame, inks);
      cellUniforms.uGround.value.set(inks.ground[0], inks.ground[1], inks.ground[2]);
      cellUniforms.uHighlight.value.set(inks.strong[0], inks.strong[1], inks.strong[2]);
      for (const name of DRAW_ORDER) draws[name].update(buffers[name]);
      renderer.render(scene, camera);
      painted = true;
    },
    capture() {
      if (disposed || !painted || gl.isContextLost()) return null;
      renderer.render(scene, camera);
      return canvas;
    },
    read(x, y, w, h) {
      const rows = new Uint8Array(w * h * 4);
      const x0 = Math.max(0, x);
      const y0 = Math.max(0, y);
      const x1 = Math.min(canvas.width, x + w);
      const y1 = Math.min(canvas.height, y + h);
      if (disposed || gl.isContextLost() || x1 <= x0 || y1 <= y0) return rows;
      const bw = x1 - x0;
      const bh = y1 - y0;
      const flipped = new Uint8Array(bw * bh * 4);
      gl.readPixels(x0, canvas.height - y1, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, flipped);
      for (let row = 0; row < bh; row += 1) {
        const from = (bh - 1 - row) * bw * 4;
        rows.set(flipped.subarray(from, from + bw * 4), ((y0 - y + row) * w + (x0 - x)) * 4);
      }
      return rows;
    },
    counts: () => ({ cells: buffers.cellCount, axons: buffers.axonCount }),
    lose() {
      renderer.forceContextLoss();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const draw of Object.values(draws)) draw.dispose();
      quadBase.dispose();
      ribbonBase.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
