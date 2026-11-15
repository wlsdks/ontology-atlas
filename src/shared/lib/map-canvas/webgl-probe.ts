const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software/i;

type WebglContext = WebGLRenderingContext | WebGL2RenderingContext;

export function isSoftwareRenderer(gl: WebglContext): boolean {
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return SOFTWARE_RENDERER.test(renderer);
  } catch {
    return true;
  }
}

/** What one probe context learned: whether a WebGL2 context opens, and whether WebGL runs on hardware. */
export interface WebglVerdict {
  webgl2: boolean;
  accelerated: boolean;
}

/** Opens one throwaway context, WebGL2 first, and releases it. */
export function probeWebgl(): WebglVerdict {
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    const gl = gl2 ?? canvas.getContext("webgl");
    if (!gl) return { webgl2: false, accelerated: false };
    try {
      return { webgl2: gl2 !== null, accelerated: !isSoftwareRenderer(gl) };
    } finally {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    return { webgl2: false, accelerated: false };
  }
}

let verdict: WebglVerdict | null = null;
const cachedVerdict = () => (verdict ??= probeWebgl());

export function webglAccelerated(): boolean {
  return cachedVerdict().accelerated;
}

/** True when this browser opens a WebGL2 context; asked before a WebGL2 painter's code is loaded. */
export function webgl2Available(): boolean {
  return cachedVerdict().webgl2;
}
