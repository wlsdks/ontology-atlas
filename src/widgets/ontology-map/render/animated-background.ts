/**
 * The proximity constellation is the only background; line or shape forms compete with the data.
 * It owns no timer: it multiplies `ambientFactor` (`model/ambient/ambient-sleep.ts`), so it stops at idle.
 * Under reduced motion it runs `SETTLE_STEPS` frames to a still image, not a blank canvas.
 */

/** Cursor response radius, px — beyond it the background is completely still. */
const CURSOR_RADIUS = 220;

/** Seed density (px² per seed) — sparse, because links are drawn O(n²). */
const AREA_PER_SEED = 26_000;

/** Maximum distance a link spans, px. */
const WEB_LINK_RADIUS = 110;

/** Frames pre-rolled at mount to reach the still image used under reduced-motion. */
const SETTLE_STEPS = 90;

/** Per-frame dt ceiling, ms — stops the seeds jumping in one frame after a tab returns. */
const MAX_STEP_MS = 50;

export type AnimatedBackgroundVariant = "web";

export interface AnimatedBackgroundTokens {
  /** `--canvas-bg-ink-max` — the alpha ceiling no background may exceed. */
  inkMax: number;
  /** Background ink RGB without alpha, e.g. `"150, 165, 220"`. */
  particleRgb: string;
}

interface AnimatedBackgroundStepArgs {
  width: number;
  height: number;
  dpr: number;
  /** Screen coordinates of the camera origin; the frame-to-frame delta creates the parallax. */
  originX: number;
  originY: number;
  /** Ambient sleep factor [0,1]. At 0 nothing steps and the last frame stays. */
  ambientFactor: number;
  /** Cursor position in screen coordinates; null when outside the canvas. */
  pointerX: number | null;
  pointerY: number | null;
  dtMs: number;
  reducedMotion: boolean;
}

interface Seed {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Cursor proximity 0..1: 0 outside the radius, 1 at the centre, quadratic between. */
function cursorFalloff(
  x: number,
  y: number,
  px: number | null,
  py: number | null,
  radius: number = CURSOR_RADIUS,
): number {
  if (px === null || py === null || radius <= 0) return 0;
  const d = Math.hypot(x - px, y - py);
  if (d >= radius) return 0;
  const t = 1 - d / radius;
  return t * t;
}

/** Population proportional to area — at least 1, capped to protect both low-end and ultra-wide screens. */
function populationFor(width: number, height: number, areaPer: number, cap: number): number {
  if (width <= 0 || height <= 0 || areaPer <= 0) return 0;
  return Math.max(1, Math.min(cap, Math.round((width * height) / areaPer)));
}

export interface AnimatedBackground {
  readonly variant: AnimatedBackgroundVariant;
  step(args: AnimatedBackgroundStepArgs): void;
  /** Composite the buffer onto the target context, in CSS pixel coordinates. */
  paint(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  dispose(): void;
}

/** Builds the constellation state and its offscreen buffer; tests under jsdom inject `createCanvas`. */
export function createAnimatedBackground(
  variant: AnimatedBackgroundVariant,
  tokens: AnimatedBackgroundTokens,
  createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): AnimatedBackground {
  const buffer = createCanvas();
  let bctx = buffer.getContext("2d");
  let bw = 0;
  let bh = 0;
  let bdpr = 1;
  let seeds: Seed[] = [];
  let prevOriginX: number | null = null;
  let prevOriginY: number | null = null;
  let settled = false;

  const baseAlpha = Math.min(tokens.inkMax * 0.7, 0.055);
  const hotAlpha = tokens.inkMax;

  const reseed = (): void => {
    seeds = Array.from({ length: populationFor(bw, bh, AREA_PER_SEED, 140) }, () => ({
      x: Math.random() * bw,
      y: Math.random() * bh,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
    }));
    settled = false;
  };

  const ensureSize = (width: number, height: number, dpr: number): void => {
    if (bw === width && bh === height && bdpr === dpr) return;
    bw = width;
    bh = height;
    bdpr = dpr;
    buffer.width = Math.max(1, Math.round(width * dpr));
    buffer.height = Math.max(1, Math.round(height * dpr));
    bctx = buffer.getContext("2d");
    bctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    reseed();
  };

  /** Shifts the seeds by the camera delta. The trail buffer is not blitted along: it clears every frame, so no hard edge follows a large move. */
  const shift = (dx: number, dy: number): void => {
    if (dx === 0 && dy === 0) return;
    for (const s of seeds) {
      s.x += dx;
      s.y += dy;
    }
  };

  const stepWeb = (ctx: CanvasRenderingContext2D, a: AnimatedBackgroundStepArgs, speed: number): void => {
    ctx.clearRect(0, 0, bw, bh);
    for (const s of seeds) {
      s.x += s.vx * speed;
      s.y += s.vy * speed;
      if (s.x < 0 || s.x > bw) s.vx *= -1;
      if (s.y < 0 || s.y > bh) s.vy *= -1;
      const k = cursorFalloff(s.x, s.y, a.pointerX, a.pointerY);
      if (k > 0 && a.pointerX !== null && a.pointerY !== null) {
        s.x += (a.pointerX - s.x) * 0.004 * k;
        s.y += (a.pointerY - s.y) * 0.004 * k;
      }
      ctx.fillStyle = `rgba(${tokens.particleRgb}, ${baseAlpha * 2.6 + k * hotAlpha * 4})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1 + k * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < seeds.length; i += 1) {
      for (let j = i + 1; j < seeds.length; j += 1) {
        const p = seeds[i];
        const q = seeds[j];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d > WEB_LINK_RADIUS) continue;
        const k = Math.max(
          cursorFalloff(p.x, p.y, a.pointerX, a.pointerY),
          cursorFalloff(q.x, q.y, a.pointerX, a.pointerY),
        );
        ctx.strokeStyle = `rgba(${tokens.particleRgb}, ${(1 - d / WEB_LINK_RADIUS) * baseAlpha * 1.8 + k * hotAlpha * 2})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }
  };

  return {
    variant,
    step(a) {
      ensureSize(a.width, a.height, a.dpr);
      const ctx = bctx;
      if (!ctx || bw <= 0 || bh <= 0) return;

      const dx = prevOriginX === null ? 0 : a.originX - prevOriginX;
      const dy = prevOriginY === null ? 0 : a.originY - prevOriginY;
      prevOriginX = a.originX;
      prevOriginY = a.originY;
      shift(dx, dy);

      if (a.reducedMotion) {
        if (settled) return;
        for (let i = 0; i < SETTLE_STEPS; i += 1) {
          stepWeb(ctx, { ...a, pointerX: null, pointerY: null }, 1);
        }
        settled = true;
        return;
      }

      if (a.ambientFactor <= 0) return;
      const dt = Math.min(MAX_STEP_MS, Math.max(0, a.dtMs)) / 16.667;
      stepWeb(ctx, a, a.ambientFactor * dt);
    },
    paint(ctx, width, height) {
      if (bw <= 0 || bh <= 0) return;
      ctx.drawImage(buffer, 0, 0, width, height);
    },
    dispose() {
      buffer.width = 0;
      buffer.height = 0;
      seeds = [];
      bctx = null;
    },
  };
}
