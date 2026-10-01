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

export function probeWebglAccelerated(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    try {
      return !isSoftwareRenderer(gl);
    } finally {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    return false;
  }
}

let verdict: boolean | null = null;

export function webglAccelerated(): boolean {
  verdict ??= probeWebglAccelerated();
  return verdict;
}
