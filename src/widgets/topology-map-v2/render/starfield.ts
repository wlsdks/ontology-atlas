/**
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
   * B3 잔여 — 시차 깊이 [dustParallaxMin, dustParallaxMax]. 그리드(1:1)보다
   * 느리게 흐르는 순수 기하학적 깊이 단서 — glow/blur 없이 "월드 위를
   * 움직인다"는 감각의 두 번째 레이어.
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
      // C-1 (Guardian) — depth 도 같은 seed rng: 이 함수의 결정론 계약 유지.
      depth: depthMin + rng() * (depthMax - depthMin),
    });
  }
  return points;
}

export interface StarDustDrawState {
  points: readonly DustPoint[];
  /** 카메라 원점의 스크린 좌표 — 시차 오프셋의 기준 (grid 와 동일 소스). */
  originX?: number;
  originY?: number;
  farT: number;
  devicePixelRatio: number;
}

/** Draws the static dust texture, fading in with `farT` (never fully at circuit altitude). */
export function drawStarDust(ctx: CanvasRenderingContext2D, state: StarDustDrawState): void {
  if (state.farT <= 0.02) return;
  const { points, farT, devicePixelRatio } = state;
  const ox = state.originX ?? 0;
  const oy = state.originY ?? 0;
  // 시차: 각 점이 depth 비율만큼 카메라를 따라 흐른다 (그리드=1.0 보다
  // 느림). 뷰포트 래핑으로 커버리지 유지 — 멀리 패닝해도 먼지는 남는다.
  const w = ctx.canvas.width / devicePixelRatio;
  const h = ctx.canvas.height / devicePixelRatio;
  points.forEach((point) => {
    const px = w > 0 ? (((point.x + ox * point.depth) % w) + w) % w : point.x;
    const py = h > 0 ? (((point.y + oy * point.depth) % h) + h) % h : point.y;
    ctx.beginPath();
    ctx.fillStyle = `rgba(236,236,240,${point.alpha * farT})`;
    ctx.arc(px * devicePixelRatio, py * devicePixelRatio, point.r * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
  });
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
