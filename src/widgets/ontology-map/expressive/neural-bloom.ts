import { drawNodeBloom, type EgoLightTokens, type ScreenDisc } from './ego-light';

type Tokens = Pick<EgoLightTokens, 'indigo' | 'indigoBright' | 'nodeBloomBlurPx' | 'nodeBloomAlpha'>;
interface Stamp { canvas: HTMLCanvasElement; half: number; size: number }
const stamps = new WeakMap<CanvasRenderingContext2D, Map<string, Stamp>>();
const MAX_STAMPS = 128;

/**
 * A cell's stationary bloom, rasterized once rather than blurred on every frame.
 * Only the soft light is quantized to quarter-pixel radii; the sharp body and hit
 * disc retain exact geometry. View transitions fade the light with their ramp.
 */
export function drawNeuralBloom(
  ctx: CanvasRenderingContext2D,
  disc: ScreenDisc,
  ramp: number,
  strength: number,
  tokens: Tokens,
  dpr: number,
  ink?: { core: string; halo: string },
): void {
  if (ramp <= 0.001) return;
  const radius = Math.max(0.25, Math.round(disc.r * 4) / 4);
  const ratio = Math.max(1, dpr);
  const core = ink?.core ?? tokens.indigo;
  const halo = ink?.halo ?? tokens.indigoBright;
  const key = `${radius}:${strength}:${ratio}:${core}:${halo}:${tokens.nodeBloomBlurPx}:${tokens.nodeBloomAlpha}`;
  let cache = stamps.get(ctx);
  if (!cache) { cache = new Map(); stamps.set(ctx, cache); }
  let stamp = cache.get(key);
  if (!stamp) {
    // Canvas shadowBlur is device-space, independent of the current transform.
    const half = Math.ceil(radius * 1.05 + tokens.nodeBloomBlurPx * strength * 2 / ratio + 2);
    const size = half * 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.ceil(size * ratio);
    const offscreen = canvas.getContext('2d');
    if (!offscreen) return;
    offscreen.scale(ratio, ratio);
    drawNodeBloom(offscreen, { x: half, y: half, r: radius }, strength, tokens, { core, halo });
    stamp = { canvas, half, size };
    if (cache.size >= MAX_STAMPS) cache.delete(cache.keys().next().value!);
    cache.set(key, stamp);
  }
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * Math.min(1, ramp);
  ctx.drawImage(stamp.canvas, disc.x - stamp.half, disc.y - stamp.half, stamp.size, stamp.size);
  ctx.globalAlpha = alpha;
}
