/**
 * 캔버스 배경 세트 (Phase 5 #20, `docs/DESIGN-OVERHAUL-2026-07-25.md`) — 성좌·
 * 등고선 배경을 타일 패턴으로 한 번만 빌드한다(도트=기본은 `grid.ts` 의
 * blueprint grid 그대로). blueprint grid 와 동일한 문법: 오프스크린 타일 →
 * `createPattern` → `draw()` 가 카메라 원점으로 translate 해 시차. 정적이라
 * 프레임마다 재빌드하지 않는다(마운트/리사이즈 시 1회).
 *
 * 헌장: 정적·저대비·다크 단일. 잉크는 `--canvas-bg-*` 토큰(알파 ≤
 * `--canvas-bg-ink-max`). 움직이는 그라디언트/오로라/글로우 금지 — 배경은 항상
 * 데이터에 진다(Tufte). 별 배치는 **고정 시드** PRNG 라 세션/기기 간 동일.
 *
 * 순수 헬퍼(`seededStars`, `contourTileHeight`)만 유닛 테스트한다 — 타일
 * 자체는 실제 canvas 2D 컨텍스트가 필요해 jsdom 에서 의미 있게 검증 불가
 * (blueprint grid 의 `buildGridPattern` 선례와 동일).
 */

/** blueprint grid tile 과 같은 크기(120px 배수)라 세 배경이 같은 시차 격자에 앉는다. */
export const CONSTELLATION_TILE_PX = 240;
export const CONTOUR_TILE_PX = 240;

/** 고정 시드 — 세션/기기 간 동일한 성좌를 보장한다(#20 요구사항). */
const CONSTELLATION_SEED = 1337;
/** 저밀도: 타일 넓이당 별 하나 기준 면적(px²) — 클수록 성글다. */
const CONSTELLATION_AREA_PER_STAR = 3400;

export interface BackgroundBgTokens {
  /** `--canvas-bg-ink-max` — 어떤 배경도 넘지 못하는 알파 상한(문서화용 계약). */
  inkMax: number;
  /** `--canvas-bg-constellation-dim` — 성좌 어두운 별. */
  constellationDim: string;
  /** `--canvas-bg-constellation-bright` — 성좌 밝은 별. */
  constellationBright: string;
  /** `--canvas-bg-contour` — 등고선 곡선 잉크. */
  contour: string;
}

const CANVAS_BG_FALLBACK: BackgroundBgTokens = {
  inkMax: 0.08,
  constellationDim: "rgba(236, 236, 240, 0.03)",
  constellationBright: "rgba(236, 236, 240, 0.055)",
  contour: "rgba(120, 128, 160, 0.05)",
};

/**
 * `--canvas-bg-*` 토큰 리더 — 미선언 시 문서화된 기본값으로 폴백한다(배경은
 * 미적 레이어라 blueprint grid 처럼 하드 throw 하지 않는다; 값의 진실원은
 * `app/globals.css`, 이 폴백은 안전망일 뿐이다).
 */
export function readCanvasBgTokens(getPropertyValue: (name: string) => string): BackgroundBgTokens {
  const num = (name: string, fallback: number): number => {
    const raw = getPropertyValue(name).trim();
    const parsed = Number(raw);
    return raw === "" || Number.isNaN(parsed) ? fallback : parsed;
  };
  const str = (name: string, fallback: string): string => {
    const raw = getPropertyValue(name).trim();
    return raw === "" ? fallback : raw;
  };
  return {
    inkMax: num("--canvas-bg-ink-max", CANVAS_BG_FALLBACK.inkMax),
    constellationDim: str("--canvas-bg-constellation-dim", CANVAS_BG_FALLBACK.constellationDim),
    constellationBright: str("--canvas-bg-constellation-bright", CANVAS_BG_FALLBACK.constellationBright),
    contour: str("--canvas-bg-contour", CANVAS_BG_FALLBACK.contour),
  };
}

/** blueprint grid 의 `mulberry32` 와 같은 결정론 PRNG — 성좌 배치 전용(노드 좌표엔 절대 안 씀). */
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

export interface BgStar {
  x: number;
  y: number;
  /** 1~2px 반지름(2단계 크기). */
  r: number;
  /** true=밝은 별, false=어두운 별(밝기 2단계). */
  bright: boolean;
}

/**
 * 고정 시드로 타일 안 별들을 배치한다 — 같은 입력이면 항상 같은 배열(세션/기기
 * 불변). 1~2px 점, 밝기 2단계, 저밀도. 순수 함수(유닛 테스트 대상).
 */
export function seededStars(tileSize: number, areaPerStar: number, seed: number): BgStar[] {
  const count = Math.max(1, Math.round((tileSize * tileSize) / areaPerStar));
  const rng = mulberry32(seed);
  const stars: BgStar[] = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: rng() * tileSize,
      y: rng() * tileSize,
      r: rng() < 0.35 ? 1.4 : 0.8,
      bright: rng() < 0.4,
    });
  }
  return stars;
}

/**
 * 성좌 타일 패턴 — 고정 시드 별들을 한 번 그려 `createPattern("repeat")`.
 * 알파는 토큰 색(rgba)에 이미 담겨 있어 `draw()` 는 globalAlpha 1 로 얹는다.
 */
export function buildConstellationPattern(
  offscreenCanvas: HTMLCanvasElement,
  tokens: BackgroundBgTokens,
): CanvasPattern | null {
  const size = CONSTELLATION_TILE_PX;
  offscreenCanvas.width = size;
  offscreenCanvas.height = size;
  const ctx = offscreenCanvas.getContext("2d");
  if (!ctx) return null;
  // 타일은 투명 — 베이스 fill 은 `draw()` 가 이미 깔았다(별만 얹는다).
  ctx.clearRect(0, 0, size, size);
  for (const star of seededStars(size, CONSTELLATION_AREA_PER_STAR, CONSTELLATION_SEED)) {
    ctx.beginPath();
    ctx.fillStyle = star.bright ? tokens.constellationBright : tokens.constellationDim;
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  return ctx.createPattern(offscreenCanvas, "repeat");
}

/** 등고선 타일 안 곡선 개수 — 타일 높이를 균등 분할한 y-밴드 수. */
const CONTOUR_LINES_PER_TILE = 3;
/** 각 곡선의 사인 주기 개수(타일 폭에 정수배라 좌우 심리스). */
const CONTOUR_PERIODS = 2;
/** 사인 진폭(px) — 타일 높이 대비 완만하게. */
const CONTOUR_AMPLITUDE = 14;

/**
 * 등고선 타일 패턴 — 완만한 사인 곡선 여러 줄. 주기가 타일 폭의 정수배이고
 * 줄 간격이 타일 높이를 균등 분할하므로 상하좌우 심리스 반복(가시 seam 최소).
 * 저대비 곡선이 "지도(atlas)" 정체성을 만들되 절대 엣지로 읽히지 않게 옅다.
 */
export function buildContourPattern(
  offscreenCanvas: HTMLCanvasElement,
  tokens: BackgroundBgTokens,
): CanvasPattern | null {
  const size = CONTOUR_TILE_PX;
  offscreenCanvas.width = size;
  offscreenCanvas.height = size;
  const ctx = offscreenCanvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = tokens.contour;
  ctx.lineWidth = 1;
  const band = size / CONTOUR_LINES_PER_TILE;
  const omega = (CONTOUR_PERIODS * 2 * Math.PI) / size;
  for (let line = 0; line < CONTOUR_LINES_PER_TILE; line += 1) {
    const baseY = band * line + band / 2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 2) {
      // 위상 오프셋을 줄마다 달리해 "등고선 지형"처럼 층이 보이게.
      const y = baseY + CONTOUR_AMPLITUDE * Math.sin(omega * x + line * 1.3);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return ctx.createPattern(offscreenCanvas, "repeat");
}
