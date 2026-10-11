import { afterEach, describe, expect, it, vi } from "vitest";

import { isSoftwareRenderer, probeWebglAccelerated } from "./webgl-probe";

const UNMASKED_RENDERER_WEBGL = 0x9246;
const RENDERER = 0x1f01;

function fakeContext(renderer: string, options: { debugInfo?: boolean } = {}) {
  const loseContext = vi.fn();
  const gl = {
    RENDERER,
    getExtension: vi.fn((name: string) => {
      if (name === "WEBGL_debug_renderer_info") return options.debugInfo === false ? null : { UNMASKED_RENDERER_WEBGL };
      if (name === "WEBGL_lose_context") return { loseContext };
      return null;
    }),
    getParameter: vi.fn((parameter: number) => (parameter === UNMASKED_RENDERER_WEBGL || parameter === RENDERER ? renderer : null)),
  };
  return { gl: gl as unknown as WebGL2RenderingContext, loseContext };
}

function stubCanvas(context: WebGL2RenderingContext | null | (() => never)) {
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockImplementation((() => {
    if (typeof context === "function") return context();
    return context;
  }) as typeof canvas.getContext);
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => (tag === "canvas" ? canvas : create(tag)));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("webgl renderer probe", () => {
  it("accepts a hardware renderer and releases the probe context", () => {
    const { gl, loseContext } = fakeContext("ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max)");
    stubCanvas(gl);
    expect(probeWebglAccelerated()).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it.each(["ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)", "llvmpipe (LLVM 15.0.7, 256 bits)", "Software Rasterizer"])(
    "refuses the software renderer %s",
    (renderer) => {
      const { gl, loseContext } = fakeContext(renderer);
      stubCanvas(gl);
      expect(probeWebglAccelerated()).toBe(false);
      expect(loseContext).toHaveBeenCalledOnce();
    },
  );

  it("reads the plain renderer name when the debug extension is withheld", () => {
    const { gl } = fakeContext("SwiftShader", { debugInfo: false });
    expect(isSoftwareRenderer(gl)).toBe(true);
  });

  it("reports no acceleration without a context or when the probe throws", () => {
    stubCanvas(null);
    expect(probeWebglAccelerated()).toBe(false);
    vi.restoreAllMocks();
    stubCanvas(() => {
      throw new Error("blocked");
    });
    expect(probeWebglAccelerated()).toBe(false);
  });

  it("treats a context that cannot name its renderer as software", () => {
    const gl = {
      getExtension: () => {
        throw new Error("lost");
      },
    } as unknown as WebGL2RenderingContext;
    expect(isSoftwareRenderer(gl)).toBe(true);
  });
});
