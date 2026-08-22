/**
 * Node label paint — ported from the B2+ prototype's `drawTracked()`/
 * `drawLabel()` (`docs/prototypes/topology-b2plus.html` §12-13).
 *
 * (label-clarity, 2026-07) — REDESIGNED per the 5-persona eval, which called it
 * 「이름 없는 도형 지도」 (a map of nameless shapes): domain/project chips at the
 * default circuit zoom showed only
 * an engraved COUNT numeral, no name — the name existed only as an
 * ultra-low-contrast far-field spaced-caps watermark two personas never
 * found. Ego-revealed children (capability/element, C1 A2's tier exemption)
 * drew as unlabeled dark circles. New per-kind contract:
 * - `project`: always visible, plain text, no letter-tracking (unchanged).
 * - `domain`: a COMPACT plain-case label (`computeLabelAlpha`) reads at
 *   EVERY zoom band — full at circuit (`farT=0`), fading out only as the
 *   camera pulls back toward the constellation altitude. The original
 *   tracked-caps "sky-chart" watermark is now a SEPARATE decorative
 *   atmosphere layer (`computeDomainWatermarkAlpha`) drawn at the SAME
 *   anchor — it's the far-field flourish, not the label system, so it keeps
 *   its own low-contrast spaced-caps identity while the compact label
 *   carries readability. **The two never share a frame**: they hand the
 *   anchor over at `DOMAIN_LABEL_HANDOFF` instead of crossfading (see that
 *   constant — a crossfade painted the same name twice, tracked over
 *   untracked, and the 3D dome parks the camera right in that band).
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

/**
 * The farT at which the two effects drawing a domain's name **hand over** to
 * each other (2026-08-19).
 *
 * A domain draws two things at one anchor: the **compact label** meant to be
 * read, and the **wide-tracked watermark** that appears only from far away. The
 * old formulas were `1 - farT` and `farT` — not disjoint bands but a crossfade
 * summing to 1, so in the middle (farT ≈ 0.5) **both are alive**. The same
 * characters get painted over each other with different tracking, and the name
 * turns to mush.
 *
 * The old comment called the overlap window short, which assumed **the camera
 * passes through that band**. The 3D dome **parks** the camera there. Measured
 * 2026-08-19 (installed build, `docs/ontology`, dome): the footprint trail's
 * 「AI 에이전트 연동」 sat on screen as `AΛI에이전트 연동동`.
 *
 * So the crossfade becomes a **handoff**: compact reaches 0 here and the
 * watermark starts rising here. Both effects keep their identity; they just
 * never occupy the same frame. Both being exactly 0 at the crossing point is
 * the handoff, not a defect — it lasts only while passing that single farT, and
 * it beats an illegible name.
 */
export const DOMAIN_LABEL_HANDOFF = 0.5;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

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
   * just past the label's own text, per the owner spec 「노드 라벨 옆 소형
   * Activity 마크」 — real heartbeat data only, `false` otherwise.
   */
  agentFocus: boolean;
  /** Label zoom factor (`labelZoomScale(cameraScale)`), default 1. */
  fontScale?: number;
  /**
   * LOD presence, 0..1 (default 1). A label that just entered the greedy
   * placement set ramps 0→1, one that just left it (but is still on screen)
   * ramps 1→0, turning label flicker into a fade. Multiplied linearly into the
   * final label alpha — colour and alpha only.
   */
  presenceAlpha?: number;
  /**
   * The baseline the placer settled on, so a label flipped above its node
   * (`resolveFlippedLabelBaselineY`) is painted exactly where it was measured.
   * Omitted, this computes its own via `resolveLabelBaselineY` — the standalone
   * call and test path.
   */
  baselineY?: number;
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
 * Project bumped 13→15px (canvas-emphasis slice §A4, "one step up") —
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

/** Font weights for assembling the scaled font string — one source of truth alongside LABEL_FONT_SIZE/FAMILY. */
const LABEL_FONT_WEIGHT: Record<LabelDrawState["kind"], number> = {
  project: 600,
  domain: 600,
  capability: 500,
  element: 400,
};

const LABEL_FONT_FAMILY = "-apple-system, 'SF Pro Text', sans-serif";

/**
 * Label zoom factor: a sublinear (exponent 0.4) function of camera zoom, capped
 * to [1, 1.9]. It fixes the "billboard caption" inversion where a 200px hexagon
 * carried a 10px caption; the 0.4 exponent guarantees the label never
 * overwhelms its node.
 */
export function labelZoomScale(cameraScale: number): number {
  if (!Number.isFinite(cameraScale) || cameraScale <= 1) return 1;
  return Math.min(1.9, Math.pow(cameraScale, 0.4));
}

/** Scaled font size, quantised to 0.5px — shared by the widthCache key and the paint. */
export function scaledLabelFontSize(kind: LabelDrawState["kind"], scale: number): number {
  return Math.round(LABEL_FONT_SIZE[kind] * scale * 2) / 2;
}

/** Scaled font string. */
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
  // Once the font became variable the cache key had to include the size
  // (Guardian). Quantising to 0.5px keeps the key space from exploding.
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

/**
 * The label box's **vertical extent** — how much to reserve above and below the
 * baseline.
 *
 * Callers used to assume `ascent = fontSize` and a constant `descent = 2`. Both
 * were wrong, in opposite directions:
 *
 * - **ascent was too generous.** Latin cap height is roughly 0.7em, so
 *   reserving 1.0em creates unused space on top and labels push each other away
 *   more than they need to.
 * - **descent was too small**, and that is the real defect: `2` is a **constant
 *   while `fontSize` grows with zoom**, so the unreserved band below the
 *   baseline widens as you zoom in. Hangul jongseong and Latin descenders
 *   (g, y, p, j, q) spill out of it while the suppression check reports no
 *   overlap.
 *
 * `fontBoundingBox*` is a metric **of the font, not of the string**, so it is
 * constant for a given (kind, size) — hence measured once per font and cached.
 * It also keeps box height from varying with the string, matching `design.md`'s
 * dimensional regularity: the height of a repeated set is not a by-product of
 * its content.
 *
 * `actualBoundingBox*` (per-string ink) is rejected for the same reason: it
 * varies per string, and cross-engine differences are documented
 * (web-platform-tests/interop#159), making it unfit for pixel-precise
 * alignment. What is needed here is a **clearance box for overlap testing**.
 *
 * ⚠️ jsdom and some stub contexts return nothing here (0 or undefined). Those
 * fall back to the old approximation — no behaviour change, and no silently
 * zero-height box that would let every label overlap where measurement is
 * impossible.
 */
export interface LabelVerticalMetrics {
  /** Pixels to reserve **above** the baseline. */
  ascent: number;
  /** Pixels to reserve **below** the baseline. */
  descent: number;
}

const verticalMetricsCache = new Map<string, LabelVerticalMetrics>();

/** The old approximation — the fallback where measurement is impossible, and the regression baseline. */
function approximateVerticalMetrics(fontSize: number): LabelVerticalMetrics {
  return { ascent: fontSize, descent: 2 };
}

export function measureLabelVerticalMetrics(
  ctx: CanvasRenderingContext2D,
  kind: LabelDrawState["kind"],
  scale = 1,
): LabelVerticalMetrics {
  const fontSize = scaledLabelFontSize(kind, scale);
  const key = kind + "|" + fontSize;
  const cached = verticalMetricsCache.get(key);
  if (cached !== undefined) return cached;

  let metrics = approximateVerticalMetrics(fontSize);
  try {
    ctx.font = scaledLabelFont(kind, scale);
    // The measured string is arbitrary — `fontBoundingBox*` belongs to the font,
    // not the content. It is still non-empty because some implementations return
    // 0 for the empty string.
    const m = ctx.measureText("가Ag");
    const ascent = m.fontBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent;
    if (typeof ascent === "number" && typeof descent === "number" && ascent > 0 && descent > 0) {
      metrics = { ascent, descent };
    }
  } catch {
    // A stub context without measureText at all — keep the approximation.
  }
  verticalMetricsCache.set(key, metrics);
  return metrics;
}

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
  if (kind === "domain") return clamp01((DOMAIN_LABEL_HANDOFF - farT) / DOMAIN_LABEL_HANDOFF);
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
  if (egoState !== "normal") return 0;
  return clamp01((farT - DOMAIN_LABEL_HANDOFF) / (1 - DOMAIN_LABEL_HANDOFF));
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
 * current focus (owner spec: 「노드 라벨 옆 소형 Activity 마크」 — a small
 * activity mark beside the node label). A plain filled circle —
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

/**
 * Widest outline a node draws **outside** its disc (`screenRadius`). Matches
 * `SELECTION_RING_OUTER_OFFSET` (6) in `node-shapes.ts`, the spotlight ring
 * (+6), and the hover ring — for a selected node the visual bottom edge is that
 * ring, not the disc.
 */
export const LABEL_NODE_OUTLINE_ALLOWANCE = 6;

/** Minimum clearance between outline and label glyphs; at 0 they read as touching. */
export const LABEL_NODE_CLEARANCE = 3;

/**
 * The single source of truth for a label's baseline.
 *
 * The old formula was `y + r + LABEL_OFFSET × fontScale`, which never counts the
 * fact that **glyphs grow upward from the baseline**: a capability label's glyph
 * top sits at `y + r + (13 − 10.5) × fontScale`, only 2.5×fontScale below the
 * disc — while a selected node draws a ring 6px outside it. So **a selected node
 * always clipped its own label with its own ring** (measured: ring bottom 215 vs
 * label top 216, 1px of clearance). Raising fontScale does not help, because the
 * font grows with it — even at the 1.9 cap it is not enough.
 *
 * The baseline is therefore the lower of the offset formula and a **glyph-top
 * floor**. That floor is the ring allowance plus the minimum clearance, so no
 * kind at any zoom lets the name touch the shape's outline.
 *
 * `draw()` and the bbox build in `topology-frame-draw.ts` call **this same
 * function** — if they diverge, the measured box and the painted glyphs land in
 * different places (the old code had already diverged: bbox left the offset
 * unscaled while the paint scaled it).
 */
export function resolveLabelBaselineY(
  kind: LabelDrawState["kind"],
  screenY: number,
  screenRadius: number,
  fontScale = 1,
): number {
  const outlineBottom = screenY + screenRadius + LABEL_NODE_OUTLINE_ALLOWANCE;
  const byOffset = screenY + screenRadius + LABEL_OFFSET[kind] * fontScale;
  const byGlyphTop = outlineBottom + LABEL_NODE_CLEARANCE + scaledLabelFontSize(kind, fontScale);
  return Math.max(byOffset, byGlyphTop);
}

/**
 * Label baseline **above** the node — the alternative slot when the space below
 * is blocked by another shape. The baseline sits on the outline and the glyphs
 * grow upward from there, so the clearance only has to be computed once.
 */
export function resolveFlippedLabelBaselineY(
  screenY: number,
  screenRadius: number,
): number {
  return screenY - screenRadius - LABEL_NODE_OUTLINE_ALLOWANCE - LABEL_NODE_CLEARANCE;
}

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
 * Instrument caption — one tracked-caps line for map annotations. Exactly the
 * domain watermark's grammar (10px, weight 600, 1.6 tracking, uppercase) but at
 * a fixed screen size, so annotation ink always reads at instrument scale
 * regardless of zoom. No new fonts or tokens.
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
  // LOD presence (default 1) multiplies linearly into the final label alpha.
  const presenceAlpha = Math.min(1, Math.max(0, state.presenceAlpha ?? 1));
  const ty = state.baselineY ?? resolveLabelBaselineY(kind, y, r, fontScale);

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
