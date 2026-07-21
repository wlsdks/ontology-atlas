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
   * 엣지 선택(페어 포커스) — 인디고 pale 사다리의 전용 스트로크로 그린다.
   * 노드 선택(표준 인디고)과 같은 계열이되 값이 달라 한눈에 구분된다
   * (채색 시스템 증식 없음 — 헌장 준수).
   */
  selected?: boolean;
  /**
   * P3a — containment 잉크 레벨 (0 뼈대 · 1 중간 · 2 잔가지). contains 의
   * 비-ego 렌더에서만 소비: stroke 는 레벨별 토큰, width 는 레벨 계수.
   * depends/ego/dim 경로는 기존 그대로 (타입·주의 채널은 사다리와 직교).
   */
  level?: 0 | 1 | 2;
  /**
   * `prefers-reduced-motion: reduce`. The comet tail is the one moving mark
   * this module paints, so honouring the preference here is what keeps the
   * canvas fully static for those users (audit A8: the tail was the largest
   * of five uncovered motion sources).
   */
  reducedMotion?: boolean;
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

export function draw(ctx: CanvasRenderingContext2D, state: TraceDrawState, tokens: TraceTokens): void {
  const { a, b, control, farT, egoState, t } = state;
  const isDepends = state.relationType === "depends";
  const emphasized = egoState === "ego" && state.emphasized === true;

  let stroke: string;
  let width: number;
  if (state.selected === true) {
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
      // P3a — 잉크 사다리: L0 진하고 굵게(뼈대), L2 살짝 물러남(잔가지).
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

  ctx.strokeStyle = stroke;
  if (isDepends) {
    // 방향 테이퍼: source→target 로 얇아지는 가변폭 폴리라인. dash 연속성은
    // 세그먼트마다 `lineDashOffset` 을 누적 길이로 이어붙여 유지하고, round
    // cap/join 으로 세그먼트 이음매를 매끄럽게 한다(화살촉 없음 — 방향은 굵기).
    ctx.setLineDash(DEPENDS_DASH);
    const prevCap = ctx.lineCap;
    const prevJoin = ctx.lineJoin;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let prev = a;
    let acc = 0;
    for (let i = 1; i <= DEPENDS_TAPER_SEGMENTS; i += 1) {
      const point = bezierPoint(a, control, b, i / DEPENDS_TAPER_SEGMENTS);
      const u = (i - 0.5) / DEPENDS_TAPER_SEGMENTS;
      ctx.beginPath();
      ctx.lineWidth = Math.max(0.35, width * dependsTaperFactor(u));
      ctx.lineDashOffset = -acc;
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      acc += Math.hypot(point.x - prev.x, point.y - prev.y);
      prev = point;
    }
    ctx.lineCap = prevCap;
    ctx.lineJoin = prevJoin;
    ctx.lineDashOffset = 0;
  } else {
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
    ctx.lineWidth = Math.max(0.35, width);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (!isDepends || egoState === "dim") return;
  // AUDIT FINDING (Guardian 2026-07-20 A1/B1): the tail used to ride EVERY
  // `depends` edge, so the brightest ink on an idle canvas was decoration —
  // measured 4.23:1 against the background versus 1.32:1 for the `contains`
  // edges that carry the graph's skeleton. Ambient playback is retired; the
  // tail is now a FOCUS signal, earning its brightness by marking the ego
  // subgraph. Also the only always-moving mark, so gating it is what lets the
  // frame loop reach a genuine idle state (A2) and what makes
  // `prefers-reduced-motion` actually mean "nothing moves".
  if (egoState !== "ego") return;
  if (state.reducedMotion === true) return;

  // comet tail — three shrinking dots trailing the live pulse position,
  // thinning toward hairline dust as altitude rises rather than fading via
  // alpha (forbidden.md bans glow/alpha-based "signal" motifs).
  // `egoState` is necessarily "ego" past the guard above, so the old
  // ambient-size and ambient-colour branches are gone with it.
  const baseSizes = emphasized ? [3.6, 2.7, 1.7] : [2.9, 2.1, 1.3];
  const tailColor = tokens.indigoBright;
  COMET_TAIL_STEPS.forEach((step, i) => {
    let tt = t - step;
    if (tt < 0) tt += 1;
    const point = bezierPoint(a, control, b, tt);
    const size = baseSizes[i] + (COMET_TAIL_FAR_SIZES[i] - baseSizes[i]) * farT;
    ctx.beginPath();
    ctx.fillStyle = tailColor;
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fill();
  });
}
