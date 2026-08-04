/**
 * ⚠️ 색 게이트 예외 (`scripts/check-no-raw-color.mjs` 의 `ALLOWLIST`, 2026-08-04).
 * 이 파일의 `rgba(236,236,240,…)` 는 `ctx.fillStyle` 이 직접 먹는 문자열이다 —
 * 캔버스 2D 컨텍스트에는 캐스케이드가 없어서 `var(--…)` 를 해석하지 못하고,
 * 알파는 별마다 프레임마다 계산되므로 토큰 하나로 접히지도 않는다. 값이 눈에는
 * 흰색이지만 정확히 r=g=b 가 아니라 자동 무채색 면제에도 안 걸린다. 새 색을
 * 여기 더하지 말 것 — 더해야 하면 그 이유를 여기에 같이 적는다.
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

/**
 * S8 결함 6 — "영역 전개" active 중 결계 **안**을 우주로 만드는 밀도 상승 도트
 * 레이어 2장(깊이 0.3 / 0.6). dust 보다 촘촘하고, 알파는 ≤0.12(무채) — glow/blur
 * 없이 순수 도트로만 깊이감을 만든다. depth 를 두 값으로 고정해 카메라 팬/줌 시
 * 두 평면이 서로 다른 속도로 흘러 시차(입력 반응)를 만든다. 결정론(seed 고정).
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
      // 알파 상한 0.12(헌장: 어지럽지 않게) — [0.04, 0.12).
      alpha: 0.04 + rng() * 0.08,
      // 두 깊이 레이어(0.3 / 0.6) — 시차 평면 2장.
      depth: i % 2 === 0 ? 0.3 : 0.6,
    });
  }
  return points;
}

export interface RealmCosmosDrawState {
  points: readonly DustPoint[];
  /** 카메라 원점의 스크린 좌표 — dust 와 동일한 시차 소스(깊이 비례 흐름). */
  originX: number;
  originY: number;
  /** 결계 원(스크린 스페이스). 이 원 **안**에만 도트를 그린다 — 밖은 우주 아님. */
  clip: { cx: number; cy: number; radius: number };
  devicePixelRatio: number;
  /** S4 전개 순간의 방사 시차 낙하 0..1(유지). 정지 시 0. */
  radialParallax?: number;
  /** reduced-motion: 시차 0(원점/방사 오프셋 미적용) — 정적 밀도만. */
  reducedMotion?: boolean;
}

/**
 * 결계 안 우주 도트 — 결계 원으로 클립하고, 카메라 원점 기반 깊이 시차로
 * 두 레이어가 서로 다른 속도로 흐른다. 지속 애니메이션 없음(원점이 안 바뀌면
 * 도트도 안 움직인다 → idle gate 유지). farT 게이트 없음(영역은 circuit 고도).
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
  // 결계 원 클립 — 결계 안만 우주("여긴 다른 공간" 독법).
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
  /** 카메라 원점의 스크린 좌표 — 시차 오프셋의 기준 (grid 와 동일 소스). */
  originX?: number;
  originY?: number;
  farT: number;
  devicePixelRatio: number;
  /**
   * S4 영역 전개 순간의 방사 시차 낙하 0..1 — 각 점이 화면 중심에서 depth
   * 비례로 바깥으로 밀리며 "우주를 통과하는" 깊이감을 만든다. 이동량은
   * 화면의 3% 이내(헌장: 어지럽지 않게), 전환 후 0 으로 복귀(지속 금지).
   */
  radialParallax?: number;
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
  const rp = state.radialParallax ?? 0;
  const maxShift = Math.min(w, h) * 0.03;
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
