import { isSoftwareRenderer } from "@/shared/lib/webgl-probe";

import {
  BLOOM_FRAGMENT,
  BLOOM_VERTEX,
  BLOOM_VERTICES,
  INK_SLOTS,
  SIGNAL_FRAGMENT,
  SIGNAL_VERTEX,
  SIGNAL_VERTICES,
} from "./light-shaders";

export const SIGNAL_STRIDE = 12;
export const BLOOM_STRIDE = 8;
export const SIGNAL_CAPACITY = 128;
export const BLOOM_CAPACITY = 256;

export interface LightBatch {
  signals: Float32Array;
  signalCount: number;
  blooms: Float32Array;
  bloomCount: number;
  inks: Float32Array;
  corePx: number;
  haloPx: number;
}

export interface LightLayer {
  readonly canvas: HTMLCanvasElement;
  draw(width: number, height: number, batch: LightBatch): void;
  clear(width: number, height: number): void;
  read(left: number, top: number, width: number, height: number): Uint8Array;
  isLost(): boolean;
  dispose(): void;
}

interface LightLayerOptions {
  forced: boolean;
  blend: "plus-lighter" | "screen";
  onLost: () => void;
  onRestored: () => void;
}

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: "low-power",
};

interface Program {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  viewport: WebGLUniformLocation | null;
  inks: WebGLUniformLocation | null;
  core: WebGLUniformLocation | null;
  halo: WebGLUniformLocation | null;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("light: no shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`light: shader did not compile: ${log ?? ""}`);
  }
  return shader;
}

function link(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
  stride: number,
  capacity: number,
  attributes: number,
): Program {
  const program = gl.createProgram();
  if (!program) throw new Error("light: no program");
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`light: program did not link: ${gl.getProgramInfoLog(program) ?? ""}`);
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  if (!vao || !buffer) throw new Error("light: no buffers");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, stride * capacity * 4, gl.DYNAMIC_DRAW);
  for (let location = 0; location < attributes; location += 1) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 4, gl.FLOAT, false, stride * 4, location * 16);
    gl.vertexAttribDivisor(location, 1);
  }
  gl.bindVertexArray(null);
  return {
    program,
    vao,
    buffer,
    viewport: gl.getUniformLocation(program, "u_viewport"),
    inks: gl.getUniformLocation(program, "u_inks"),
    core: gl.getUniformLocation(program, "u_core"),
    halo: gl.getUniformLocation(program, "u_halo"),
  };
}

export function lightBlendMode(): "plus-lighter" | "screen" {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("mix-blend-mode", "plus-lighter")
    ? "plus-lighter"
    : "screen";
}

export function createLightLayer(host: HTMLCanvasElement, options: LightLayerOptions): LightLayer | null {
  const canvas = host.ownerDocument.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.testid = "map-light";
  canvas.style.position = "absolute";
  canvas.style.pointerEvents = "none";
  canvas.style.mixBlendMode = options.blend;
  canvas.style.visibility = "hidden";
  const gl = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES);
  if (!gl) return null;
  if (!options.forced && isSoftwareRenderer(gl)) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }

  let signal: Program;
  let bloom: Program;
  let lost = false;
  let disposed = false;

  const run = (program: Program, data: Float32Array, stride: number, count: number, vertices: number, width: number, height: number, batch: LightBatch) => {
    if (count <= 0) return;
    gl.useProgram(program.program);
    gl.bindVertexArray(program.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, program.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * stride);
    gl.uniform2f(program.viewport, width, height);
    gl.uniform3fv(program.inks, batch.inks, 0, INK_SLOTS * 3);
    if (program.core) gl.uniform1f(program.core, batch.corePx);
    if (program.halo) gl.uniform1f(program.halo, batch.haloPx);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, vertices, count);
  };

  const build = () => {
    signal = link(gl, SIGNAL_VERTEX, SIGNAL_FRAGMENT, SIGNAL_STRIDE, SIGNAL_CAPACITY, 3);
    bloom = link(gl, BLOOM_VERTEX, BLOOM_FRAGMENT, BLOOM_STRIDE, BLOOM_CAPACITY, 2);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
  };
  const warm = () => {
    const signals = new Float32Array(SIGNAL_STRIDE);
    const blooms = new Float32Array(BLOOM_STRIDE);
    signals[1] = 1;
    blooms[2] = 1;
    const batch: LightBatch = { signals, signalCount: 1, blooms, bloomCount: 1, inks: new Float32Array(INK_SLOTS * 3), corePx: 1, haloPx: 1 };
    gl.viewport(0, 0, 1, 1);
    run(signal, signals, SIGNAL_STRIDE, 1, SIGNAL_VERTICES, 1, 1, batch);
    run(bloom, blooms, BLOOM_STRIDE, 1, BLOOM_VERTICES, 1, 1, batch);
    gl.bindVertexArray(null);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };
  try {
    build();
    warm();
  } catch {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }

  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    options.onLost();
  };
  const onRestored = () => {
    if (disposed) return;
    try {
      build();
      warm();
      lost = false;
      options.onRestored();
    } catch {
      lost = true;
    }
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  host.insertAdjacentElement("afterend", canvas);

  const fit = (width: number, height: number) => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const left = `${host.offsetLeft}px`;
    const top = `${host.offsetTop}px`;
    if (canvas.style.left !== left) canvas.style.left = left;
    if (canvas.style.top !== top) canvas.style.top = top;
    const cssWidth = `${width}px`;
    const cssHeight = `${height}px`;
    if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
    if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
    gl.viewport(0, 0, w, h);
  };
  fit(host.clientWidth, host.clientHeight);
  gl.clear(gl.COLOR_BUFFER_BIT);

  return {
    canvas,
    draw(width, height, batch) {
      if (lost || disposed) return;
      fit(width, height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      run(signal, batch.signals, SIGNAL_STRIDE, Math.min(batch.signalCount, SIGNAL_CAPACITY), SIGNAL_VERTICES, width, height, batch);
      run(bloom, batch.blooms, BLOOM_STRIDE, Math.min(batch.bloomCount, BLOOM_CAPACITY), BLOOM_VERTICES, width, height, batch);
      gl.bindVertexArray(null);
      if (canvas.style.visibility !== "visible") canvas.style.visibility = "visible";
    },
    clear(width, height) {
      if (lost || disposed) return;
      fit(width, height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      canvas.style.visibility = "hidden";
    },
    read(left, top, width, height) {
      const rows = new Uint8Array(width * height * 4);
      const x0 = Math.max(0, left);
      const y0 = Math.max(0, top);
      const x1 = Math.min(canvas.width, left + width);
      const y1 = Math.min(canvas.height, top + height);
      if (lost || disposed || x1 <= x0 || y1 <= y0) return rows;
      const w = x1 - x0;
      const h = y1 - y0;
      const flipped = new Uint8Array(w * h * 4);
      gl.readPixels(x0, canvas.height - y1, w, h, gl.RGBA, gl.UNSIGNED_BYTE, flipped);
      for (let row = 0; row < h; row += 1) {
        const source = (h - 1 - row) * w * 4;
        rows.set(flipped.subarray(source, source + w * 4), ((y0 - top + row) * width + (x0 - left)) * 4);
      }
      return rows;
    },
    isLost: () => lost,
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}
