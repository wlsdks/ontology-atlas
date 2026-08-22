/**
 * Edge (trace) geometry + paint — ported from the B2+ prototype's
 * `buildEdges()`/`bezierPoint()`/`drawEdge()`/`drawPulses()`
 * (`docs/prototypes/topology-b2plus.html` §5, §12-13).
 *
 * "Board-router feel" (design doc's phrase): every `contains`/`depends`
 * bow is precomputed once from real polar geometry, so it never re-routes —
 * only its rendered width/color/dash thins toward hairlines as `farT → 1`.
 * `depends` edges additionally carry a one-shot "signal pulse" on hover
 * (`model/focus-state.ts#scheduleRipple` triggers it) plus an ambient
 * "comet tail" that drifts along the curve continuously
 * (`updateParticles()`'s `e.t += dt*0.075`).
 *
 * Zero React imports — pure Canvas 2D drawing plus one extractable pure
 * geometry helper (`computeBowControlPoint`, unit-tested in `traces.test.ts`
 * without a canvas).
 */

export interface Point {
  x: number;
  y: number;
}

function polarOf(p: Point): { r: number; angle: number } {
  return { r: Math.hypot(p.x, p.y), angle: Math.atan2(p.y, p.x) };
}

/**
 * Quadratic-bezier control point for one edge, ported from `buildEdges()`.
 * The control point is pulled from the segment midpoint toward whichever
 * endpoint is closer to the shared origin (world center), at that
 * endpoint's angle, capped to `maxBow` and scaled by `blend`:
 *
 * ```
 * innerR    = min(|a|, |b|)                      // polar radius from origin
 * farAngle  = angle of whichever of a/b is farther from origin
 * cpFull    = (cos(farAngle)*innerR, sin(farAngle)*innerR)
 * mid       = (a+b)/2
 * v         = cpFull - mid
 * capped    = min(|v|, maxBow)
 * controlPt = mid + normalize(v) * capped * blend
 * ```
 *
 * @param maxBow `--topology-v2-edge-bow-contains` (70) or `-depends` (92)
 * @param blend `--topology-v2-edge-blend-contains` (0.46) or `-depends` (0.62)
 */
export function computeBowControlPoint(a: Point, b: Point, maxBow: number, blend: number): Point {
  const pa = polarOf(a);
  const pb = polarOf(b);
  const innerIsA = pa.r <= pb.r;
  const innerR = innerIsA ? pa.r : pb.r;
  const farAngle = innerIsA ? pb.angle : pa.angle;
  const cpFull = { x: Math.cos(farAngle) * innerR, y: Math.sin(farAngle) * innerR };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const vx = cpFull.x - mid.x;
  const vy = cpFull.y - mid.y;
  const vlen = Math.sqrt(vx * vx + vy * vy) || 1;
  const capped = Math.min(vlen, maxBow);
  return {
    x: mid.x + (vx / vlen) * capped * blend,
    y: mid.y + (vy / vlen) * capped * blend,
  };
}

/**
 * B8 — `depends` 전용 활: 진행 방향의 왼쪽 수직 오프셋.
 *
 * 기존 극좌표 활(`computeBowControlPoint`)은 "부모 링을 향해 휜다"는
 * 동심원 레이아웃 의미를 가정한다 — containment 에는 여전히 참이지만,
 * 드래그/force 이후의 peer 관계(depends)에서는 인접 엣지가 서로 반대로
 * 휘는 데 아무 의미가 없었다(Guardian 실측: 어떤 긴 엣지는 휘고 어떤 건
 * 직선). 일관된 좌측 수직 활은 방향의 함수라서 A→B 와 B→A 상호 의존이
 * 자연히 두 개의 호로 분리된다 (이전엔 정확히 겹쳐 한 가닥).
 */
export function computeDependsBowControlPoint(a: Point, b: Point, maxBow: number): Point {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(len * 0.12, maxBow);
  // 진행 방향의 왼쪽 법선 (-dy, dx)/len
  return { x: mx + (-dy / len) * bow, y: my + (dx / len) * bow };
}

/** Point at parameter `t` (0..1) along the quadratic bezier `p0 -> p1(control) -> p2`. */
export function bezierPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export interface TraceDrawState {
  /** Screen-space endpoints/control point — the caller converts world coordinates first. */
  a: Point;
  b: Point;
  control: Point;
  relationType: "contains" | "depends";
  /**
   * 이 관계에 **방향이 있는가**(`shared/lib/ontology-tree/relations#isDirectionalRelation`).
   * `relationType === "depends"` 는 containment 가 아닌 것 **전부**를 담는
   * 2치 분류라, 그 안에 대칭 관계(`related_to`)까지 섞여 있다. 방향 테이퍼
   * (source 굵 → target 얇)는 방향이 실재할 때만 그린다 — 대칭 관계는
   * **균일 굵기**로, 양끝이 대등하다는 사실을 그대로 인코딩한다.
   *
   * 생략 시 `true`(종전 렌더). 모르는 타입이 조용히 대칭으로 강등되지 않는다.
   */
  directional?: boolean;
  egoState: "ego" | "dim" | "normal";
  farT: number;
  /** 0..1 progress of the ambient comet-tail / pulse position along the curve, `depends` edges only. */
  t: number;
  /**
   * True for the single ego edge the user is hovering in the detail panel's
   * "연결된 노드" list — an extra "emphasis ripple" over the ego brightening so
   * the panel row and this edge read as one (lead spec §4). Ignored unless
   * `egoState === "ego"`.
   */
  emphasized?: boolean;
  /**
   * 엣지 선택(페어 포커스) — 인디고 pale 램프의 전용 스트로크로 그린다.
   * 노드 선택(표준 인디고)과 같은 계열이되 값이 달라 한눈에 구분된다
   * (채색 시스템 증식 없음 — 헌장 준수).
   */
  selected?: boolean;
  /**
   * P3a — containment 잉크 레벨 (0 뼈대 · 1 중간 · 2 잔가지). contains 의
   * 비-ego 렌더에서만 소비: stroke 는 레벨별 토큰, width 는 레벨 계수.
   * depends/ego/dim 경로는 기존 그대로 (타입·주의 채널은 램프와 직교).
   */
  level?: 0 | 1 | 2;
  /** 3D 보기 — 선 굵기 배수(깊이 감쇠). 생략 시 1 (2D 동일). */
  widthScale?: number;
  /**
   * 3D 보기 — **깊이 헤일로**. 잉크를 긋기 직전에 같은 곡선을 캔버스 바탕색으로
   * 조금 더 굵게 한 번 그어, 뒤에 이미 그려진 것을 그 폭만큼 잘라 낸다.
   * 근거·값·왜 glow 가 아닌지: `model/dome-view.ts` 의 `domeHaloPx`
   * (Everts et al. 2009, IEEE TVCG 15(6)).
   *
   * `px` 는 **반폭(화면 px)** 이고 `alpha` 는 그 자리의 최종 불투명도다 —
   * 호출부가 깊이와 그 선의 알파를 함께 보고 계산해 넘긴다. 생략/`null` = 2D
   * 동일(획 0개 추가).
   */
  halo?: { color: string; px: number; alpha: number } | null;
  /**
   * `prefers-reduced-motion: reduce`. The comet tail is the one moving mark
   * this module paints, so honouring the preference here is what keeps the
   * canvas fully static for those users (audit A8: the tail was the largest
   * of five uncovered motion sources).
   */
  reducedMotion?: boolean;
  /**
   * Design Guardian 승인 처방 E — 선택(ego) 시 인시던트 `contains` 엣지 코멧
   * 흐름의 게이트. `egoState === "ego"`인 contains 엣지 중, 캐퍼(`render/
   * edge-fireflies.ts#selectEgoContainsComets`, seed 순 상위 24개)를 통과한
   * 엣지만 true — 캡 밖 엣지는 파티클 없이 기존 ego 밝기(본체 stroke)만
   * 유지한다. `depends` 엣지는 이 필드를 쓰지 않는다(항상 기존 규칙).
   */
  containsCometEligible?: boolean;
  /**
   * 상시 앰비언트 `depends` 코멧의 캡 통과 여부. 형제 갈래(contains)의
   * `containsCometEligible` 과 같은 문법 — false 면 파티클 없이 본체 파선만
   * 그린다. 생략 시 `true`(캡 없던 종전 동작)라 호출부가 캡을 안 넘겨도
   * 회귀하지 않는다.
   */
  dependsCometEligible?: boolean;
  /**
   * 「걸어온 길」 렌즈 세기 0..1 — 이 관계선을 **연달아 밟았을 때만** 0 이 아니다.
   *
   * 왜 필요한가(2026-08-02 소유자 실보고 *"노란색으로 선까지 다?"*): 렌즈가
   * 켜지면 이 파일은 모든 엣지를 `dim` 으로 그렸다. 방문 노드 옆에는 발자국이
   * 찍히는데 **그 사이를 이은 선은 배경과 같은 잉크**라, 「걸어온 길」인데
   * 길이 안 보였다.
   *
   * 새 hue 를 여는 것이 아니다 — 색은 호출부가 `edgeTrail` 로 넘기는 **발자국
   * 잉크 그대로**(`--color-footprint-trail`, 사용자가 노랑/인디고 2택으로 고른
   * 그 값)다. 자국과 선이 한 색이어야 «같은 사실의 두 표기»로 읽힌다.
   */
  trailWalked?: number;
}

export interface TraceTokens {
  edgeContains: string;
  /** P3a hierarchy ladder — optional so legacy callers (hover pulses) keep working. */
  edgeContainsL0?: string;
  edgeContainsL2?: string;
  edgeDepends: string;
  edgeDim: string;
  indigo: string;
  indigoBright: string;
  /** 엣지 선택 전용 스트로크 (`--topology-v2-edge-selected`) — 없으면 indigoBright 폴백. */
  edgeSelected?: string;
  /**
   * 밟은 관계선의 스트로크 — 발자국과 **같은** 잉크(`--color-footprint-trail`).
   * `trailWalked > 0` 인 엣지에서만 쓰인다. 없으면 트레일 강조 없음(회귀 0).
   */
  edgeTrail?: string;
}

/** 값을 [0,1] 로 자른다. */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 두 hex 색을 선형 보간한다 — 트레일 램프가 `dim` 에서 트레일 잉크로 올라오는
 * 데만 쓴다(하드컷 금지 계약). `render/grid.ts` 의 `lerpColorHex` 와 같은 식이나,
 * 이 파일은 토큰 레이어를 모르는 순수 렌더러라 의존을 늘리지 않고 여기 둔다.
 */
function mixHex(from: string, to: string, t: number): string {
  const parse = (hex: string): [number, number, number] | null => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = Number.parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return t >= 0.5 ? to : from;
  const k = clamp01(t);
  const ch = (i: 0 | 1 | 2) => Math.round(a[i] + (b[i] - a[i]) * k);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/**
 * Draws one edge's curve plus (for `depends` edges not in the `"dim"` ego
 * state) its comet-tail. One-shot hover pulses are a separate transient list
 * — drawn by the caller looping active pulses through this same curve math,
 * not owned by this per-edge `draw()`.
 */
const DEPENDS_DASH = [3, 4];
/**
 * S2 파트 1 — depends(비-containment) 엣지의 방향 테이퍼. 출발(source, `a`)에서
 * 도착(target, `b`)으로 굵기가 얇아진다 — 화살촉 없이 방향을 굵기로만 읽히게
 * ("board-router" 어휘 유지). 계수는 현재 계산된 width 에 곱하는 **비율**이라
 * ego/selected/farT 등 모든 상태의 width 계산 위에 직교로 얹힌다. 중간값
 * ≈base 라 전체 잉크량은 대략 보존(source 1.4×, target 0.6×). containment(실선)
 * 는 방향이 구조(부모→자식)로 자명해 테이퍼 없음. 상수+rationale(전용 토큰
 * 불필요 — 렌더 계수, node-shapes 의 per-kind ratio 와 같은 결).
 */
export const DEPENDS_TAPER_START = 1.4;
export const DEPENDS_TAPER_END = 0.6;
/** 곡선 파라미터 u(0=source, 1=target)에서의 테이퍼 계수 — 단조 감소. */
export function dependsTaperFactor(u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  return DEPENDS_TAPER_START + (DEPENDS_TAPER_END - DEPENDS_TAPER_START) * t;
}
/** depends 테이퍼 폴리라인 세그먼트 수 — bowed 곡선을 매끈히 근사할 만큼. */
const DEPENDS_TAPER_SEGMENTS = 14;
/**
 * P3a — 레벨별 굵기 계수. 지도학의 도로 위계처럼 한 잉크 계열 안에서
 * 굵기×명도만 탄다 (구조 상수 — node-shapes 의 per-kind ratio 와 같은 결).
 */
const CONTAINS_LEVEL_WIDTH_FACTOR: Record<0 | 1 | 2, number> = { 0: 1.4, 1: 1, 2: 0.8 };
const COMET_TAIL_STEPS = [0, 0.028, 0.056];
const COMET_TAIL_FAR_SIZES = [1.3, 0.9, 0.6];
/**
 * R6 상시 혜성 — 프로토타입(topology-b2plus §13 `drawEdge`)의 코멧 꼬리 기본
 * 반지름. **비-ego(normal) depends 엣지도 포커스와 무관하게 항상 흐른다**(구
 * A1 "코멧테일=포커스 신호" 강등을 소유자 지시로 되돌림). ego/선택 엣지는 더
 * 큰 꼬리 + bright, 패널 강조는 가장 큼. farT 상승 시 `COMET_TAIL_FAR_SIZES`로
 * 보간해 헤어라인 먼지로 얇아진다(알파 페이드 아님 — glow 금지 계약).
 */
const COMET_TAIL_BASE_NORMAL = [2.1, 1.5, 0.9];
const COMET_TAIL_BASE_EGO = [2.9, 2.1, 1.3];
const COMET_TAIL_BASE_EMPHASIZED = [3.6, 2.7, 1.7];

export function draw(ctx: CanvasRenderingContext2D, state: TraceDrawState, tokens: TraceTokens): void {
  const { a, b, control, farT, egoState, t } = state;
  const isDepends = state.relationType === "depends";
  const emphasized = egoState === "ego" && state.emphasized === true;

  let stroke: string;
  let width: number;
  // 「걸어온 길」 — 밟은 선이 **먼저**다. 렌즈가 켜져 있는 동안 이 선은
  // 선택도 ego 도 아니지만(호출부가 렌즈 중 그 둘을 끈다) 사용자가 지금 읽으려는
  // 유일한 것이다. 굵기는 dim(1)에서 1.6 까지만 — 자국 본체보다 굵어지면
  // 선이 자국을 이기고, 그러면 「길」이 아니라 「강조된 관계」로 읽힌다.
  const trailWalked = clamp01(state.trailWalked ?? 0);
  if (trailWalked > 0.01 && tokens.edgeTrail) {
    stroke = mixHex(tokens.edgeDim, tokens.edgeTrail, trailWalked);
    width = 1 + 0.6 * trailWalked;
  } else if (state.selected === true) {
    // 페어 포커스의 주인공 — pale 인디고, 최상 잉크.
    stroke = tokens.edgeSelected ?? tokens.indigoBright;
    // 톤다운 (소유자: "색이 너무 진하다") — dim 장면 위에서 잉크가 아니라
    // 빛으로 읽히게 얇고 옅게. 생동감은 depends 코멧 테일이 계속 탄다.
    width = (isDepends ? 1.7 : 1.5) - farT * 0.4;
  } else if (egoState === "dim") {
    stroke = tokens.edgeDim;
    width = 1;
  } else if (egoState === "ego") {
    // Panel-linked ripple: brightest indigo + thicker; otherwise the standard
    // ego brightening (depends bright, contains indigo).
    stroke = emphasized || isDepends ? tokens.indigoBright : tokens.indigo;
    width = (isDepends ? 1.8 : 1.5) - farT * 0.5 + (emphasized ? 0.9 : 0);
  } else {
    if (isDepends) {
      stroke = tokens.edgeDepends;
      width = 1.3 + (0.6 - 1.3) * farT;
    } else {
      // P3a — 잉크 램프: L0 진하고 굵게(뼈대), L2 살짝 물러남(잔가지).
      const level = state.level ?? 1;
      stroke =
        level === 0
          ? tokens.edgeContainsL0 ?? tokens.edgeContains
          : level === 2
            ? tokens.edgeContainsL2 ?? tokens.edgeContains
            : tokens.edgeContains;
      width = (1 + (0.45 - 1) * farT) * CONTAINS_LEVEL_WIDTH_FACTOR[level];
    }
  }

  // 3D 보기 — 깊이에 따른 헤어라인 감쇠(히어로 lw 감쇠의 배수 형태).
  // 호출부(`topology-frame-draw.ts`)가 돔 램프×깊이로 계산해 넘기고, 2D 는 1.
  width *= state.widthScale ?? 1;

  /*
   * 깊이 헤일로 — 잉크보다 **먼저** 간다. 이 한 획이 3D 의 「앞뒤」를 만든다:
   * 이 프레임의 엣지는 먼 것부터 그려지므로(호출부의 화가 정렬), 여기서 바탕색
   * 으로 조금 더 굵게 그으면 이미 그려진 먼 선들이 그 폭만큼 지워진다.
   *
   * 파선은 헤일로에 쓰지 않는다 — 파선 헤일로는 잘린 자리에 틈을 남겨서
   * 「가림」이 아니라 「점선 그림자」로 읽힌다.
   */
  // perf 2026-08-19 — 헤일로 앞의 `setLineDash([])` 는 제거했다. 이 파일과
  // 이웃 painter 전부가 파선을 쓰고 나면 반드시 `[]` 로 되돌리므로(아래 본체
  // 경로 · node-shapes · cluster-chips · dome-rings · frame-draw 링 블록) 진입
  // 시점의 대시 상태는 항상 비어 있다 — 같은 상태를 다시 쓰는 호출만 지웠고
  // 픽셀 게이트(스크린샷 비교)로 확인한다.
  const halo = state.halo;
  if (halo && halo.px > 0.05 && halo.alpha > 0.01) {
    const prevAlpha = ctx.globalAlpha;
    const prevCap = ctx.lineCap;
    const prevJoin = ctx.lineJoin;
    ctx.globalAlpha = halo.alpha;
    ctx.strokeStyle = halo.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.35, width) + halo.px * 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = prevAlpha;
    ctx.lineCap = prevCap;
    ctx.lineJoin = prevJoin;
  }

  ctx.strokeStyle = stroke;
  // 대칭 관계(`related_to`)는 파선을 쓰되 **테이퍼를 주지 않는다** — 양끝이
  // 대등하다는 사실을 균일 굵기로 인코딩한다. 굵기는 테이퍼의 **평균**(1.0)을
  // 쓴다: 시작 굵기(1.4)에 맞추면 화면 잉크가 49% 늘고, 평균이면 총 잉크가
  // 테이퍼선과 0.02% 차로 같다(2026-07-31 브라우저 렌더 실측).
  const tapered = isDepends && state.directional !== false;
  if (isDepends && !tapered) {
    ctx.beginPath();
    ctx.setLineDash(DEPENDS_DASH);
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
    ctx.lineWidth = Math.max(0.35, width);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (tapered) {
    // 방향 테이퍼: source→target 로 얇아지는 가변폭 폴리라인. dash 연속성은
    // 세그먼트마다 `lineDashOffset` 을 누적 길이로 이어붙여 유지하고, round
    // cap/join 으로 세그먼트 이음매를 매끄럽게 한다(화살촉 없음 — 방향은 굵기).
    // perf 2026-08-19 — 세그먼트 점은 `bezierPoint`(객체 할당) 대신 지역
    // 변수로 인라인 계산한다: 같은 식(u², 2ut, t²)이라 좌표가 같고, 엣지당
    // 14개씩 태어나던 임시 객체가 0 이 된다.
    ctx.setLineDash(DEPENDS_DASH);
    const prevCap = ctx.lineCap;
    const prevJoin = ctx.lineJoin;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let prevX = a.x;
    let prevY = a.y;
    let acc = 0;
    for (let i = 1; i <= DEPENDS_TAPER_SEGMENTS; i += 1) {
      const t = i / DEPENDS_TAPER_SEGMENTS;
      const uu = 1 - t;
      const pointX = uu * uu * a.x + 2 * uu * t * control.x + t * t * b.x;
      const pointY = uu * uu * a.y + 2 * uu * t * control.y + t * t * b.y;
      const u = (i - 0.5) / DEPENDS_TAPER_SEGMENTS;
      ctx.beginPath();
      ctx.lineWidth = Math.max(0.35, width * dependsTaperFactor(u));
      ctx.lineDashOffset = -acc;
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(pointX, pointY);
      ctx.stroke();
      acc += Math.hypot(pointX - prevX, pointY - prevY);
      prevX = pointX;
      prevY = pointY;
    }
    ctx.lineCap = prevCap;
    ctx.lineJoin = prevJoin;
    ctx.lineDashOffset = 0;
    ctx.setLineDash([]);
  } else {
    // 진입 대시 상태가 항상 [] 이므로(위 헤일로 주석) 여기서는 대시 호출이
    // 아예 없다 — contains 엣지가 매 프레임 내던 `setLineDash([])` 2회가 0회.
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
    ctx.lineWidth = Math.max(0.35, width);
    ctx.stroke();
  }

  if (isDepends) {
    if (egoState === "dim") return;
    // R6 상시 혜성 복원(소유자 지시 "예전 걸 살려줘" — 구 Guardian A1 "코멧테일=
    // 포커스 신호" 강등을 되돌림): 코멧 꼬리는 dim 이 아닌 모든 depends 엣지에서
    // 포커스와 무관하게 흐른다(프로토타입 §13 `drawEdge`의 `state !== "dim"`).
    // 위상 전진은 `updateParticles`(reduced-motion 이면 정지)가 소유하므로
    // reduced-motion 사용자에겐 여기서도 미표시 → "아무 것도 안 움직인다" 유지.
    if (state.reducedMotion === true) return;
    // 캡 미통과 엣지는 파선 본체만 남기고 파티클을 그리지 않는다 — 상시성·
    // 속도·포커스 무관성은 그대로이고 **동시에 흐르는 점 개수만** 유계가 된다.
    if (state.dependsCometEligible === false) return;

    // comet tail — three shrinking dots trailing the live pulse position,
    // thinning toward hairline dust as altitude rises rather than fading via
    // alpha (forbidden.md bans glow/alpha-based "signal" motifs). ego/선택
    // 엣지는 더 큰 꼬리 + bright 인디고, normal 은 옅은 인디고(프로토타입 대칭).
    const ego = egoState === "ego" || state.selected === true;
    const baseSizes = emphasized ? COMET_TAIL_BASE_EMPHASIZED : ego ? COMET_TAIL_BASE_EGO : COMET_TAIL_BASE_NORMAL;
    const tailColor = ego ? tokens.indigoBright : tokens.indigo;
    // perf 2026-08-19 — forEach 클로저·bezierPoint 객체 할당 제거(같은 식 인라인).
    ctx.fillStyle = tailColor;
    for (let i = 0; i < COMET_TAIL_STEPS.length; i += 1) {
      let tt = t - COMET_TAIL_STEPS[i];
      if (tt < 0) tt += 1;
      const uu = 1 - tt;
      const px = uu * uu * a.x + 2 * uu * tt * control.x + tt * tt * b.x;
      const py = uu * uu * a.y + 2 * uu * tt * control.y + tt * tt * b.y;
      const size = baseSizes[i] + (COMET_TAIL_FAR_SIZES[i] - baseSizes[i]) * farT;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Design Guardian 승인 처방 E — 선택(ego) 시 인시던트 contains 엣지도 코멧
  // 흐름(일회성 버스트 아님, `updateParticles`가 소유한 지속 위상). 방향은
  // source→target 그대로(부모→자식 typed fact, depends 처럼 역방향/방사
  // 없음 — a/b 는 이미 source/target 스크린 좌표라 depends 와 동일한
  // `bezierPoint(a, control, b, t)` 호출이면 자동으로 지켜진다). 꼬리는 항상
  // NORMAL 티어([2.1,1.5,0.9], depends ego 의 [2.9,2.1,1.3]보다 한 단계
  // 작게 — 잉크 위계 보존) + 표준 인디고(bright 금지) — ego/emphasized 승격
  // 없음. `containsCometEligible`(캡 통과 여부)이 false 면 파티클 없이 본체
  // stroke(위에서 이미 그려짐)만 유지. 선택 해제 시 egoState 가 "ego"를 벗어나
  // 즉시(다음 프레임) 미표시 — 별도 소멸 애니메이션 불필요.
  if (egoState !== "ego" || state.containsCometEligible !== true) return;
  if (state.reducedMotion === true) return;
  ctx.fillStyle = tokens.indigo;
  for (let i = 0; i < COMET_TAIL_STEPS.length; i += 1) {
    let tt = t - COMET_TAIL_STEPS[i];
    if (tt < 0) tt += 1;
    const uu = 1 - tt;
    const px = uu * uu * a.x + 2 * uu * tt * control.x + tt * tt * b.x;
    const py = uu * uu * a.y + 2 * uu * tt * control.y + tt * tt * b.y;
    const size = COMET_TAIL_BASE_NORMAL[i] + (COMET_TAIL_FAR_SIZES[i] - COMET_TAIL_BASE_NORMAL[i]) * farT;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
}
