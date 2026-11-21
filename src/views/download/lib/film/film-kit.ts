export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeInOut = (v: number) => {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const easeOut = (v: number) => 1 - (1 - clamp01(v)) ** 3;
/** The gentlest travel: its top speed is half the cubic's, for the long flights. */
export const easeInOutSine = (v: number) => (1 - Math.cos(Math.PI * clamp01(v))) / 2;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** An edgeless falloff, the product's cluster light: a Gaussian sampled densely enough not to band. */
export const LIGHT_STOPS: readonly (readonly [number, number])[] = Array.from({ length: 13 }, (_, i) => {
  const t = i / 12;
  return [t, Math.exp(-4.2 * t * t) * (1 - t)] as const;
});

function channels(ctx: CanvasRenderingContext2D, color: string): string {
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  const value = String(ctx.fillStyle);
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }
  const rgb = /rgba?\(([^)]+)\)/i.exec(value);
  return rgb ? rgb[1]!.split(',').slice(0, 3).join(',') : '0, 0, 0';
}

export function lightSprite(color: string, size = 256): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;
  const rgb = channels(ctx, color);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, alpha] of LIGHT_STOPS) g.addColorStop(at, `rgba(${rgb}, ${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}
