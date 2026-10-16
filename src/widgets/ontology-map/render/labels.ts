/**
 * Node label paint, ported from the B2+ prototype (`docs/prototypes/topology-b2plus.html`).
 * Project and domain names read at every zoom band; capability and element names ramp with the node's
 * own `revealAlpha`; a selected or hovered node is always full contrast; a dim node is 0.
 */

import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { smoothstep } from "../model/visibility/altitude";
import { HITTABLE_MIN_TIER_ALPHA } from "../model/visibility/tier-visibility";
import { lerpColorHex } from "./grid";

export interface LabelDrawState {
  kind: "project" | "domain" | "capability" | "element";
  text: string;
  screenX: number;
  screenY: number;
  screenRadius: number;
  egoState: "center" | "neighbor" | "dim" | "normal";
  /** Whether this node is the currently-hovered node (no focus active). Floors its label to full contrast, same as `egoState === "center"`. */
  isHovered: boolean;
  /** The node's own effective/tier alpha this frame (`model/visibility/tier-visibility.ts#effectiveNodeAlpha`) — ties capability/element label eligibility to "if you can click it, you can read it". Ignored by project/domain. */
  revealAlpha: number;
  /** Explicit reading-scope emphasis, 0..1. Raises opacity without pretending the label is hovered or selected. */
  emphasisAlpha?: number;
  /**
   * True when this label belongs to the agent heartbeat's focus node; draws a small amber dot just
   * past the label text. Real heartbeat data only, `false` otherwise.
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
  /**
   * The canvas the names stand on, stroked under each glyph so the edges beneath stop at
   * the letterform instead of running through it. The ground itself, never a colour
   * spreading outward — see {@link LABEL_HALO_PX}.
   */
  labelHalo: string;
}

/**
 * Half-width of the ground outline every name is stroked with, in CSS px. Relations are drawn at
 * `lineWidth = 1` and radial diagonals land on labels, so 2px clears the widest line by 1px.
 * Stroked before the fill so the glyph is never thickened.
 */
export const LABEL_HALO_PX = 2;

/** Clearance of the project name's ground plate beyond its glyph box, in CSS px. */
const PROJECT_PLATE_PAD_X = 6;
const PROJECT_PLATE_PAD_Y = 2;

/**
 * Size per kind, on the locked type ramp: title, body, label, caption. Shared by `draw` and
 * `measureLabelWidth` so measured boxes match painted glyphs.
 */
const LABEL_FONT_SIZE: Record<LabelDrawState["kind"], number> = {
  project: 16,
  domain: 12.5,
  capability: 11,
  element: 9.5,
};

/** Weight per kind, on the ladder (`FONT_WEIGHT`), so the hierarchy reads in weight as well as size. */
const LABEL_FONT_WEIGHT: Record<LabelDrawState["kind"], number> = {
  project: FONT_WEIGHT.strong,
  domain: FONT_WEIGHT.emphasis,
  capability: FONT_WEIGHT.signature,
  element: 400,
};

const FALLBACK_LABEL_FAMILY = "-apple-system, 'SF Pro Text', sans-serif";
const LADDER_WEIGHTS = [400, FONT_WEIGHT.signature, FONT_WEIGHT.emphasis, FONT_WEIGHT.strong];
let labelFamily: string | null = null;
let adopting: Promise<boolean> | null = null;

/** The page's text family for its locale (`--font-sans`), the one source for every canvas face. */
export function productFontFamily(): string | null {
  if (typeof document === "undefined" || !document.documentElement || typeof getComputedStyle !== "function") return null;
  return getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || null;
}

/** The family canvas names are drawn in: the product family once every ladder weight has loaded. */
export function labelFontFamily(): string {
  if (labelFamily === null && adopting === null) void adoptBodyLabelFont();
  return labelFamily ?? FALLBACK_LABEL_FAMILY;
}

async function adopt(): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts) return false;
  const family = productFontFamily();
  if (family === null) return false;
  const faces = LADDER_WEIGHTS.map((weight) => `${weight} 12px ${family}`);
  try {
    await Promise.all(faces.map((face) => document.fonts.load(face)));
  } catch {
    return false;
  }
  if (!faces.every((face) => document.fonts.check(face))) return false;
  labelFamily = family;
  widthCache.clear();
  return true;
}

/** Resolves true once the product family became the label family, so the caller can repaint once. */
export function adoptBodyLabelFont(): Promise<boolean> {
  adopting ??= adopt();
  return adopting;
}

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
  return labelFontAt(kind, scaledLabelFontSize(kind, scale));
}

/** A kind's weight and family at an exact size, for surfaces that size their own type. */
export function labelFontAt(kind: LabelDrawState["kind"], px: number): string {
  return `${LABEL_FONT_WEIGHT[kind]} ${px}px ${labelFontFamily()}`;
}

export const NUMERAL_FONT_PX = LABEL_FONT_SIZE.capability;

/** Counts on the map: the label step at the strongest weight, in the names' family. */
export function numeralFont(): string {
  return `${FONT_WEIGHT.strong} ${NUMERAL_FONT_PX}px ${labelFontFamily()}`;
}

export const TABULAR_DIGITS = "0123456789";

/** Width of `text` with every digit on the widest digit's advance: tabular figures by hand. */
export function tabularWidth(text: string, font: string, measure: (text: string, font: string) => number): number {
  const cell = Math.max(...[...TABULAR_DIGITS].map((d) => measure(d, font)));
  let width = 0;
  for (const ch of text) width += TABULAR_DIGITS.includes(ch) ? cell : measure(ch, font);
  return width;
}

/** Letter-tracking for the instrument caption's tracked caps (`drawInstrumentCaption`). */
const DOMAIN_TRACKING = 1.6;

// The paint path once called `ctx.measureText` ~830 times a frame. A width depends only on the font
// string and the text, so it is measured once per pair.
const widthCache = new Map<string, number>();

function measureLabelWidthUncached(
  ctx: CanvasRenderingContext2D,
  kind: LabelDrawState["kind"],
  text: string,
  scale: number,
): number {
  ctx.font = scaledLabelFont(kind, scale);
  // Every kind measures the string it paints, so the suppression box matches the drawn label.
  return ctx.measureText(text).width;
}

/** Measures a label's painted width for bbox suppression, in `draw`'s font, cached per font and text. */
export function measureLabelWidth(
  ctx: CanvasRenderingContext2D,
  kind: LabelDrawState["kind"],
  text: string,
  scale = 1,
): number {
  const key = scaledLabelFont(kind, scale) + "|" + text;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;
  const width = measureLabelWidthUncached(ctx, kind, text, scale);
  widthCache.set(key, width);
  return width;
}

/**
 * capability/element label eligibility ramp, in `revealAlpha` units. The floor
 * is `model/visibility/tier-visibility.ts#HITTABLE_MIN_TIER_ALPHA` **by import, not by
 * coincidence** — a child is nameable exactly when it is clickable, and the two
 * cannot drift apart in a later edit. Full readability arrives by 0.85.
 */
const CHILD_LABEL_REVEAL_MIN = HITTABLE_MIN_TIER_ALPHA;
const CHILD_LABEL_REVEAL_FULL = 0.85;

/**
 * Vertical extent of the label box. `fontBoundingBox*` is a property of the font, not the string,
 * so it is constant per kind and size and cached. jsdom and stub contexts return 0 or undefined;
 * those fall back to an approximation so no box gets zero height.
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
  const key = scaledLabelFont(kind, scale);
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
 * Resolves a label's opacity: a dim project or domain keeps `revealAlpha`, a dim child 0; a selected
 * or hovered node is 1; otherwise project and domain are 1 and capability or element ramp with
 * `revealAlpha`.
 */
export function computeLabelAlpha(input: LabelAlphaInput): number {
  const { kind, egoState, isHovered, revealAlpha } = input;
  if (egoState === "dim") return kind === "project" || kind === "domain" ? revealAlpha : 0;
  if (egoState === "center" || isHovered) return 1;

  if (kind === "project" || kind === "domain") return 1;
  return smoothstep(CHILD_LABEL_REVEAL_MIN, CHILD_LABEL_REVEAL_FULL, revealAlpha);
}

/**
 * The same opacity under a lens: the per-kind formula on the node's own reveal alpha, then the
 * lens sink as one multiplier. The sink is not folded into `revealAlpha`, which would charge
 * children twice.
 */
export function computeLensLabelAlpha(input: LabelAlphaInput & { lensSink: number }): number {
  const sink = Math.min(1, Math.max(0, input.lensSink));
  return computeLabelAlpha(input) * sink;
}

/**
 * W6 agent visibility — activity-mark dot radius + gap past the label
 * text's own measured width. Exported so `ui/frame-draw/paint-labels.ts`'s
 * label-candidate bbox can reserve the extra width for greedy-suppression
 * (an agent-focus label's mark must not get overlapped by a neighboring
 * label placed right after it).
 */
export const ACTIVITY_MARK_RADIUS = 2.4;
export const ACTIVITY_MARK_GAP = 5;

/**
 * Small solid amber dot marking the agent heartbeat's focus node; no glow, placed just past the
 * label's measured text width.
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
 * `draw()` and the bbox build in `frame-draw/paint-labels.ts` call **this same
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
 * Instrument caption — one tracked-caps line for map annotations, in the domain weight at the
 * caption step and a fixed screen size, so annotation ink reads at instrument scale at any zoom.
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
  ctx.font = labelFontAt("domain", LABEL_FONT_SIZE.element);
  drawTrackedText(ctx, text.toUpperCase(), cx, cy, color, DOMAIN_TRACKING, alpha);
}

export function draw(ctx: CanvasRenderingContext2D, state: LabelDrawState, tokens: LabelTokens): void {
  const { kind, text, screenX: x, screenY: y, screenRadius: r, egoState, isHovered, revealAlpha, agentFocus } = state;
  const fontScale = state.fontScale ?? 1;
  // LOD presence (default 1) multiplies linearly into the final label alpha.
  const presenceAlpha = Math.min(1, Math.max(0, state.presenceAlpha ?? 1));
  const ty = state.baselineY ?? resolveLabelBaselineY(kind, y, r, fontScale);

  const emphasisAlpha = Math.min(1, Math.max(0, state.emphasisAlpha ?? 0));
  // Same rule as the candidate pass, token included, so a dimmed domain that was placed is also drawn.
  const alpha = Math.max(
    computeLabelAlpha({ kind, egoState, isHovered, revealAlpha }),
    emphasisAlpha,
  ) * presenceAlpha;
  if (alpha <= 0.02) return;

  if (kind === "project") {
    ctx.font = scaledLabelFont("project", fontScale);
    ctx.fillStyle = tokens.labelProject; // §2.2 --map-label-project (was a prototype literal)
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
  if ((kind === "capability" || kind === "element") && emphasisAlpha > 0) {
    ctx.fillStyle = emphasisAlpha >= 1
      ? tokens.labelDomain
      : lerpColorHex(ctx.fillStyle as string, tokens.labelDomain, emphasisAlpha);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = alpha;
  /*
   * The ground, laid under the glyph first, so a relation running beneath this name stops
   * at the letterform. Same alpha as the name it defends: a halo that stayed opaque while
   * its label faded would leave a legible hole in the shape of a word nobody can read.
   */
  const fill = ctx.fillStyle;
  if (kind === "project" || kind === "domain") {
    /*
     * Anchor names (project, domain) get a ground plate under the glyph: relations converge on them and
     * the glyph halo alone leaves a line visible between words. Other names keep the halo alone.
     */
    const width = measureLabelWidth(ctx, kind, text, fontScale);
    const size = scaledLabelFontSize(kind, fontScale);
    ctx.fillStyle = tokens.labelHalo;
    ctx.fillRect(x - width / 2 - PROJECT_PLATE_PAD_X, ty - size - PROJECT_PLATE_PAD_Y, width + PROJECT_PLATE_PAD_X * 2, size * 1.25 + PROJECT_PLATE_PAD_Y * 2);
    ctx.fillStyle = fill;
  }
  ctx.strokeStyle = tokens.labelHalo;
  ctx.lineWidth = LABEL_HALO_PX * 2;
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, ty);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, ty);
  ctx.globalAlpha = 1;

  if (agentFocus) {
    const width = measureLabelWidth(ctx, kind, text, fontScale);
    drawActivityMark(ctx, x + width / 2 + ACTIVITY_MARK_GAP, ty - scaledLabelFontSize(kind, fontScale) * 0.35, tokens.amberHub, alpha);
  }
}
