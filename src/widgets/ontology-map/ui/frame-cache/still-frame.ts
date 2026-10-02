import type { ParticleEdge } from "../../render/edge-fireflies";
import { COMET_DOT_VALUES, cometDots, fillCometDots, recordComets, type CometMark } from "../../render/traces";

interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

const STATE_KEYS = [
  "globalAlpha",
  "globalCompositeOperation",
  "fillStyle",
  "strokeStyle",
  "lineWidth",
  "lineCap",
  "lineJoin",
  "miterLimit",
  "lineDashOffset",
  "font",
  "textAlign",
  "textBaseline",
  "direction",
  "letterSpacing",
  "wordSpacing",
  "fontKerning",
  "fontStretch",
  "fontVariantCaps",
  "textRendering",
  "imageSmoothingEnabled",
  "imageSmoothingQuality",
  "shadowBlur",
  "shadowColor",
  "shadowOffsetX",
  "shadowOffsetY",
  "filter",
] as const;

const QUERIES = new Set<PropertyKey>([
  "measureText",
  "getLineDash",
  "getTransform",
  "isPointInPath",
  "isPointInStroke",
  "createLinearGradient",
  "createRadialGradient",
  "createConicGradient",
  "createPattern",
  "createImageData",
  "getImageData",
  "getContextAttributes",
  "isContextLost",
]);

function copyState(from: CanvasRenderingContext2D, to: CanvasRenderingContext2D): void {
  const source = from as unknown as Record<string, unknown>;
  const target = to as unknown as Record<string, unknown>;
  for (const key of STATE_KEYS) if (key in from) target[key] = source[key];
  to.setLineDash(from.getLineDash());
  to.setTransform(from.getTransform());
}

function tee(main: CanvasRenderingContext2D, copy: CanvasRenderingContext2D): CanvasRenderingContext2D {
  const calls = new Map<PropertyKey, (...args: unknown[]) => unknown>();
  const second = copy as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>;
  return new Proxy(main, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      let call = calls.get(key);
      if (!call) {
        const method = value as (...args: unknown[]) => unknown;
        call = QUERIES.has(key)
          ? (...args) => method.apply(target, args)
          : (...args) => {
              const result = method.apply(target, args);
              second[key]!.apply(copy, args);
              return result;
            };
        calls.set(key, call);
      }
      return call;
    },
    set(target, key, value) {
      Reflect.set(target, key, value, target);
      Reflect.set(copy, key, value, copy);
      return true;
    },
  });
}

export interface StillFrame {
  readonly building: boolean;
  readonly comets: readonly ParticleEdge[];
  ready(world: object, tokens: object, dpr: number, reducedMotion: boolean): boolean;
  begin(world: object, tokens: object, dpr: number, reducedMotion: boolean): boolean;
  nodeLayer(from: CanvasRenderingContext2D): CanvasRenderingContext2D;
  end(): void;
  paint(): void;
  invalidate(): void;
  release(): void;
}

export function createStillFrame(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): StillFrame {
  let full: Layer | null = null;
  let cover: Layer | null = null;
  let scratch: Layer | null = null;
  let marks: CometMark[] = [];
  let owners: ParticleEdge[] = [];
  let key: { world: object; tokens: object; dpr: number; reducedMotion: boolean; width: number; height: number } | null = null;
  let phase: "idle" | "edges" | "nodes" = "idle";
  const dots = new Float64Array(COMET_DOT_VALUES);

  const layer = (current: Layer | null, width: number, height: number): Layer | null => {
    const surface = current?.canvas ?? document.createElement("canvas");
    if (surface.width !== width) surface.width = width;
    if (surface.height !== height) surface.height = height;
    const surfaceCtx = current?.ctx ?? surface.getContext("2d");
    return surfaceCtx ? { canvas: surface, ctx: surfaceCtx } : null;
  };

  const comets = (dpr: number): void => {
    if (!cover) return;
    for (const mark of marks) {
      const n = cometDots(mark.a, mark.control, mark.b, mark.owner.t, mark.base, mark.farT, mark.span, dots);
      if (n === 0) continue;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let k = 0; k < n; k += 3) {
        x0 = Math.min(x0, dots[k]! - dots[k + 2]!);
        y0 = Math.min(y0, dots[k + 1]! - dots[k + 2]!);
        x1 = Math.max(x1, dots[k]! + dots[k + 2]!);
        y1 = Math.max(y1, dots[k + 1]! + dots[k + 2]!);
      }
      const reach = 2 + Math.ceil(mark.shadowBlur * 2);
      const left = Math.max(0, Math.floor(x0 * dpr) - reach);
      const top = Math.max(0, Math.floor(y0 * dpr) - reach);
      const w = Math.min(canvas.width, Math.ceil(x1 * dpr) + reach) - left;
      const h = Math.min(canvas.height, Math.ceil(y1 * dpr) + reach) - top;
      if (w <= 0 || h <= 0) continue;
      if (!scratch || scratch.canvas.width < w || scratch.canvas.height < h) {
        scratch = layer(scratch, Math.max(w, scratch?.canvas.width ?? 64), Math.max(h, scratch?.canvas.height ?? 64));
        if (!scratch) return;
      }
      const s = scratch.ctx;
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.globalCompositeOperation = "source-over";
      s.globalAlpha = 1;
      s.clearRect(0, 0, w, h);
      s.setTransform(dpr, 0, 0, dpr, -left, -top);
      s.globalAlpha = mark.alpha;
      s.fillStyle = mark.color;
      s.shadowBlur = mark.shadowBlur;
      s.shadowColor = mark.shadowColor;
      fillCometDots(s, dots, n);
      s.shadowBlur = 0;
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.globalAlpha = 1;
      s.globalCompositeOperation = "destination-out";
      s.drawImage(cover.canvas, left, top, w, h, 0, 0, w, h);
      ctx.drawImage(scratch.canvas, 0, 0, w, h, left, top, w, h);
    }
  };

  const compose = (withFrame: boolean): void => {
    if (!full || !key) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;
    if ("filter" in ctx) ctx.filter = "none";
    if (withFrame) ctx.drawImage(full.canvas, 0, 0);
    comets(key.dpr);
    ctx.restore();
  };

  return {
    get building() {
      return phase !== "idle";
    },
    get comets() {
      return owners;
    },
    ready(world, tokens, dpr, reducedMotion) {
      return (
        phase === "idle" &&
        key !== null &&
        key.world === world &&
        key.tokens === tokens &&
        key.dpr === dpr &&
        key.reducedMotion === reducedMotion &&
        key.width === canvas.width &&
        key.height === canvas.height
      );
    },
    begin(world, tokens, dpr, reducedMotion) {
      if (canvas.width === 0 || canvas.height === 0) return false;
      full = layer(full, canvas.width, canvas.height);
      cover = layer(cover, canvas.width, canvas.height);
      if (!full || !cover) return false;
      key = { world, tokens, dpr, reducedMotion, width: canvas.width, height: canvas.height };
      marks = [];
      phase = "edges";
      recordComets(marks);
      return true;
    },
    nodeLayer(from) {
      if (phase !== "edges" || !cover) return from;
      phase = "nodes";
      recordComets(null);
      cover.ctx.setTransform(1, 0, 0, 1, 0, 0);
      cover.ctx.clearRect(0, 0, cover.canvas.width, cover.canvas.height);
      copyState(from, cover.ctx);
      return tee(from, cover.ctx);
    },
    end() {
      recordComets(null);
      const split = phase === "nodes";
      phase = "idle";
      if (!split || !full || !cover) {
        key = null;
        marks = [];
        owners = [];
        return;
      }
      full.ctx.save();
      full.ctx.setTransform(1, 0, 0, 1, 0, 0);
      full.ctx.globalAlpha = 1;
      full.ctx.globalCompositeOperation = "copy";
      full.ctx.drawImage(canvas, 0, 0);
      full.ctx.restore();
      owners = [...new Set(marks.map((mark) => mark.owner))];
      compose(false);
    },
    paint() {
      compose(true);
    },
    invalidate() {
      key = null;
      marks = [];
      owners = [];
    },
    release() {
      key = null;
      marks = [];
      owners = [];
      for (const surface of [full, cover, scratch]) {
        if (!surface) continue;
        surface.canvas.width = 0;
        surface.canvas.height = 0;
      }
      full = null;
      cover = null;
      scratch = null;
    },
  };
}
