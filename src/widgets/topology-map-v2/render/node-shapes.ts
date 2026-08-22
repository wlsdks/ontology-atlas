/**
 * Node body geometry + paint — ported from the B2+ prototype's
 * `roundedPolygonPath()`/`hexPoints()`/`squarePoints()`/`drawEngraved()`/
 * `drawNode()` (`docs/prototypes/topology-b2plus.html` §12-13).
 *
 * Shape-by-kind (unchanged across altitude): project = hex plate, domain =
 * square chip (with pin-tick legs in circuit range), capability = circle
 * (no morph needed), element = square copper-pad-with-drilled-via. Corner
 * rounding grows toward the full radius as `farT → 1`, so every polygon
 * converges into a plain circle at the far-field end
 * (`docs/TOPOLOGY-V2-DESIGN.md` §3.1 — continuous morph, no shape swap).
 *
 * Zero React imports (per module contract) — this is pure Canvas 2D drawing
 * plus a few extractable pure-geometry helpers that ARE unit-testable
 * without a canvas (`node-shapes.test.ts`).
 *
 * `draw()` itself has no dedicated test (canvas side effects aren't
 * meaningfully assertable without a heavy mock; P5's screenshot gate is the
 * real verification for paint correctness, per design doc §4 P3 gate).
 */

import { smoothstep } from "../model/altitude";
import { FONT_WEIGHT } from "@/shared/ui/font-weight";
import { computeHoverShimmer } from "../model/hover-shimmer";

export interface Point {
  x: number;
  y: number;
}

/** Six points of a regular hexagon, flat-top-rotated -90° (prototype: `a = i*60 - 90` degrees). */
/**
 * 입체 음영의 광원 오프셋(반지름 배수) — 위·왼쪽. 근거는 `depthShade` 독블록
 * (Sun & Perona 1998 — 시각계의 «빛은 위에서, 약간 왼쪽» 가정).
 */
const NODE_DEPTH_SHADE_LIGHT_OFFSET = 0.4;
/** 그늘진 쪽 가장자리의 최대 검정 알파. 이보다 세면 원판이 «구멍»으로 읽힌다. */
const NODE_DEPTH_SHADE_MAX_ALPHA = 0.5;
/**
 * 이 화면 반지름(px) 아래에서는 음영을 안 그린다 — 3~4px 원판에서 기울기는
 * 입체가 아니라 잡음이고, 노드마다 그라디언트 객체를 만드는 비용만 남는다.
 */
const NODE_DEPTH_SHADE_MIN_RADIUS_PX = 3.5;

/**
 * 입체 음영 그라디언트 캐시 — 키는 반올림한 (반지름, 세기). 좌표는 키에 없다:
 * 그라디언트를 **원점 기준**으로 만들고 그릴 때 `translate` 로 옮긴다.
 */
const shadeGradientCache = new Map<string, CanvasGradient>();
const SHADE_CACHE_MAX = 512;

function buildDepthShade(ctx: CanvasRenderingContext2D, r: number, strength: number): CanvasGradient {
  const shade = ctx.createRadialGradient(
    // 빛이 오는 쪽 — 위·약간 왼쪽. 그 점 근처는 손대지 않는다.
    -r * NODE_DEPTH_SHADE_LIGHT_OFFSET,
    -r * NODE_DEPTH_SHADE_LIGHT_OFFSET,
    r * 0.05,
    0,
    0,
    r * 1.25,
  );
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(0.55, `rgba(0, 0, 0, ${(NODE_DEPTH_SHADE_MAX_ALPHA * strength * 0.35).toFixed(3)})`);
  shade.addColorStop(1, `rgba(0, 0, 0, ${(NODE_DEPTH_SHADE_MAX_ALPHA * strength).toFixed(3)})`);
  return shade;
}

export function hexPoints(cx: number, cy: number, r: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return points;
}

/** Four corners of an axis-aligned square, half-extent `s`. */
export function squarePoints(cx: number, cy: number, s: number): Point[] {
  return [
    { x: cx - s, y: cy - s },
    { x: cx + s, y: cy - s },
    { x: cx + s, y: cy + s },
    { x: cx - s, y: cy + s },
  ];
}

/**
 * Corner radius at a given altitude — `lerp(minRadius, fullRadius, farT)`.
 * `minRadius` is a small constant per kind in the prototype (e.g.
 * `Math.min(4, r*0.14)` for project); `fullRadius` is the node's own draw
 * radius `r` (farT=1 → radius=r → the "rounded polygon" degenerates into a
 * circle, which `draw()` special-cases at `farT > 0.985` exactly like the
 * prototype, to avoid float-precision polygon/circle seams).
 */
export function interpolateCornerRadius(minRadius: number, fullRadius: number, farT: number): number {
  return minRadius + (fullRadius - minRadius) * farT;
}

export interface NodeShapeDrawState {
  kind: "project" | "domain" | "capability" | "element";
  screenX: number;
  screenY: number;
  /** Screen-space draw radius (world radius × camera.scale × breathe). */
  screenRadius: number;
  farT: number;
  egoState: "center" | "neighbor" | "dim" | "normal";
  fill: string;
  stroke: string;
  lineWidth: number;
  dash: readonly number[];
  hub: boolean;
  /**
   * Top stop of the vertical metallic-sheen gradient (prototype `drawNode`:
   * `lerpColor(fill, "#232329", 0.6)`). Resolved by the caller from the
   * `--topology-v2-node-sheen-*` tokens so this pure module stays token-free;
   * the bottom stop is always `fill`.
   */
  sheenTop: string;
  /** Engraved node-count numeral, or null to skip (project/domain only, per prototype). */
  countLabel: string | null;
  /**
   * The currently-hovered node (no focus active — hover is suppressed under
   * focus, `topology-frame-draw.ts` nulls `hoveredNodeId` there). Draws a
   * static 1px indigo hairline preview ring ("잡을 수 있다" affordance,
   * canvas-emphasis slice §C) — never for the already-`"center"` node, which
   * has its own stronger selection ring below.
   */
  isHovered: boolean;
  /**
   * rank5 — the hovered node's own hover-ripple emphasis (0..1, the SAME
   * `emphasisById` scalar the body wake rides, rise τ 0.09). The static hover
   * preview ring's alpha is multiplied by it so the ring rises ON the body's
   * wake curve instead of hard-popping to full opacity on the first hover frame.
   * Only read while `isHovered`; defaults to 1 when omitted (callers that don't
   * thread emphasis keep the pre-rank5 always-solid ring). reduced-motion snaps
   * emphasis to 1, so the ring is instantly solid there.
   */
  hoverEmphasis?: number;
  /**
   * One-shot commit-pulse visual for the just-selected (`egoState ===
   * "center"`) node, or `null` outside its brief window (already played out,
   * `prefers-reduced-motion`, or this isn't the node that was just clicked).
   * `model/selection-pulse.ts#computeSelectionPulse` is the pure source;
   * never loops — once elapsed exceeds the duration it's permanently null
   * until the NEXT click resets the timestamp.
   */
  selectionPulse: { scaleFactor: number; alpha: number } | null;
  /**
   * W6 agent visibility — true for the single node matching the current
   * agent heartbeat's `focus.ontologySlug` (resolved upstream by
   * `views/home/lib/resolve-agent-focus-node.ts`), only while that
   * heartbeat is fresh (`hasFreshHeartbeat`, `topology-frame-draw.ts`'s
   * caller nulls the id otherwise). Draws a static amber hairline ring — the
   * SAME `amberHub` signal tone as the hub ring / project hexagon, never a
   * glow (design.md "발광 대신 재질"). Real heartbeat data only; `false`
   * whenever there's no fresh focus (fabrication 0).
   */
  agentFocus: boolean;
  /**
   * 스포트라이트 변경-노드 링 (소유자 지시 2026-07-23, Image #14 — "변경된
   * 것만 테두리가 돌아가게"). 렌즈 ON 동안 mtime 창 안 노드에 amberHub
   * **회전 파선** kind-outline 을 얹는다 — 침강 대비만으론 element 뷰에서
   * 변경 노드가 안 읽히던 실보고의 처방. glow/blur 0(발광 대신 재질),
   * amberHub 는 에이전트 포커스 링과 같은 신호 톤 선례. `alpha` = 렌즈
   * 램프(켜고 끄기 페이드), `dashOffset` = 회전 위상(px, reduced-motion 은
   * 호출자가 0 고정 → 정적 파선). null = 미표시.
   */
  spotlightRing: { alpha: number; dashOffset: number } | null;
  /**
   * Design Guardian 처방 L — 호버 circuit-trace shimmer 의 시간원. 프레임의
   * `performance.now()` 호환 타임스탬프(픽셀 드로우 자체는 시간을 모르는
   * 순수 계층이 아니므로 여기서만 받는다) + reduced-motion 게이트. 정지 호버
   * 링(`isHovered` 블록)은 이 값과 무관하게 항상 그려지고, shimmer 아크만
   * `!reducedMotion` 일 때 그 위에 얹힌다.
   */
  now: number;
  reducedMotion: boolean;
  /**
   * 아이콘 세트 (Phase 5 #21) — kind→실루엣 매핑은 이 값과 무관하게 항상 동일
   * (`bodyPoints` 그대로). 이 값은 **렌더 스타일만** 바꾼다: `"fill"`(기하, 현행
   * 기본) = kind fill + 금속 sheen 그라디언트, `"line"`(라인) = 채움 없이 flat
   * 다크 바디(hole-fill) + 살짝 얇은 외곽선. DOM `TopologyV2KindGlyph` 의 라인
   * 세트와 같은 스토어(`appearance-preferences`)를 읽어 두 표면이 함께 스왑된다.
   * 생략 시 `"fill"`(회귀 0).
   */
  glyphStyle?: "fill" | "line";
  /**
   * 3D 보기 — **입체 음영**의 세기 0..1. 0(기본)이면 획이 하나도 안 늘어난다.
   *
   * 사람의 시각계는 명암의 모호함을 «빛은 위에서, 약간 왼쪽에서 온다»는 가정
   * 으로 푼다(Sun & Perona, *Nature Neuroscience* 1(3), 1998). 그래서 원판
   * 위에 그 방향의 명암 기울기 하나만 얹으면 원판이 **구**로 읽힌다 — 3D 에서
   * 점이 «스티커»로 보이던 것을 없애는 가장 싼 장치다.
   *
   * **밝은 쪽을 밝히지 않고 어두운 쪽만 어둡게 한다.** 반대편에 하이라이트나
   * 림 라이트를 넣으면 그것이 곧 헌장이 금지한 glow 다. 여기 쓰는 것은 검정
   * 알파 하나뿐이라 새 색상(hue)이 0 이고, 번지지도 움직이지도 않는다.
   */
  depthShade?: number;
  /**
   * 3D 보기 — **먼 쪽 상세 램프** 0..1 (`model/dome-view.ts#domeDetailFactor`).
   * 1(기본)이면 종전과 픽셀 동일. 뒤쪽 반구에서 0 으로 접히며 **부가 획**만
   * 물러난다: 외곽선 stroke(채움 세트에서만 — 라인 세트의 외곽선은 마크
   * 자체라 안 접는다)와 도메인 핀 틱. 원판 fill(마크)은 어느 값에서도 그대로.
   * 감쇠는 C¹ 연속(smoothstep)이라 돔 회전 중 획이 «툭» 사라질 수 없다.
   */
  detail?: number;
}

/** kind→실루엣 불변, 렌더 스타일만 결정하는 순수 디스크립터 (canvas 게이트). */
export interface GlyphStyleDescriptor {
  /** true면 채움 없이 flat 다크 바디 + 외곽선만(라인 세트). */
  lineOnly: boolean;
  /** 바디 외곽선 두께 배수 — 라인 세트는 살짝 가볍다. */
  lineWidthScale: number;
}

// perf 2026-08-19 — 노드마다 새 객체를 만들 이유가 없는 순수 상수 둘. 공유
// 객체를 돌려줘도 소비처는 읽기만 한다(값 동일 → 픽셀 동일).
const GLYPH_STYLE_LINE: GlyphStyleDescriptor = { lineOnly: true, lineWidthScale: 0.8 };
const GLYPH_STYLE_FILL: GlyphStyleDescriptor = { lineOnly: false, lineWidthScale: 1 };

export function glyphStyleDescriptor(glyphStyle: "fill" | "line" | undefined): GlyphStyleDescriptor {
  return glyphStyle === "line" ? GLYPH_STYLE_LINE : GLYPH_STYLE_FILL;
}

export interface NodeShapeTokens {
  amberHub: string;
  recentChange: string;
  numeralShadow: string;
  numeralFace: string;
  holeFill: string;
  /**
   * Canvas-emphasis slice — Layer-0 container identity (design.md: "Hub 노드와
   * Layer 0 컨테이너에만 보조 톤(앰버) 허용"). Inner offset hairline for the
   * project hexagon's double-hairline "machined bezel" (spec §A1's second
   * stroke — the outer stroke itself is `amberHub`, applied to the BODY
   * stroke by `topology-frame-draw.ts#resolveNodeVisual`, not here).
   */
  projectHairlineInner: string;
  /** Canvas-emphasis slice — project hexagon's 4-direction chassis-leg pin ticks (spec §A2). */
  projectPinTick: string;
  /** Canvas-emphasis slice — the static 2px selection ring's color (`tokens.indigoBright`, spec §B1). */
  selectionIndigo: string;
  /** Canvas-emphasis slice — the outer 6px hairline ring's color, a lower-alpha indigo (spec §B1's second ring). */
  selectionHairline: string;
  /**
   * #5 — the connected-neighbor ring color. A THIN pale-indigo ring on the
   * body outline of every direct (1-hop) neighbor of the selected node, so
   * "what this connects to" reads as clearly as the edges do. Same indigo
   * hue as the selection ring, differentiated by VALUE only (pale
   * `--topology-v2-edge-selected`), per the charter's selection-color ladder
   * — never a new blue hue.
   */
  neighborRing: string;
  /** Canvas-emphasis slice — the hover preview ring's color (spec §C), a static 1px indigo hairline distinct from the brighter selection ring. */
  hoverRing: string;
  /** Design Guardian 처방 L — 호버 shimmer 아크 길이(둘레 비율, `--topology-v2-hover-shimmer-seg`). */
  hoverShimmerSeg: number;
  /** Design Guardian 처방 L — 호버 shimmer 1회전 주기(ms, `--topology-v2-hover-shimmer-period-ms`). */
  hoverShimmerPeriodMs: number;
  /** Design Guardian 처방 L — 호버 shimmer 아크 색(`--topology-v2-indigo-bright` 재사용, 새 hue 없음). */
  hoverShimmerColor: string;
}

/** Full convergence to a plain circle above this farT — avoids float-precision polygon/circle seams (prototype: `farT > 0.985`). */
const FULL_CIRCLE_FAR_T = 0.985;

/** Sheen dissolves out toward far field — above this farT (or below `SHEEN_MIN_RADIUS`) the body fills flat so constellation points read luminous, not machined (prototype: `r > 3 && farT < 0.98`). */
const SHEEN_MAX_FAR_T = 0.98;
const SHEEN_MIN_RADIUS = 3;

/**
 * Engraved node-count numeral shows only above this screen radius (project/
 * domain). Ported prototype literal was 15; lowered to 13 because with the
 * decoupled circuit-entry camera the domain chip (worldRadius 17 × entry scale
 * ≈ 0.86) lands at ~14.7px on load — just under the old gate, so domain counts
 * never appeared at the overview even though `farT = 0` (circuit). 13 clears the
 * ±4% breathe trough with margin so counts stay stable, and still hides counts
 * once nodes shrink toward the far-field/constellation size on zoom-out.
 */
const ENGRAVED_COUNT_MIN_RADIUS = 13;

/** Domain chip-leg pin ticks — geometry ratios ported from the prototype's `[-0.45,0.45]` offsets + `tick = s*0.34` leg length, gated `s > 6 && farT < 0.9`. */
const DOMAIN_PIN_MIN_HALF_EXTENT = 6;
const DOMAIN_PIN_MAX_FAR_T = 0.9;
const DOMAIN_PIN_TICK_RATIO = 0.34;
const DOMAIN_PIN_OFFSET_FACTORS = [-0.45, 0.45] as const;

/** Half-extent factor of the domain square relative to its draw radius (prototype `s = r * 0.86`). */
const DOMAIN_HALF_EXTENT_RATIO = 0.86;

/** Canvas-emphasis slice — project hexagon decor (double hairline + pin ticks) fades out toward far field, mirroring the domain pin-tick gate. */
const PROJECT_DECOR_MIN_RADIUS = 8;
const PROJECT_DECOR_MAX_FAR_T = 0.9;
/** Inner hairline sits inset at this fraction of the outer body radius (ported ratio from the flagship prototype's double-hex, `docs/prototypes/first-run-v3-flagship.html` — outer circumradius 41, inner 31 ≈ 0.756). */
const PROJECT_HAIRLINE_INNER_RATIO = 0.75;
/** Selection ring offsets — the inner ring sits exactly on the body outline (spec §B1's "노드 외곽"), the outer hairline 6px beyond it. */
const SELECTION_RING_OUTER_OFFSET = 6;
/** The one-shot commit-pulse ring sits between the two static rings so its brief expansion reads as coming FROM the node, not replacing either static ring. */
const SELECTION_PULSE_RING_OFFSET = 3;
/** Hover preview ring sits just outside the body, inside the (mutually-exclusive, hover never fires under focus) selection ring's radius. */
const HOVER_RING_OFFSET = 3;
/** W6 agent visibility — agent-focus ring offset (owner spec: "정적 1px, r+8"), deliberately wider than the hub ring's r+4 so the two never visually merge on a hub node the agent is also focused on. */
const AGENT_FOCUS_RING_OFFSET = 8;

export interface PinTick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The four chip-leg pin ticks of a domain square — two above, two below, one
 * pair per `[-0.45, 0.45]` x-offset. Pure screen-space geometry (ported from
 * the prototype's domain branch), unit-tested in `node-shapes.test.ts`.
 */
export function domainPinTicks(cx: number, cy: number, s: number): PinTick[] {
  const tick = s * DOMAIN_PIN_TICK_RATIO;
  const ticks: PinTick[] = [];
  for (const f of DOMAIN_PIN_OFFSET_FACTORS) {
    const x = cx + s * f;
    ticks.push({ x1: x, y1: cy - s, x2: x, y2: cy - s - tick });
    ticks.push({ x1: x, y1: cy + s, x2: x, y2: cy + s + tick });
  }
  return ticks;
}

/** Fixed 6px leg length for the project hexagon's 4-direction pin ticks (owner spec, canvas-emphasis slice — "핀 틱 4방향(상하좌우 6px 선)"), unlike domain's radius-proportional ticks. */
const PROJECT_PIN_TICK_LENGTH = 6;

/**
 * The four "chassis leg" pin ticks on the project hexagon — one per cardinal
 * direction (up/down/left/right), each a fixed 6px line starting at the
 * node's own edge (`r`) and pointing outward. "가공 부품 문법" (machined-part
 * vocabulary) — reinforces the project node's Layer-0-container identity
 * without any glow, mirroring `domainPinTicks`' geometry-as-decoration
 * approach but with fixed (not radius-proportional) leg length per spec.
 */
export function projectPinTicks(cx: number, cy: number, r: number): PinTick[] {
  const t = PROJECT_PIN_TICK_LENGTH;
  return [
    { x1: cx, y1: cy - r, x2: cx, y2: cy - r - t },
    { x1: cx, y1: cy + r, x2: cx, y2: cy + r + t },
    { x1: cx - r, y1: cy, x2: cx - r - t, y2: cy },
    { x1: cx + r, y1: cy, x2: cx + r + t, y2: cy },
  ];
}

/**
 * The body fill for one node: a vertical `sheenTop → fill` gradient when the
 * node is big + near enough (prototype `r > 3 && farT < 0.98`), otherwise the
 * flat `fill`. Ported from `drawNode`'s sheen block (§13).
 */
function resolveBodyFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  farT: number,
  fill: string,
  sheenTop: string,
): string | CanvasGradient {
  if (r <= SHEEN_MIN_RADIUS || farT >= SHEEN_MAX_FAR_T) return fill;
  // 먼 쪽 상세 램프가 sheenTop 을 fill 로 수렴시키면(동일 문자열) 두 정지점이
  // 같은 그라디언트다 — 만들지 않고 평면 fill 로 조기 반환한다(픽셀 동일).
  if (sheenTop === fill) return fill;
  const grad = ctx.createLinearGradient(x, y - r, x, y + r);
  grad.addColorStop(0, sheenTop);
  grad.addColorStop(1, fill);
  return grad;
}

/** Ported from the prototype's `roundedPolygonPath()` — traces a closed polygon path with each corner rounded to `min(rad, adjacentEdgeLen*0.45)`. */
function roundedPolygonPath(ctx: CanvasRenderingContext2D, points: readonly Point[], rad: number): void {
  const n = points.length;
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const v1x = p1.x - p0.x;
    const v1y = p1.y - p0.y;
    const len1 = Math.hypot(v1x, v1y) || 1;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const r = Math.min(rad, len1 * 0.45, len2 * 0.45);
    const sx = p1.x - (v1x / len1) * r;
    const sy = p1.y - (v1y / len1) * r;
    const ex = p1.x + (v2x / len2) * r;
    const ey = p1.y + (v2y / len2) * r;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    ctx.quadraticCurveTo(p1.x, p1.y, ex, ey);
  }
  ctx.closePath();
}

/** Ported from the prototype's `drawEngraved()` — a 1px dark shadow beneath a lighter face, reading as an inset/engraved numeral rather than printed text. */
function drawEngraved(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  alpha: number,
  tokens: NodeShapeTokens,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${FONT_WEIGHT.strong} ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = tokens.numeralShadow;
  ctx.fillText(text, x, y + 1);
  ctx.fillStyle = tokens.numeralFace;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

/**
 * This kind's polygon points at draw radius `r` — `null` for capability, which
 * is already a plain circle. Exported (in addition to internal use by
 * `draw()`/`strokeKindOutline()`/`outlinePerimeter()`) so
 * `tests/contract/node-kind-shape-parity.contract.test.ts` can read the
 * canvas gateway's kind→silhouette mapping directly instead of re-deriving it
 * from `draw()`'s side effects — that contract test is the ONLY thing that
 * checks this mapping agrees with the DOM gateway's
 * (`shared/ui/topology-v2-kind-glyph.tsx`); each file's own unit tests only
 * check internal consistency, not parity across the two gateways.
 */
export function bodyPoints(kind: NodeShapeDrawState["kind"], x: number, y: number, r: number): readonly Point[] | null {
  if (kind === "project") return hexPoints(x, y, r);
  if (kind === "domain") return squarePoints(x, y, r * DOMAIN_HALF_EXTENT_RATIO);
  if (kind === "element") return squarePoints(x, y, r * 0.92);
  return null;
}

/*
 * perf 2026-08-19 — 그리기 내부 전용 스크래치판 `bodyPoints`.
 *
 * `hexPoints`/`squarePoints` 는 호출마다 점 객체 4~6개 + 배열 하나를 만든다.
 * 노드 바디 + 링 오버레이가 노드마다 부르므로 2,000 노드 × 60fps 면 초당
 * 수십만 개다. 좌표 식은 위 함수들과 **완전히 같고**(같은 각도·같은 비율),
 * 결과는 `roundedPolygonPath` 가 즉시 소비하므로 프레임 간 공유 상태가 없다
 * — 이 파일의 draw 경로는 단일 rAF 루프에서 동기로만 돈다. 외부 계약
 * (`bodyPoints` export, contract test)은 그대로 할당판을 쓴다.
 */
const HEX_SCRATCH: Point[] = Array.from({ length: 6 }, () => ({ x: 0, y: 0 }));
const SQUARE_SCRATCH: Point[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));

function hexPointsScratch(cx: number, cy: number, r: number): readonly Point[] {
  for (let i = 0; i < 6; i += 1) {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    HEX_SCRATCH[i].x = cx + r * Math.cos(a);
    HEX_SCRATCH[i].y = cy + r * Math.sin(a);
  }
  return HEX_SCRATCH;
}

function squarePointsScratch(cx: number, cy: number, s: number): readonly Point[] {
  SQUARE_SCRATCH[0].x = cx - s;
  SQUARE_SCRATCH[0].y = cy - s;
  SQUARE_SCRATCH[1].x = cx + s;
  SQUARE_SCRATCH[1].y = cy - s;
  SQUARE_SCRATCH[2].x = cx + s;
  SQUARE_SCRATCH[2].y = cy + s;
  SQUARE_SCRATCH[3].x = cx - s;
  SQUARE_SCRATCH[3].y = cy + s;
  return SQUARE_SCRATCH;
}

function bodyPointsScratch(kind: NodeShapeDrawState["kind"], x: number, y: number, r: number): readonly Point[] | null {
  if (kind === "project") return hexPointsScratch(x, y, r);
  if (kind === "domain") return squarePointsScratch(x, y, r * DOMAIN_HALF_EXTENT_RATIO);
  if (kind === "element") return squarePointsScratch(x, y, r * 0.92);
  return null;
}

/**
 * This kind's minimum corner radius at farT=0.
 *
 * B6 (Guardian): the old absolute px caps (`min(4, …)`) were keyed to the
 * SCREEN radius, so the same node changed silhouette character with zoom —
 * r=28 got 14% corners (soft hex), r=200 got 2% (razor hex). The engine's
 * declared contract is "farT is the ONLY morph axis"; screen scale was an
 * undeclared second one. Ratios keep the silhouette self-similar; the 0.5px
 * FLOOR keeps tiny radii from collapsing into sub-pixel corners (the caps'
 * original purpose, now expressed at the correct end of the scale).
 */
function minCornerRadius(kind: NodeShapeDrawState["kind"], r: number): number {
  if (kind === "project") return Math.max(0.5, r * 0.14);
  if (kind === "domain") return Math.max(0.5, r * 0.86 * 0.22);
  return Math.max(0.5, r * 0.92 * 0.3);
}

/**
 * Strokes ONE ring at `radius`, following the node's own kind-shape (hex/
 * square/rounded-square, converging to a circle past `FULL_CIRCLE_FAR_T` —
 * same convergence rule as the body itself) — a "material ring" overlay
 * (`.claude/rules/design.md` "발광 대신 재질"), never a glow/shadow. Shared by
 * the hub ring, the project double-hairline, the selection double-ring, its
 * one-shot commit pulse, and the hover preview ring — all five are the same
 * primitive at a different radius/color/width/alpha.
 */
function strokeKindOutline(
  ctx: CanvasRenderingContext2D,
  kind: NodeShapeDrawState["kind"],
  x: number,
  y: number,
  radius: number,
  farT: number,
  color: string,
  lineWidth: number,
  alpha: number,
): void {
  if (alpha <= 0.01 || radius <= 0) return;
  const points = bodyPointsScratch(kind, x, y, radius);
  if (points === null || farT > FULL_CIRCLE_FAR_T) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  } else {
    roundedPolygonPath(ctx, points, interpolateCornerRadius(minCornerRadius(kind, radius), radius, farT));
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Approximate perimeter of the node's own outline at this farT/kind — the
 * straight-edge sum of `bodyPoints` (ignoring the small corner-rounding
 * inset `roundedPolygonPath` trims off) for the polygon range, or a plain
 * circle circumference past `FULL_CIRCLE_FAR_T` — mirrors the exact same
 * polygon/circle branch `strokeKindOutline` draws with. Used only to size
 * the hover-shimmer dash pattern (a decorative overlay, not a hit-test), so
 * this approximation is enough — no separate test needed the way the pure
 * `model/hover-shimmer.ts` time math is.
 */
function outlinePerimeter(kind: NodeShapeDrawState["kind"], radius: number, farT: number): number {
  const points = bodyPointsScratch(kind, 0, 0, radius);
  if (points === null || farT > FULL_CIRCLE_FAR_T) return 2 * Math.PI * radius;
  let perimeter = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    perimeter += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  return perimeter;
}

/**
 * Design Guardian 처방 L — 정지 호버 링(`strokeKindOutline`) 위에 저속 순회
 * 아크 1개를 얹는다. 같은 형상 패스(hex/사각/원, farT 수렴 규칙까지 동일)를
 * 다시 그리되 `setLineDash`/`lineDashOffset` 로 일부만 보이게 해 "회로를
 * 순회하는 신호" 를 표현한다 — 글로우/그림자 0(design.md), 색은 인디고
 * bright 표준 톤 재사용. 세그먼트 길이가 0 이면(토큰 drift 등) 아무 것도
 * 그리지 않는다.
 */
function drawHoverShimmer(
  ctx: CanvasRenderingContext2D,
  kind: NodeShapeDrawState["kind"],
  x: number,
  y: number,
  radius: number,
  farT: number,
  now: number,
  periodMs: number,
  segRatio: number,
  color: string,
): void {
  const perimeter = outlinePerimeter(kind, radius, farT);
  const { dash, offset } = computeHoverShimmer(now, periodMs, perimeter, segRatio);
  if (dash[0] <= 0) return;
  const points = bodyPointsScratch(kind, x, y, radius);
  if (points === null || farT > FULL_CIRCLE_FAR_T) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  } else {
    roundedPolygonPath(ctx, points, interpolateCornerRadius(minCornerRadius(kind, radius), radius, farT));
  }
  ctx.setLineDash([...dash]);
  ctx.lineDashOffset = offset;
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.globalAlpha = 1;
}

/**
 * Draws one node body (fill/stroke/dash + kind-specific shape morph + hub
 * ring + engraved numeral + via-hole for elements). Does NOT draw the
 * diffraction spike overlay (`render/starfield.ts#drawDiffractionSpike`
 * owns that — it's a far-field-only "magnitude" overlay, orthogonal to
 * shape-by-kind) or the label (`render/labels.ts`).
 */
export function draw(ctx: CanvasRenderingContext2D, state: NodeShapeDrawState, tokens: NodeShapeTokens): void {
  const {
    kind,
    screenX: x,
    screenY: y,
    screenRadius: r,
    farT,
    egoState,
    fill,
    stroke,
    lineWidth,
    dash,
    hub,
    sheenTop,
    countLabel,
    isHovered,
    hoverEmphasis,
    selectionPulse,
    agentFocus,
    spotlightRing,
    now,
    reducedMotion,
    glyphStyle,
    depthShade = 0,
    detail = 1,
  } = state;

  const { lineOnly, lineWidthScale } = glyphStyleDescriptor(glyphStyle);

  // perf 2026-08-19 — 대시 없는 노드(대다수)는 대시 호출을 아예 안 낸다.
  // 모든 painter 가 파선을 쓰고 나면 [] 로 되돌리는 규약이라(traces ·
  // cluster-chips · dome-rings · frame-draw 링 블록 · 이 함수 자신) 진입
  // 대시 상태는 항상 비어 있다 — 매 노드 2회이던 네이티브 호출·스프레드
  // 할당이 fresh/stale 파선 노드에서만 남는다.
  const hasDash = dash.length > 0;
  if (hasDash) ctx.setLineDash([...dash]);
  const points = bodyPointsScratch(kind, x, y, r);
  if (points === null || farT > FULL_CIRCLE_FAR_T) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else {
    roundedPolygonPath(ctx, points, interpolateCornerRadius(minCornerRadius(kind, r), r, farT));
  }
  // 라인 세트: 채움 없이 flat 다크 바디(hole-fill) — 뒤 엣지가 비치지 않도록
  // 투명 대신 다크로 채우되 금속 sheen 은 생략(순수 외곽선 독법). 기하 세트:
  // 기존 kind fill + sheen 그라디언트. 실루엣(패스)은 위에서 이미 동일하게 그림.
  ctx.fillStyle = lineOnly ? tokens.holeFill : resolveBodyFill(ctx, x, y, r, farT, fill, sheenTop);
  ctx.fill();
  /*
   * 입체 음영 (3D) — 위 `depthShade` 독블록. 방금 채운 **그 패스 그대로**
   * (canvas 의 fill 은 현재 경로를 비우지 않는다) 한 번 더 채우므로 실루엣이
   * 어긋날 수 없다. 반지름이 몇 px 인 노드에서는 기울기가 잡음이 되므로
   * 최소 크기 아래에서는 건너뛴다.
   */
  if (depthShade > 0.01 && r >= NODE_DEPTH_SHADE_MIN_RADIUS_PX) {
    /*
     * **그라디언트는 캐시한다.** 이 분기는 3D 에서 노드마다 도는데, 캔버스
     * 그라디언트 객체는 만들 때마다 새로 태어난다 — 125노드 × 120Hz 면 초당
     * 1만 5천 개고, 그 청구서는 프레임 시간이 아니라 GC 가 끼어드는 순간의
     * 튐으로 온다.
     *
     * 캐시 키는 **반지름과 세기를 반올림한 값**이다. 그라디언트의 모양은 그
     * 둘만으로 정해지고(중심 오프셋·정지점 모두 r 과 세기의 함수), 0.5px·0.05
     * 단위 아래의 차이는 화면에서 구별되지 않는다. 좌표는 키에 안 넣는다 —
     * 아래에서 `translate` 로 옮겨 쓰기 때문이다.
     */
    const key = `${Math.round(r * 2)}:${Math.round(depthShade * 20)}`;
    let shade = shadeGradientCache.get(key);
    if (!shade) {
      shade = buildDepthShade(ctx, r, depthShade);
      // 캐시가 무한히 자라지 않게 — 반지름×세기 조합은 유한하지만, 줌이
      // 연속이라 오래 돌면 수천 칸이 된다. 넘치면 통째로 비운다(LRU 를
      // 만들 만큼 비싼 객체가 아니다).
      if (shadeGradientCache.size > SHADE_CACHE_MAX) shadeGradientCache.clear();
      shadeGradientCache.set(key, shade);
    }
    // perf 2026-08-19 — save/restore(전체 상태 스택) 대신 역이동으로 되돌린다.
    // 기본 변환은 DPR 순수 스케일(tx=0)이라 `translate(x,y)` 후 `translate(-x,-y)`
    // 는 부동소수점까지 정확히 원상이다(0 + d - d = 0). 이 블록이 바꾸는 다른
    // 상태는 fillStyle 뿐이고, 다음 획이 어차피 자기 스타일을 먼저 세팅한다.
    ctx.translate(x, y);
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.translate(-x, -y);
  }
  /*
   * 외곽선 — 먼 쪽 상세 램프(`detail` 독블록). 채움 세트에서 외곽선은 fill 위에
   * 얹는 **부가 획**이라 뒤쪽 반구에서 알파로 연속 페이드 후 생략한다. 라인
   * 세트(lineOnly)의 외곽선은 마크 자체라 어느 깊이에서도 그대로 — 「노드를
   * 없애지 않는다」는 계약이 그 경로에서는 외곽선에 걸려 있다.
   */
  const strokeFade = lineOnly ? 1 : detail;
  if (strokeFade >= 0.999) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth * lineWidthScale;
    ctx.stroke();
  } else if (strokeFade > 0.01) {
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * strokeFade;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth * lineWidthScale;
    ctx.stroke();
    ctx.globalAlpha = prevAlpha;
  }
  if (hasDash) ctx.setLineDash([]);

  // Domain chip-leg pin ticks — circuit-only detail, fades out with altitude
  // (prototype: `s > 6 && farT < 0.9`, alpha `1 - smoothstep(0.55,0.9,farT)`).
  // 먼 쪽 상세 램프 — 뒤쪽 반구에서 틱 알파를 detail 로 함께 접는다(연속).
  if (kind === "domain" && egoState !== "dim" && detail > 0.01) {
    const s = r * DOMAIN_HALF_EXTENT_RATIO;
    if (s > DOMAIN_PIN_MIN_HALF_EXTENT && farT < DOMAIN_PIN_MAX_FAR_T) {
      ctx.globalAlpha = (1 - smoothstep(0.55, 0.9, farT)) * detail;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      for (const t of domainPinTicks(x, y, s)) {
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  if (kind === "element") {
    const half = r * 0.92;
    if (half > 3 && farT < 0.9) {
      ctx.globalAlpha = 1 - smoothstep(0.55, 0.9, farT);
      ctx.beginPath();
      ctx.arc(x, y, half * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = tokens.holeFill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  if (hub && egoState !== "dim") {
    strokeKindOutline(ctx, kind, x, y, r + 4, farT, tokens.amberHub, 1.4, 1);
  }

  // W6 agent visibility — the fresh heartbeat's current target gets a static amber
  // hairline ring (owner spec: "정적 1px, r+8", same signal tone as the hub
  // ring/project hexagon amber — never a new color system). Independent of
  // `hub`/`egoState === "center"` — an agent-focused node can simultaneously
  // be a hub or the user's own selection; the rings stack at their own
  // offsets (hub r+4, selection r/r+6, this one r+8) rather than replacing
  // each other.
  if (agentFocus && egoState !== "dim") {
    strokeKindOutline(ctx, kind, x, y, r + AGENT_FOCUS_RING_OFFSET, farT, tokens.amberHub, 1, 1);
  }

  // 스포트라이트 변경-노드 링 (Image #14 처방) — amberHub **회전 파선**
  // kind-outline. 오프셋 r+6: hub(r+4)·agentFocus(r+8) 사이의 자기 자리 —
  // 셋이 공존해도 스택(대체 아님). lineDashOffset 이 회전 위상; reduced-
  // motion 은 호출자가 dashOffset 0 을 고정해 정적 파선이 된다. glow 0.
  if (spotlightRing !== null && egoState !== "dim") {
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -spotlightRing.dashOffset;
    strokeKindOutline(ctx, kind, x, y, r + 6, farT, tokens.recentChange, 1.2, spotlightRing.alpha);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  // Canvas-emphasis slice §A — project hexagon's own decorative identity
  // (design.md: "Hub 노드와 Layer 0 컨테이너에만 보조 톤(앰버) 허용"). The
  // OUTER amber stroke is the body's own `stroke` (set by
  // `topology-frame-draw.ts#resolveNodeVisual` for kind==="project", not
  // here) — this block only adds the inner offset hairline + the 4-direction
  // chassis pin ticks, both fading out toward far field like domain's pins.
  if (kind === "project" && egoState !== "dim") {
    if (r > PROJECT_DECOR_MIN_RADIUS && farT < PROJECT_DECOR_MAX_FAR_T) {
      const decorAlpha = 1 - smoothstep(0.55, 0.9, farT);
      strokeKindOutline(ctx, "project", x, y, r * PROJECT_HAIRLINE_INNER_RATIO, farT, tokens.projectHairlineInner, 1, decorAlpha);
      ctx.globalAlpha = decorAlpha;
      ctx.strokeStyle = tokens.projectPinTick;
      ctx.lineWidth = 1;
      for (const t of projectPinTicks(x, y, r)) {
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // Canvas-emphasis slice §C — hover preview: a static 1px indigo hairline
  // ring, "잡을 수 있다" (can grab this) affordance. `isHovered` is only ever
  // true while no focus is active (`topology-frame-draw.ts` nulls
  // `hoveredNodeId` under focus), so this never collides with the selection
  // ring below — but the `egoState` guards stay as defense in depth.
  if (isHovered && egoState !== "dim" && egoState !== "center") {
    // rank5 — ring alpha rides the body's hover-ripple wake (`emphasisById`,
    // rise τ 0.09) so it fades up with the disc instead of a first-frame hard
    // pop. Omitted emphasis → 1 (pre-rank5 solid ring); reduced-motion snaps
    // emphasis to 1 upstream, so the ring is instantly solid there.
    const ringAlpha = Math.min(1, Math.max(0, hoverEmphasis ?? 1));
    strokeKindOutline(ctx, kind, x, y, r + HOVER_RING_OFFSET, farT, tokens.hoverRing, 1, ringAlpha);
    // Design Guardian 처방 L — shimmer 아크는 정지 링 위의 순수 모션 오버레이라
    // reduced-motion 사용자에겐 정지 링만 남기고 완전히 미표시(새 분기 없이
    // 여기 한 곳에서만 게이트).
    if (!reducedMotion) {
      drawHoverShimmer(
        ctx,
        kind,
        x,
        y,
        r + HOVER_RING_OFFSET,
        farT,
        now,
        tokens.hoverShimmerPeriodMs,
        tokens.hoverShimmerSeg,
        tokens.hoverShimmerColor,
      );
    }
  }

  // #5 — connected-neighbor ring. Every direct neighbor of the selected node
  // gets a single THIN pale-indigo ring on its outline so "what this connects
  // to" is visible as nodes, not only as highlighted edges (owner report: the
  // relation lit up but the node on the other end stayed invisible). Same
  // indigo hue as the center's ring, one value paler and thinner — the
  // charter's value-only selection ladder, never a new blue hue. Sits below
  // the `center` block so a node that is somehow both never double-draws.
  if (egoState === "neighbor") {
    strokeKindOutline(ctx, kind, x, y, r, farT, tokens.neighborRing, 1.25, 1);
  }

  // Canvas-emphasis slice §B — the selected node's STATIC double ring (2px on
  // the outline + a 6px-out 1px hairline), plus its brief one-shot commit
  // pulse (`model/selection-pulse.ts`). The double ring is unconditional
  // while `egoState === "center"` — it never animates itself, so it reads as
  // a fixed "this is selected" fact even after the pulse (if any) finishes.
  if (egoState === "center") {
    strokeKindOutline(ctx, kind, x, y, r, farT, tokens.selectionIndigo, 2, 1);
    strokeKindOutline(ctx, kind, x, y, r + SELECTION_RING_OUTER_OFFSET, farT, tokens.selectionHairline, 1, 1);
    if (selectionPulse) {
      const pulseRadius = (r + SELECTION_PULSE_RING_OFFSET) * selectionPulse.scaleFactor;
      strokeKindOutline(ctx, kind, x, y, pulseRadius, farT, tokens.selectionIndigo, 1.5, selectionPulse.alpha);
    }
  }

  if (countLabel !== null && r > ENGRAVED_COUNT_MIN_RADIUS && egoState !== "dim" && farT < 0.9) {
    // Project's engraved count reads amber, not neutral gray — the same
    // Layer-0-container tint as its body stroke (design.md), so the numeral
    // doesn't look like a leftover from the generic domain/capability treatment.
    const numeralTokens = kind === "project" ? { ...tokens, numeralFace: tokens.amberHub } : tokens;
    drawEngraved(ctx, countLabel, x, y + r * 0.52, Math.max(8, Math.min(11, r * 0.4)), 1 - smoothstep(0.5, 0.9, farT), numeralTokens);
  }
}
