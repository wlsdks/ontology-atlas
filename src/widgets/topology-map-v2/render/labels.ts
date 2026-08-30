/**
 * Node label paint — ported from the B2+ prototype's `drawTracked()`/
 * `drawLabel()` (`docs/prototypes/topology-b2plus.html` §12-13).
 *
 * (label-clarity, 2026-07) — REDESIGNED per the 5-persona eval, which called it
 * "a map of nameless shapes" (a map of nameless shapes): domain/project chips at the
 * default circuit zoom showed only
 * an engraved COUNT numeral, no name — the name existed only as an
 * ultra-low-contrast far-field spaced-caps watermark two personas never
 * found. Ego-revealed children (capability/element, C1 A2's tier exemption)
 * drew as unlabeled dark circles. New per-kind contract:
 * - `project`: always visible, plain text, no letter-tracking (unchanged).
 * - `domain`: a COMPACT plain-case label that reads at EVERY zoom band,
 *   including the constellation altitude. It used to fade out toward the far
 *   field and hand its anchor to a tracked-caps "sky-chart" watermark; both the
 *   fade and the watermark were retired on 2026-08-29 (`docs/DECISIONS.md`).
 *   The watermark failed twice as a naming device: the label-clarity personas
 *   never found it, and under hover it destroyed the name it was standing in
 *   for — `computeLabelAlpha` floors a hovered label to 1 while the watermark
 *   kept its own alpha, so the two painted the same characters at one baseline
 *   (`I N M E N T O R Y` over `Inventory`, measured on the installed app). A
 *   name that cannot survive being pointed at is not a name. The domain now
 *   carries one form at every altitude, and the resting map says what its
 *   regions are called instead of showing anonymous circles.
 * - `capability`/`element`: eligibility now ramps with the node's own
 *   `revealAlpha` (its effective/tier alpha this frame — the SAME signal
 *   `model/tier-visibility.ts#effectiveNodeAlpha` computes and
 *   `ui/topology-pointer-handlers.ts`'s `HITTABLE_MIN_TIER_ALPHA` gates
 *   hit-testing on), not a raw camera-scale threshold. "if you can click it, you can read it" (if you can click it, you can read it) — an ego-revealed child
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
import { HITTABLE_MIN_TIER_ALPHA } from "../model/tier-visibility";

export interface LabelDrawState {
  kind: "project" | "domain" | "capability" | "element";
  text: string;
  screenX: number;
  screenY: number;
  /** World-space node radius × camera.scale (used to offset label below the node). */
  screenRadius: number;
  egoState: "center" | "neighbor" | "dim" | "normal";
  /** Whether this node is the currently-hovered node (no focus active). Floors its label to full contrast, same as `egoState === "center"`. */
  isHovered: boolean;
  /** The node's own effective/tier alpha this frame (`model/tier-visibility.ts#effectiveNodeAlpha`) — ties capability/element label eligibility to "if you can click it, you can read it". Ignored by project/domain. */
  revealAlpha: number;
  /**
   * W6 agent visibility — true when this label belongs to the agent
   * heartbeat's current focus node (mirrors `NodeShapeDrawState.agentFocus`
   * in `render/node-shapes.ts`). Draws a small amber `drawActivityMark` dot
   * just past the label's own text, per the owner spec "small Activity mark next to node label" — real heartbeat data only, `false` otherwise.
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
function scaledLabelFont(kind: LabelDrawState["kind"], scale: number): string {
  return `${LABEL_FONT_WEIGHT[kind]} ${scaledLabelFontSize(kind, scale)}px ${LABEL_FONT_FAMILY}`;
}

/**
 * Manual letter-tracking for the instrument caption's tracked caps
 * (`drawInstrumentCaption`). It was the domain watermark's tracking first; the
 * watermark is retired and the caption kept the grammar.
 */
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
  // Every kind now measures the string it paints. A domain used to be measured
  // as uppercase-plus-tracking because that was the watermark's form, so its
  // suppression box described a label that is no longer drawn — wider than the
  // compact label it was reserving space for.
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

/**
 * capability/element label eligibility ramp, in `revealAlpha` units. The floor
 * is `model/tier-visibility.ts#HITTABLE_MIN_TIER_ALPHA` **by import, not by
 * coincidence** — a child is nameable exactly when it is clickable, and the two
 * cannot drift apart in a later edit. Full readability arrives by 0.85.
 */
const CHILD_LABEL_REVEAL_MIN = HITTABLE_MIN_TIER_ALPHA;
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
  egoState: LabelDrawState["egoState"];
  isHovered: boolean;
  revealAlpha: number;
}

/**
 * Resolves a label's opacity for this frame. `0` whenever the node is
 * `"dim"` (ego focus owns visibility there); `1` unconditionally for the
 * SELECTED node or the currently-hovered node, any kind (no more
 * unlabeled-circle selections/hovers); otherwise the per-kind formula:
 * project and domain always 1, capability/element ramp with the node's own
 * `revealAlpha`.
 *
 * ⚠️ **The domain's far-field fade was removed on 2026-08-29.** It expressed a
 * handoff to the tracked-caps watermark, and the watermark is gone (file
 * header). Keeping the fade without its partner would leave the spine
 * nameless at exactly the altitude a person meets first: measured on the
 * installed app, the storefront vault's resting camera painted about ninety
 * circles and passively named one of them, the project. Nine domain names is
 * the whole of what this restores — the children stay anonymous until their
 * own tier arrives, which is a separate question owned by the label budget.
 */
export function computeLabelAlpha(input: LabelAlphaInput): number {
  const { kind, egoState, isHovered, revealAlpha } = input;
  if (egoState === "dim") return 0;
  if (egoState === "center" || isHovered) return 1;

  if (kind === "project" || kind === "domain") return 1;
  return smoothstep(CHILD_LABEL_REVEAL_MIN, CHILD_LABEL_REVEAL_FULL, revealAlpha);
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
 * current focus (owner spec: "Small Activity mark beside the node label" — a small
 * activity mark beside the node label). A plain filled circle —
 * no glow/shadow (design.md) — positioned by the caller just past the
 * label's own measured text width so it never overlaps the glyphs.
 */
function drawActivityMark(
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
 * Draws one node's label — **one form per node, at one anchor**.
 *
 * A domain used to draw two, a compact label and a tracked-caps watermark, kept
 * apart by a farT handoff. Hover was never party to that handoff: it floors the
 * compact label to 1 while the watermark keeps its own alpha, so pointing at a
 * domain painted its name twice, superimposed. The watermark is retired
 * (2026-08-29); nothing here can collide with itself any more.
 */
export function draw(ctx: CanvasRenderingContext2D, state: LabelDrawState, tokens: LabelTokens): void {
  const { kind, text, screenX: x, screenY: y, screenRadius: r, egoState, isHovered, revealAlpha, agentFocus } = state;
  const fontScale = state.fontScale ?? 1;
  // LOD presence (default 1) multiplies linearly into the final label alpha.
  const presenceAlpha = Math.min(1, Math.max(0, state.presenceAlpha ?? 1));
  const ty = state.baselineY ?? resolveLabelBaselineY(kind, y, r, fontScale);

  const alpha = computeLabelAlpha({ kind, egoState, isHovered, revealAlpha }) * presenceAlpha;
  if (alpha <= 0.02) return;

  if (kind === "project") {
    ctx.font = scaledLabelFont("project", fontScale);
    ctx.fillStyle = tokens.labelProject; // §2.2 --topology-v2-label-project (was a prototype literal)
  } else if (kind === "domain") {
    ctx.font = scaledLabelFont("domain", fontScale);
    ctx.fillStyle = tokens.labelDomain;
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
