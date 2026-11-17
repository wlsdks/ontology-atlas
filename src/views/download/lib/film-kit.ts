/**
 * The page films' shared camera and light: a virtual camera eased between keyframes, one soft key
 * light that moves between subjects, and short rings that mark the beat of an action. Canvas 2D
 * only; every value is a pure function of the film's progress or clock, so a frame never jumps.
 */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeInOut = (v: number) => {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const easeOut = (v: number) => 1 - (1 - clamp01(v)) ** 3;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Where the camera looks (stage pixels) and how close it is; `zoom` 1 is the stage as laid out. */
export interface CameraShot {
  cx: number;
  cy: number;
  zoom: number;
}

/** A shot the camera reaches at progress `at` (0..1 of the whole film). */
export interface CameraKey extends CameraShot {
  at: number;
}

/**
 * The camera at progress `p`: eased between the keys around it, held before the first and after
 * the last. `creep` adds a slow push per unit of progress so no frame is ever quite still.
 */
export function cameraAt(keys: readonly CameraKey[], p: number, creep = 0): CameraShot {
  if (keys.length === 0) return { cx: 0, cy: 0, zoom: 1 };
  const bare = ({ cx, cy, zoom }: CameraKey): CameraShot => ({ cx, cy, zoom });
  let shot = bare(keys[0]!);
  if (p >= keys[keys.length - 1]!.at) shot = bare(keys[keys.length - 1]!);
  else {
    for (let i = 0; i < keys.length - 1; i += 1) {
      const a = keys[i]!;
      const b = keys[i + 1]!;
      if (p >= a.at && p < b.at) {
        const t = easeInOut((p - a.at) / Math.max(1e-6, b.at - a.at));
        shot = { cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), zoom: lerp(a.zoom, b.zoom, t) };
        break;
      }
    }
  }
  return { ...shot, zoom: shot.zoom * (1 + creep * p) };
}

/**
 * Applies a shot on top of the device-pixel transform: the shot's centre lands on the stage's
 * centre, scaled by `zoom`. `depth` below 1 moves a far layer less (0.4 far, 0.7 mid, 1 near).
 */
export function applyCamera(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  w: number,
  h: number,
  shot: CameraShot,
  depth = 1,
): void {
  const zoom = 1 + (shot.zoom - 1) * depth;
  const cx = lerp(w / 2, shot.cx, depth);
  const cy = lerp(h / 2, shot.cy, depth);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (w / 2 - cx * zoom), dpr * (h / 2 - cy * zoom));
}

/** Where a stage point lands on screen under a shot, for DOM or overlay text that must follow it. */
export function projectPoint(w: number, h: number, shot: CameraShot, x: number, y: number): { x: number; y: number } {
  return { x: w / 2 + (x - shot.cx) * shot.zoom, y: h / 2 + (y - shot.cy) * shot.zoom };
}

/** The key light: one radial sprite drawn once per colour and stamped, never a gradient per frame. */
export function lightSprite(color: string, size = 512): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

/** Stamps the key light; its alpha is capped so it reads as light on a subject, never a glow. */
export function drawKeyLight(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  const a = Math.min(0.16, alpha);
  if (a <= 0.004) return;
  ctx.globalAlpha = a;
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

/**
 * A halo under a mark that carries weight: the light sprite stamped at `radius`. Unlike the key
 * light its alpha is not capped, since it sits on one mark rather than washing a whole subject.
 */
export function drawHalo(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  if (alpha <= 0.004 || radius <= 0.5) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

/**
 * A beat: a 1px ring that grows from the mark and fades. `age` is milliseconds since the beat;
 * outside 0..`life` nothing is drawn, so a caller can keep a fixed list of beats and pass the clock.
 */
export function drawHitRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  age: number,
  color: string,
  { reach = 28, life = 320, from = 0 }: { reach?: number; life?: number; from?: number } = {},
): void {
  if (age < 0 || age > life) return;
  const t = easeOut(age / life);
  ctx.globalAlpha = 0.5 * (1 - t);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, from + reach * t, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A motion streak behind a flying mark, from where it was a moment ago to where it is. */
export function drawStreak(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  alpha = 0.35,
  width = 1,
): void {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
