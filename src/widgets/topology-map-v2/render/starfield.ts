/**
 * ⚠️ Colour-gate exemption (the `ALLOWLIST` in `scripts/check-no-raw-color.mjs`,
 * 2026-08-04). This file's `rgba(236,236,240,…)` is a string consumed directly by
 * `ctx.fillStyle`: a canvas 2D context has no cascade, so it cannot resolve
 * `var(--…)`, and the alpha is recomputed per star per frame, so it cannot fold
 * into one token either. It looks white but is not exactly r=g=b, so it misses
 * the automatic greyscale exemption too. Do not add new colours here — if one is
 * unavoidable, record why alongside it.
 *
 * Far-field star-dust texture + diffraction spikes — ported from the B2+
 * prototype's `buildStarDust()`/`drawSpike()`
 * (`docs/prototypes/topology-b2plus.html` §8, §12).
 *
 * Both are far-field-only "magnitude = brightness" overlays (B1 constellation
 * DNA, design doc §1.1): dust is a static, near-invisible texture that never
 * re-seeds per frame (so it never reads as noise); diffraction spikes are a
 * crisp 4-point overlay drawn only on the top-`starCount` nodes by
 * `magnitude` (`count + degree*18`, prototype `computeMagnitude()` —
 * magnitude ranking itself is NOT this module's job, it's a graph-data
 * derivation the adapter/HomePage layer computes once and passes in as
 * `isBrightStar` per node).
 *
 * Zero React imports — pure Canvas 2D drawing plus one extractable pure
 * helper (`computeStarDustCount`, unit-tested in `starfield.test.ts`).
 */

export interface DustPoint {
  /**
   * Parallax depth in [dustParallaxMin, dustParallaxMax]. A purely geometric
   * depth cue that drifts slower than the grid's 1:1 — a second layer of "moving
   * over a world", with no glow or blur.
   */
  depth: number;
  x: number;
  y: number;
  r: number;
  alpha: number;
}

/**
 * `Math.round(viewportWidth * viewportHeight / areaPerPoint)` — the dust
 * point count target. `areaPerPoint` = `--topology-v2-dust-area-per-point`
 * (5200 px²). Actual point placement is seeded (`mulberry32(7)` in the
 * prototype) and therefore NOT pure with respect to this function alone —
 * placement lives in `buildDustPoints()` below, this helper only pins the count.
 */
export function computeStarDustCount(
  viewportWidth: number,
  viewportHeight: number,
  areaPerPoint: number,
): number {
  return Math.round((viewportWidth * viewportHeight) / areaPerPoint);
}

/** Prototype `mulberry32()` — a tiny deterministic PRNG, used only to place dust points (never node positions). */
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

/** `--topology-v2-dust-area-per-point`-seeded (`seed=7` in the prototype, fixed and never re-seeded) point placement — ported from `buildStarDust()`. */
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

/**
 * Two denser dot layers (depths 0.3 and 0.6) that turn the space **inside** the
 * ward into cosmos while realm expansion is active. Denser than the
 * dust and capped at alpha 0.12, greyscale — depth comes from plain dots, never
 * glow or blur. Fixing depth to exactly two values makes the two planes drift at
 * different speeds under camera pan/zoom, so the parallax responds to input.
 * Deterministic (fixed seed).
 */
export function buildRealmCosmosPoints(
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
      // Alpha ceiling 0.12 — the charter's "never busy". Range [0.04, 0.12).
      alpha: 0.04 + rng() * 0.08,
      // Two depth layers (0.3 / 0.6) — two parallax planes.
      depth: i % 2 === 0 ? 0.3 : 0.6,
    });
  }
  return points;
}

export interface RealmCosmosDrawState {
  points: readonly DustPoint[];
  /** Screen coordinates of the camera origin — the same parallax source the dust uses. */
  originX: number;
  originY: number;
  /** The ward circle in screen space. Dots are drawn **inside** it only. */
  clip: { cx: number; cy: number; radius: number };
  devicePixelRatio: number;
  /** Radial parallax fall at the moment of expansion, 0..1; 0 at rest. */
  radialParallax?: number;
  /** reduced-motion: zero parallax (no origin or radial offset) — static density only. */
  reducedMotion?: boolean;
}

/**
 * The cosmos dots inside the ward — clipped to the ward circle, with the two
 * layers drifting at different speeds via camera-origin depth parallax. No
 * continuous animation: an unchanged origin means unmoving dots, which is what
 * keeps the idle condition satisfied. No farT condition either, since the realm
 * lives at circuit altitude.
 */
export function drawRealmCosmos(ctx: CanvasRenderingContext2D, state: RealmCosmosDrawState): void {
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
  // Clip to the ward circle — cosmos inside only, so it reads as a different space.
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
  /** Screen coordinates of the camera origin — the parallax reference, same source as the grid. */
  originX?: number;
  originY?: number;
  farT: number;
  devicePixelRatio: number;
  /**
   * Radial parallax fall at the moment of realm expansion, 0..1 — each point is
   * pushed outward from screen centre in proportion to its depth, reading as
   * movement through space. Displacement stays within 3% of the screen (the
   * charter's "never busy") and returns to 0 after the transition; it never
   * persists.
   */
  radialParallax?: number;
}

/*
 * perf 2026-08-19 — per-point fillStyle string cache. The alpha differs per point
 * (`point.alpha * farT`), but for the **same point array and the same farT** the
 * identical strings were being rebuilt every frame — hundreds of points per
 * viewport × 60fps of string allocation and parsing. A change to the array
 * reference or to farT rebuilds the whole cache; the string values are identical,
 * so the pixels are too.
 */
let dustStyleSourcePoints: readonly DustPoint[] | null = null;
let dustStyleFarT = -1;
let dustStyles: string[] = [];

/** Draws the static dust texture, fading in with `farT` (never fully at circuit altitude). */
export function drawStarDust(ctx: CanvasRenderingContext2D, state: StarDustDrawState): void {
  if (state.farT <= 0.02) return;
  const { points, farT, devicePixelRatio } = state;
  const ox = state.originX ?? 0;
  const oy = state.originY ?? 0;
  // Parallax: each point follows the camera in proportion to its depth, slower
  // than the grid's 1.0. Viewport wrapping keeps coverage, so the dust survives a
  // long pan.
  const w = ctx.canvas.width / devicePixelRatio;
  const h = ctx.canvas.height / devicePixelRatio;
  const rp = state.radialParallax ?? 0;
  const maxShift = Math.min(w, h) * 0.03;
  if (dustStyleSourcePoints !== points || dustStyleFarT !== farT) {
    dustStyleSourcePoints = points;
    dustStyleFarT = farT;
    dustStyles = points.map((point) => `rgba(236,236,240,${point.alpha * farT})`);
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

export interface DiffractionSpikeDrawState {
  screenX: number;
  screenY: number;
  /** Node's own screen-space draw radius — spike arm lengths scale off this (`r*2.6`/`r*1.5`). */
  screenRadius: number;
  color: string;
  /** farT-gated — spike is invisible at farT<=0.02, fully present by farT=1 (prototype: `alpha = farT`). */
  alpha: number;
}

/** Draws one crisp 4-point diffraction spike — solid tapering slivers, no gradient/blur/glow. */
export function drawDiffractionSpike(ctx: CanvasRenderingContext2D, state: DiffractionSpikeDrawState): void {
  if (state.alpha <= 0.01) return;
  const { screenX: cx, screenY: cy, screenRadius: r, color, alpha } = state;
  const long = r * 2.6;
  const short = r * 1.5;
  const baseW = Math.max(0.6, r * 0.09);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(cx, cy - long);
  ctx.lineTo(cx + baseW, cy);
  ctx.lineTo(cx, cy + long);
  ctx.lineTo(cx - baseW, cy);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - short, cy);
  ctx.lineTo(cx, cy - baseW);
  ctx.lineTo(cx + short, cy);
  ctx.lineTo(cx, cy + baseW);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
