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
}

export interface LabelTokens {
  labelProject: string;
  labelDomain: string;
  labelCapability: string;
  labelElement: string;
}

/** Font string per kind — single source shared by `draw` and `measureLabelWidth` so measured bboxes match painted glyphs. */
export const LABEL_FONT: Record<LabelDrawState["kind"], string> = {
  project: "600 13px -apple-system, 'SF Pro Text', sans-serif",
  domain: "600 10px -apple-system, 'SF Pro Text', sans-serif",
  capability: "500 10.5px -apple-system, 'SF Pro Text', sans-serif",
  element: "400 9.5px -apple-system, 'SF Pro Text', sans-serif",
};

/** Approximate glyph height per kind (px) — used to build the label bbox for greedy suppression. */
export const LABEL_FONT_SIZE: Record<LabelDrawState["kind"], number> = {
  project: 13,
  domain: 10,
  capability: 10.5,
  element: 9.5,
};

/** Manual letter-tracking added to domain labels (they're uppercased + tracked, see `drawTrackedText`). */
const DOMAIN_TRACKING = 1.6;

/**
 * Measures a label's painted width for bbox suppression. Mirrors `draw`'s
 * per-kind font + the domain uppercase/tracking, so the measured box matches
 * what actually lands on the canvas.
 */
export function measureLabelWidth(ctx: CanvasRenderingContext2D, kind: LabelDrawState["kind"], text: string): number {
  ctx.font = LABEL_FONT[kind];
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
 * unchanged from the original formula: ramps 1:1 with `farT`, `0` while dim.
 * Deliberately independent of `computeLabelAlpha` above so this effect never
 * fights the always-readable compact label it complements (label-clarity).
 *
 * Exported so `ui/topology-frame-draw.ts`'s label-candidate ELIGIBILITY gate
 * can factor it in too — `computeLabelAlpha` alone hits 0 for domain at
 * farT=1 (the compact label has fully handed off), and a gate keyed only to
 * that alpha would skip building the candidate entirely, silently deleting
 * the watermark along with it (the far-field constellation would go BLANK,
 * not just lose the compact label — the opposite of "stays as-is").
 */
export function computeDomainWatermarkAlpha(farT: number, egoState: LabelDrawState["egoState"]): number {
  return egoState === "dim" ? 0 : farT;
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
 * Draws one node's label. Domain draws up to TWO things at the same anchor —
 * the always-readable compact label (`computeLabelAlpha`) and the separate
 * far-field spaced-caps watermark (`computeDomainWatermarkAlpha`) — since
 * they occupy complementary farT ranges the visible overlap window is brief.
 * Every other kind draws nothing when its single alpha resolves to <=0.02.
 */
export function draw(ctx: CanvasRenderingContext2D, state: LabelDrawState, tokens: LabelTokens): void {
  const { kind, text, screenX: x, screenY: y, screenRadius: r, farT, egoState, isHovered, revealAlpha } = state;
  const ty = y + r + LABEL_OFFSET[kind];

  if (kind === "domain") {
    const watermarkAlpha = computeDomainWatermarkAlpha(farT, egoState);
    if (watermarkAlpha > 0.02) {
      ctx.font = LABEL_FONT.domain;
      drawTrackedText(ctx, text.toUpperCase(), x, ty, tokens.labelDomain, DOMAIN_TRACKING, watermarkAlpha);
    }
    const compactAlpha = computeLabelAlpha({ kind, farT, egoState, isHovered, revealAlpha });
    if (compactAlpha > 0.02) {
      ctx.font = LABEL_FONT.domain;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = tokens.labelDomain;
      ctx.globalAlpha = compactAlpha;
      ctx.fillText(text, x, ty);
      ctx.globalAlpha = 1;
    }
    return;
  }

  const alpha = computeLabelAlpha({ kind, farT, egoState, isHovered, revealAlpha });
  if (alpha <= 0.02) return;

  if (kind === "project") {
    ctx.font = LABEL_FONT.project;
    ctx.fillStyle = tokens.labelProject; // §2.2 --topology-v2-label-project (was a prototype literal)
  } else if (kind === "capability") {
    ctx.font = LABEL_FONT.capability;
    ctx.fillStyle = tokens.labelCapability;
  } else {
    ctx.font = LABEL_FONT.element;
    ctx.fillStyle = tokens.labelElement;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = alpha;
  ctx.fillText(text, x, ty);
  ctx.globalAlpha = 1;
}
