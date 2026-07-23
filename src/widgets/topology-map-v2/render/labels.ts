/**
 * Node label paint — ported from the B2+ prototype's `drawTracked()`/
 * `drawLabel()` (`docs/prototypes/topology-b2plus.html` §12-13).
 *
 * (label-clarity, 2026-07) — REDESIGNED per the 5-persona eval ("이름 없는
 * 도형 지도"): domain/project chips at the default circuit zoom showed only
 * an engraved COUNT numeral, no name — the name existed only as an
 * ultra-low-contrast far-field spaced-caps watermark two personas never
 * found. Ego-revealed children (capability/element, C1 A2's tier exemption)
 * drew as unlabeled dark circles. New per-kind contract:
 * - `project`: always visible, plain text, no letter-tracking (unchanged).
 * - `domain`: a COMPACT plain-case label (`computeLabelAlpha`) reads at
 *   EVERY zoom band — full at circuit (`farT=0`), fading out only as the
 *   camera pulls back toward the constellation altitude. The original
 *   tracked-caps "sky-chart" watermark is now a SEPARATE decorative
 *   atmosphere layer (`computeDomainWatermarkAlpha`, unchanged formula:
 *   alpha = farT) drawn ADDITIONALLY at the same anchor — it's the far-field
 *   flourish, not the label system, so it keeps its own low-contrast
 *   spaced-caps identity while the compact label carries readability.
 * - `capability`/`element`: eligibility now ramps with the node's own
 *   `revealAlpha` (its effective/tier alpha this frame — the SAME signal
 *   `model/tier-visibility.ts#effectiveNodeAlpha` computes and
 *   `ui/topology-pointer-handlers.ts`'s `HITTABLE_MIN_TIER_ALPHA` gates
 *   hit-testing on), not a raw camera-scale threshold. "잡을 수 있으면 읽을
 *   수 있다" (if you can click it, you can read it) — an ego-revealed child
 *   now gets a label the instant it's clickable, ramping in together.
 * - The SELECTED (`egoState === "center"`) or currently HOVERED node's name
 *   is now ALWAYS drawn at full contrast, any kind, any zoom band — no
 *   exclusion for capability/element (the old prototype-ported exclusion is
 *   retired; a selected/hovered node must never read as a nameless circle).
 * - `egoState === "dim"`: always 0, as before.
 *
 * `computeLabelAlpha` extracts the per-kind alpha formula above (a plain
 * function evaluation, unit-tested in `labels.test.ts` without a canvas).
 * `draw()` itself is Canvas 2D text painting — its visual legibility (light
 * mode contrast in particular) is left as `test.todo`, a Design Guardian
 * screenshot-review question rather than a formula this file gets wrong.
 */

import { smoothstep } from "../model/altitude";

export interface LabelDrawState {
  kind: "project" | "domain" | "capability" | "element";
  text: string;
  screenX: number;
  screenY: number;
  /** World-space node radius × camera.scale (used to offset label below the node). */
  screenRadius: number;
  farT: number;
  egoState: "center" | "neighbor" | "dim" | "normal";
  /** Whether this node is the currently-hovered node (no focus active). Floors its label to full contrast, same as `egoState === "center"`. */
  isHovered: boolean;
  /** The node's own effective/tier alpha this frame (`model/tier-visibility.ts#effectiveNodeAlpha`) — ties capability/element label eligibility to "if you can click it, you can read it". Ignored by project/domain. */
  revealAlpha: number;
  /**
   * W6 agent visibility — true when this label belongs to the agent
   * heartbeat's current focus node (mirrors `NodeShapeDrawState.agentFocus`
   * in `render/node-shapes.ts`). Draws a small amber `drawActivityMark` dot
   * just past the label's own text, "노드 라벨 옆 소형 Activity 마크" per the
   * owner spec — real heartbeat data only, `false` otherwise.
   */
  agentFocus: boolean;
  /** B5 — 라벨 줌 스케일 (`labelZoomScale(cameraScale)`, 기본 1). */
  fontScale?: number;
  /**
   * rank9 — LOD present 램프 0..1(기본 1). greedy 배치 집합에 방금 진입한 라벨은
   * 0→1 로, 이탈한(아직 화면엔 있는) 라벨은 1→0 으로 이 값이 움직여 "라벨
   * 깜빡임"을 페이드로 바꾼다. 최종 라벨 알파에 선형으로 곱한다(색/알파만).
   * 미지정=1(하위호환).
   */
  presenceAlpha?: number;
}

export interface LabelTokens {
  labelProject: string;
  labelDomain: string;
  labelCapability: string;
  labelElement: string;
  /** W6 agent visibility — same amber signal tone as the node ring (`NodeShapeTokens.amberHub`), reused here for the label-side activity mark. */
  amberHub: string;
}

/**
 * Font string per kind — single source shared by `draw` and
 * `measureLabelWidth` so measured bboxes match painted glyphs.
 *
 * Project bumped 13→15px (canvas-emphasis slice §A4, "라벨 폰트 1단계 업") —
 * the project name is the Layer-0 anchor's own label and should read a full
 * step above domain/capability/element, not just barely above domain's 10px.
 */
/** Approximate glyph height per kind (px) — used to build the label bbox for greedy suppression. */
const LABEL_FONT_SIZE: Record<LabelDrawState["kind"], number> = {
  project: 15,
  domain: 10,
  capability: 10.5,
  element: 9.5,
};

/** 폰트 weight — 스케일된 폰트 문자열 조립용 (LABEL_FONT_SIZE/FAMILY 와 단일 진실원). */
const LABEL_FONT_WEIGHT: Record<LabelDrawState["kind"], number> = {
  project: 600,
  domain: 600,
  capability: 500,
  element: 400,
};

const LABEL_FONT_FAMILY = "-apple-system, 'SF Pro Text', sans-serif";

/**
 * B5 — 라벨 줌 스케일: 카메라 스케일의 준선형(지수 0.4) 함수, [1, 1.9] 캡.
 * 200px 육각형에 10px 캡션이 붙는 "빌보드 캡션" 역전의 해소 — 지수 0.4 라
 * 라벨이 노드를 절대 압도하지 않는다.
 */
export function labelZoomScale(cameraScale: number): number {
  if (!Number.isFinite(cameraScale) || cameraScale <= 1) return 1;
  return Math.min(1.9, Math.pow(cameraScale, 0.4));
}

/** 스케일 적용 폰트 크기 — 0.5px 양자화 (widthCache 키·페인트 공용). */
export function scaledLabelFontSize(kind: LabelDrawState["kind"], scale: number): number {
  return Math.round(LABEL_FONT_SIZE[kind] * scale * 2) / 2;
}

/** 스케일 적용 폰트 문자열. */
export function scaledLabelFont(kind: LabelDrawState["kind"], scale: number): string {
  return `${LABEL_FONT_WEIGHT[kind]} ${scaledLabelFontSize(kind, scale)}px ${LABEL_FONT_FAMILY}`;
}

/** Manual letter-tracking added to domain labels (they're uppercased + tracked, see `drawTrackedText`). */
const DOMAIN_TRACKING = 1.6;

// Per-frame render-loop profile (perf sweep, 2026-07 —
// `performance.mark`-instrumented `topology-frame-draw.ts` walk) found
// ~830 `ctx.measureText` calls PER FRAME at 120Hz on the dogfood vault (400K+
// over a 4s window) — the single largest canvas-API cost in the paint path.
// The bulk comes from `ellipsizeToWidth` (render/label-layout.ts) re-testing
// every word-boundary substring of a label EVERY frame, even though a node's
// `(kind, text)` pair — and therefore its measured width — never changes
// between frames (only the camera/ego state does). `LABEL_FONT` is a fixed
// per-kind constant (not themable), so `(kind, text)` deterministically
// implies the same width for the lifetime of the page — safe to memoize
// forever, no invalidation needed. This turns the steady-state cost from
// O(frames × visible labels × boundary chars) into O(distinct label
// substrings), computed once.
const widthCache = new Map<string, number>();

function measureLabelWidthUncached(
  ctx: CanvasRenderingContext2D,
  kind: LabelDrawState["kind"],
  text: string,
  scale: number,
): number {
  ctx.font = scaledLabelFont(kind, scale);
  if (kind === "domain") {
    const upper = text.toUpperCase();
    let total = 0;
    for (let i = 0; i < upper.length; i += 1) {
      total += ctx.measureText(upper[i]).width + (i < upper.length - 1 ? DOMAIN_TRACKING : 0);
    }
    return total;
  }
  return ctx.measureText(text).width;
}

/**
 * Measures a label's painted width for bbox suppression. Mirrors `draw`'s
 * per-kind font + the domain uppercase/tracking, so the measured box matches
 * what actually lands on the canvas. Cached by `kind + text` (see file header
 * above) — callers that need a fresh disk-verified measurement (none today)
 * should call `measureLabelWidthUncached` directly instead.
 */
export function measureLabelWidth(
  ctx: CanvasRenderingContext2D,
  kind: LabelDrawState["kind"],
  text: string,
  scale = 1,
): number {
  // B5 함정 해소 (Guardian) — 폰트가 가변이 된 순간 캐시 키가 크기를
  // 포함해야 한다. 크기는 0.5px 양자화라 키 공간이 폭발하지 않는다.
  const key = kind + "|" + scaledLabelFontSize(kind, scale) + "|" + text;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;
  const width = measureLabelWidthUncached(ctx, kind, text, scale);
  widthCache.set(key, width);
  return width;
}

/** capability/element label eligibility ramp, in `revealAlpha` units — matches `model/tier-visibility.ts#HITTABLE_MIN_TIER_ALPHA` (0.5) as the floor, full readability by 0.85. */
const CHILD_LABEL_REVEAL_MIN = 0.5;
const CHILD_LABEL_REVEAL_FULL = 0.85;

export interface LabelAlphaInput {
  kind: LabelDrawState["kind"];
  farT: number;
  egoState: LabelDrawState["egoState"];
  isHovered: boolean;
  revealAlpha: number;
}

/**
 * Resolves a label's opacity for this frame. `0` whenever the node is
 * `"dim"` (ego focus owns visibility there); `1` unconditionally for the
 * SELECTED node or the currently-hovered node, any kind (no more
 * unlabeled-circle selections/hovers); otherwise the per-kind formula:
 * project always 1, domain reads at every zoom band (fading only toward the
 * far-field handoff — see the file header for the separate watermark),
 * capability/element ramp with the node's own `revealAlpha`.
 */
export function computeLabelAlpha(input: LabelAlphaInput): number {
  const { kind, farT, egoState, isHovered, revealAlpha } = input;
  if (egoState === "dim") return 0;
  if (egoState === "center" || isHovered) return 1;

  if (kind === "project") return 1;
  if (kind === "domain") return Math.max(0, 1 - farT);
  return smoothstep(CHILD_LABEL_REVEAL_MIN, CHILD_LABEL_REVEAL_FULL, revealAlpha);
}

/**
 * The domain far-field "sky-chart" watermark — a SEPARATE decorative
 * atmosphere layer (tracked-caps, low contrast by design at mid-altitude),
 * ramping 1:1 with `farT` while NO focus is active. Deliberately independent
 * of `computeLabelAlpha` above so this effect never fights the always-readable
 * compact label it complements (label-clarity).
 *
 * Exported so `ui/topology-frame-draw.ts`'s label-candidate ELIGIBILITY gate
 * can factor it in too — `computeLabelAlpha` alone hits 0 for domain at
 * farT=1 (the compact label has fully handed off), and a gate keyed only to
 * that alpha would skip building the candidate entirely, silently deleting
 * the watermark along with it (the far-field constellation would go BLANK,
 * not just lose the compact label — the opposite of "stays as-is").
 *
 * Dive-zoom fix (owner symptom: the watermark colliding with the now-visible
 * compact label — "V I E Views (Topo…" — during a focus dive): a dive can land
 * at a scale where farT hasn't fully reached 0 yet, but C1 A2's ego exemption
 * already makes the compact label visible there — the two effects overlapped.
 * The watermark now silences to 0 whenever ANY focus is active (`egoState !==
 * "normal"` — that's `"center"`/`"neighbor"` for the ego set, `"dim"` for
 * everyone else), restoring the instant focus clears. Only the truly
 * unfocused far-field view (`"normal"`) still gets the flourish.
 */
export function computeDomainWatermarkAlpha(farT: number, egoState: LabelDrawState["egoState"]): number {
  return egoState === "normal" ? farT : 0;
}

/**
 * W6 agent visibility — activity-mark dot radius + gap past the label
 * text's own measured width. Exported so `ui/topology-frame-draw.ts`'s
 * label-candidate bbox can reserve the extra width for greedy-suppression
 * (an agent-focus label's mark must not get overlapped by a neighboring
 * label placed right after it).
 */
export const ACTIVITY_MARK_RADIUS = 2.4;
export const ACTIVITY_MARK_GAP = 5;

/**
 * The small solid amber dot marking a node's label as the agent heartbeat's
 * current focus ("노드 라벨 옆 소형 Activity 마크"). A plain filled circle —
 * no glow/shadow (design.md) — positioned by the caller just past the
 * label's own measured text width so it never overlaps the glyphs.
 */
export function drawActivityMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0.02) return;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, ACTIVITY_MARK_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Screen-Y offset below the node's own radius, per kind (prototype `drawLabel()`). */
export const LABEL_OFFSET: Record<LabelDrawState["kind"], number> = {
  project: 20,
  domain: 17,
  capability: 13,
  element: 13,
};

/** Manual letter-tracking for canvas text (no native `letter-spacing`) — ported from `drawTracked()`. */
function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  color: string,
  tracking: number,
  alpha: number,
): void {
  const widths: number[] = [];
  let total = 0;
  for (let i = 0; i < text.length; i += 1) {
    const width = ctx.measureText(text[i]).width;
    widths.push(width);
    total += width + (i < text.length - 1 ? tracking : 0);
  }
  let x = cx - total / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < text.length; i += 1) {
    ctx.fillText(text[i], x, cy);
    x += widths[i] + tracking;
  }
  ctx.globalAlpha = 1;
}

/**
 * 계기 캡션 — 지도 주석(결계 센서스 등)용 tracked-caps 한 줄. 도메인 워터마크와
 * 정확히 같은 문법(10px 600 + 1.6 트래킹 + 대문자)을 화면 고정 크기로 그린다 —
 * 줌과 무관하게 항상 판독계 크기로 읽히는 annotation 잉크. 신규 폰트/토큰 0.
 */
export function drawInstrumentCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0.02) return;
  ctx.font = scaledLabelFont("domain", 1);
  drawTrackedText(ctx, text.toUpperCase(), cx, cy, color, DOMAIN_TRACKING, alpha);
}

/**
 * Draws one node's label. Domain draws up to TWO things at the same anchor —
 * the always-readable compact label (`computeLabelAlpha`) and the separate
 * far-field spaced-caps watermark (`computeDomainWatermarkAlpha`) — since
 * they occupy complementary farT ranges the visible overlap window is brief.
 * Every other kind draws nothing when its single alpha resolves to <=0.02.
 */
export function draw(ctx: CanvasRenderingContext2D, state: LabelDrawState, tokens: LabelTokens): void {
  const { kind, text, screenX: x, screenY: y, screenRadius: r, farT, egoState, isHovered, revealAlpha, agentFocus } = state;
  const fontScale = state.fontScale ?? 1;
  // rank9 — LOD present 램프(기본 1)를 최종 라벨 알파에 선형 곱한다.
  const presenceAlpha = Math.min(1, Math.max(0, state.presenceAlpha ?? 1));
  const ty = y + r + LABEL_OFFSET[kind] * fontScale;

  if (kind === "domain") {
    const watermarkAlpha = computeDomainWatermarkAlpha(farT, egoState) * presenceAlpha;
    if (watermarkAlpha > 0.02) {
      ctx.font = scaledLabelFont("domain", fontScale);
      drawTrackedText(ctx, text.toUpperCase(), x, ty, tokens.labelDomain, DOMAIN_TRACKING, watermarkAlpha);
    }
    const compactAlpha = computeLabelAlpha({ kind, farT, egoState, isHovered, revealAlpha }) * presenceAlpha;
    if (compactAlpha > 0.02) {
      ctx.font = scaledLabelFont("domain", fontScale);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = tokens.labelDomain;
      ctx.globalAlpha = compactAlpha;
      ctx.fillText(text, x, ty);
      ctx.globalAlpha = 1;
      if (agentFocus) {
        const width = measureLabelWidth(ctx, "domain", text, fontScale);
        drawActivityMark(ctx, x + width / 2 + ACTIVITY_MARK_GAP, ty - LABEL_FONT_SIZE.domain * 0.35, tokens.amberHub, compactAlpha);
      }
    }
    return;
  }

  const alpha = computeLabelAlpha({ kind, farT, egoState, isHovered, revealAlpha }) * presenceAlpha;
  if (alpha <= 0.02) return;

  if (kind === "project") {
    ctx.font = scaledLabelFont("project", fontScale);
    ctx.fillStyle = tokens.labelProject; // §2.2 --topology-v2-label-project (was a prototype literal)
  } else if (kind === "capability") {
    ctx.font = scaledLabelFont("capability", fontScale);
    ctx.fillStyle = tokens.labelCapability;
  } else {
    ctx.font = scaledLabelFont("element", fontScale);
    ctx.fillStyle = tokens.labelElement;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = alpha;
  ctx.fillText(text, x, ty);
  ctx.globalAlpha = 1;

  if (agentFocus) {
    const width = measureLabelWidth(ctx, kind, text, fontScale);
    drawActivityMark(ctx, x + width / 2 + ACTIVITY_MARK_GAP, ty - scaledLabelFontSize(kind, fontScale) * 0.35, tokens.amberHub, alpha);
  }
}
