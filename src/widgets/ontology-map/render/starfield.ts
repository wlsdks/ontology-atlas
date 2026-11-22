/**
 * Colour-gate exemption (`ALLOWLIST` in `scripts/design/check-no-raw-color.mjs`): `rgba(236,236,240,...)`
 * feeds `ctx.fillStyle`, which cannot resolve `var(--...)`, and alpha is per star per frame.
 * Do not add colours here. Magnitude ranking is computed upstream and passed as `isBrightStar`.
 */

export interface DustPoint {
  /** Parallax depth in [dustParallaxMin, dustParallaxMax]: drifts slower than the grid's 1:1, a purely geometric depth cue. */
  depth: number;
  x: number;
  y: number;
  r: number;
  alpha: number;
}

/** The dust point count target, `round(width * height / areaPerPoint)` (`--map-dust-area-per-point`); placement is seeded and lives in `buildDustPoints()`. */
export function computeStarDustCount(
  viewportWidth: number,
  viewportHeight: number,
  areaPerPoint: number,
): number {
  return Math.round((viewportWidth * viewportHeight) / areaPerPoint);
}

/** A tiny deterministic PRNG, used only to place dust points (never node positions). */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded (`seed=7`, never re-seeded) dust point placement. */
export function buildDustPoints(
  viewportWidth: number,
  viewportHeight: number,
  count: number,
  depthMin = 0.15,
  depthMax = 0.45,
): DustPoint[] {
  const rng = mulberry32(7);
  const points: DustPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    points.push({
      x: rng() * viewportWidth,
      y: rng() * viewportHeight,
      r: 0.4 + rng() * 0.7,
      alpha: 0.02 + rng() * 0.04,
      // depth draws from the same seeded rng, preserving this function's determinism.
      depth: depthMin + rng() * (depthMax - depthMin),
    });
  }
  return points;
}


export function buildRealmStarPoints(
  viewportWidth: number,
  viewportHeight: number,
  count: number,
): DustPoint[] {
  const rng = mulberry32(11);
  const points: DustPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    points.push({
      x: rng() * viewportWidth,
      y: rng() * viewportHeight,
      r: 0.4 + rng() * 0.7,
      // Alpha ceiling 0.12 ("never busy"), range [0.04, 0.12).
      alpha: 0.04 + rng() * 0.08,
      depth: i % 2 === 0 ? 0.3 : 0.6,
    });
  }
  return points;
}

export interface RealmStarDrawState {
  points: readonly DustPoint[];
  originX: number;
  originY: number;
  /** The ward circle in screen space. Dots are drawn **inside** it only. */
  clip: { cx: number; cy: number; radius: number };
  devicePixelRatio: number;
  /** Radial parallax fall at the moment of expansion, 0..1; 0 at rest. */
  radialParallax?: number;
  /** Reduced motion: zero parallax, static density only. */
  reducedMotion?: boolean;
}


export function drawRealmStars(ctx: CanvasRenderingContext2D, state: RealmStarDrawState): void {
  const { points, clip, devicePixelRatio } = state;
  if (clip.radius <= 0 || points.length === 0) return;
  const reduced = state.reducedMotion === true;
  const ox = reduced ? 0 : state.originX;
  const oy = reduced ? 0 : state.originY;
  const w = ctx.canvas.width / devicePixelRatio;
  const h = ctx.canvas.height / devicePixelRatio;
  const rp = reduced ? 0 : state.radialParallax ?? 0;
  const maxShift = Math.min(w, h) * 0.03;
  ctx.save();
  ctx.beginPath();
  ctx.arc(clip.cx * devicePixelRatio, clip.cy * devicePixelRatio, clip.radius * devicePixelRatio, 0, Math.PI * 2);
  ctx.clip();
  points.forEach((point) => {
    let px = w > 0 ? (((point.x + ox * point.depth) % w) + w) % w : point.x;
    let py = h > 0 ? (((point.y + oy * point.depth) % h) + h) % h : point.y;
    if (rp > 0) {
      const dx = px - w / 2;
      const dy = py - h / 2;
      const d = Math.hypot(dx, dy) || 1;
      const shift = rp * maxShift * point.depth;
      px += (dx / d) * shift;
      py += (dy / d) * shift;
    }
    ctx.beginPath();
    ctx.fillStyle = `rgba(236,236,240,${point.alpha})`;
    ctx.arc(px * devicePixelRatio, py * devicePixelRatio, point.r * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

export interface StarDustDrawState {
  points: readonly DustPoint[];
  originX?: number;
  originY?: number;
  farT: number;
  devicePixelRatio: number;
  /** View-bounded visibility lift; defaults to the established far-field level. */
  opacityScale?: number;
  /** Radial parallax fall at realm expansion, 0..1: points push outward from screen centre in proportion to depth, within 3% of the screen, and return to 0 after the transition. */
  radialParallax?: number;
}

/* Per-point fillStyle string cache, rebuilt only when the points array reference or farT changes. */
let dustStyleSourcePoints: readonly DustPoint[] | null = null;
let dustStyleFarT = -1;
let dustStyleOpacityScale = -1;
let dustStyles: string[] = [];

export function drawStarDust(ctx: CanvasRenderingContext2D, state: StarDustDrawState): void {
  if (state.farT <= 0.02) return;
  const { points, farT, devicePixelRatio } = state;
  const opacityScale = Math.max(0, state.opacityScale ?? 1);
  const ox = state.originX ?? 0;
  const oy = state.originY ?? 0;
  // Each point follows the camera in proportion to its depth, slower than the grid; viewport wrapping keeps coverage over a long pan.
  const w = ctx.canvas.width / devicePixelRatio;
  const h = ctx.canvas.height / devicePixelRatio;
  const rp = state.radialParallax ?? 0;
  const maxShift = Math.min(w, h) * 0.03;
  if (dustStyleSourcePoints !== points || dustStyleFarT !== farT || dustStyleOpacityScale !== opacityScale) {
    dustStyleSourcePoints = points;
    dustStyleFarT = farT;
    dustStyleOpacityScale = opacityScale;
    dustStyles = points.map((point) => `rgba(236,236,240,${Math.min(1, point.alpha * farT * opacityScale)})`);
  }
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    let px = w > 0 ? (((point.x + ox * point.depth) % w) + w) % w : point.x;
    let py = h > 0 ? (((point.y + oy * point.depth) % h) + h) % h : point.y;
    if (rp > 0) {
      const dx = px - w / 2;
      const dy = py - h / 2;
      const d = Math.hypot(dx, dy) || 1;
      const shift = rp * maxShift * point.depth;
      px += (dx / d) * shift;
      py += (dy / d) * shift;
    }
    ctx.beginPath();
    ctx.fillStyle = dustStyles[i];
    ctx.arc(px * devicePixelRatio, py * devicePixelRatio, point.r * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
  }
}

export { drawDiffractionSpike } from "@/shared/lib/map-canvas/diffraction-spike";
