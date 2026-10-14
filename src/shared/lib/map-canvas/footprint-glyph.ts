import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";

/**
 * Footprint glyph: the notation for the path you walked. It lives in `shared` because the map canvas
 * and the settings preview must draw the same picture. The shape is fixed; the user chooses only how
 * loudly it is stated. Prints sit beside relation lines, only for pairs that have a relation.
 */

import { type FootprintPreference } from "../preferences/appearance-preferences";

/** Footprint ink as an RGB triple — the caller reads it from a token and passes it in. */
export type FootprintInk = readonly [number, number, number];

export interface FootprintPaintContext {
  ctx: CanvasRenderingContext2D;
  pref: FootprintPreference;
  ink: FootprintInk;
  /**
   * Size factor from camera zoom, so prints retreat first when zoomed out and nodes and lines crowd
   * the screen. Defaults to 1.
   */
  scale?: number;
  /**
   * Entrance progress [0,1] of a freshly stamped print. 1 means settled.
   *
   * **An arrival, not a loop.** A permanent animation is the decorative motion the
   * charter forbids, and it also defeats ambient sleep. This rises 0→1 only at the
   * moment a step is created — the screen answering what the user just did, not a
   * background moving on its own.
   */
  appear?: number;
}

/** Bounds for the size factor — too small kills the shape channel, too large buries the graph. */
export const FOOTPRINT_SCALE_RANGE = { min: 0.55, max: 1.1 } as const;

/**
 * Camera zoom to footprint size factor; the floor keeps the print from collapsing to a single dot at
 * deep zoom-out.
 */
export function footprintScaleFor(cameraScale: number): number {
  if (!Number.isFinite(cameraScale) || cameraScale <= 0) return 1;
  const t = Math.sqrt(cameraScale);
  return Math.min(FOOTPRINT_SCALE_RANGE.max, Math.max(FOOTPRINT_SCALE_RANGE.min, t));
}

/**
 * A print never grows larger than the node it marks: `footprintScaleFor` is the square root of zoom
 * while node radius is linear, so the print is clamped to `FOOTPRINT_NODE_RATIO` times the node
 * radius. `FOOTPRINT_MIN_SIZE` keeps the cap from erasing the print on a 2px node at deep zoom-out.
 */
export const FOOTPRINT_NODE_RATIO = 1.0;
/** Below this the four arms merge into a blob and the mark stops reading as a star. */
export const FOOTPRINT_MIN_SIZE = 4;

/** The one place the mark's extent is defined; `footprintPairRadius` is this times size. */
const MARK_RADIUS_RATIO = 0.72;

/** Mark size clamped to the node radius in screen space. Pure function (under test). */
export function footprintSizeFor(baseSize: number, screenNodeRadius: number): number {
  if (!Number.isFinite(screenNodeRadius) || screenNodeRadius <= 0) return baseSize;
  const capped = (FOOTPRINT_NODE_RATIO * screenNodeRadius) / MARK_RADIUS_RATIO;
  return Math.max(FOOTPRINT_MIN_SIZE, Math.min(baseSize, capped));
}




/**
 * Draws a footprint at the current transform origin. With `singleFoot`, one foot (for
 * edges); without it, both (for nodes).
 */


/**
 * Radius (px) the mark occupies.
 *
 * The arms reach `0.62 * size`, and the value keeps a little air beyond them so the step
 * numeral beside it never sits on a spike. It was the diagonal of an offset pair of shoe
 * prints; the star is centred, so the same number now buys clearance instead of covering
 * an excursion.
 */
export function footprintPairRadius(size: number): number {
  return size * MARK_RADIUS_RATIO;
}

/**
 * Where the pair sits beside a node: upper right, the quadrant the label below does not use. The
 * distance includes the print radius, since `gap` alone measures to the print's centre and overlap
 * is an edge condition.
 */
export function footprintAnchor(
  x: number,
  y: number,
  nodeRadius: number,
  gap: number,
  size: number,
): { x: number; y: number } {
  // Placed on the 45° diagonal, so each axis gets 1/√2. Centre distance = node radius +
  // gap + print radius.
  const off = (nodeRadius + gap + footprintPairRadius(size)) * Math.SQRT1_2;
  return { x: x + off, y: y - off };
}


/**
 * Display string for visit-order numbers. A revisited node has several, and joining them
 * all buries the label — past 3 it collapses to **first · … · last + total**.
 *
 * The total is spelled out because `1·…·9` alone **erases** how many stops happened in
 * between, and "I keep coming back here" is the fact this notation exists to carry.
 * Abbreviating may reduce information; erasing it is loss, not abbreviation.
 *
 * Pure function (under test). First and last survive because "when did I first arrive
 * and when was I last here" is worth more than the middle visits.
 */
export function formatStepNumbers(steps: readonly number[], totalLabel = "총 %d회"): string {
  if (steps.length === 0) return "";
  if (steps.length <= 3) return steps.join("·");
  const total = totalLabel.replace("%d", String(steps.length));
  return `${steps[0]}·…·${steps[steps.length - 1]} (${total})`;
}

/** Step numbers beside a node — just above the prints. */
export function drawFootprintSteps(
  paint: FootprintPaintContext,
  x: number,
  y: number,
  nodeRadius: number,
  alpha: number,
  steps: readonly number[],
  color: string,
): void {
  const label = formatStepNumbers(steps);
  if (label === "") return;
  const { ctx, pref } = paint;
  const k = paint.scale ?? 1;
  const size = footprintSizeFor(pref.size * k, nodeRadius);
  const at = footprintAnchor(x, y, nodeRadius, pref.gap * k, size);
  ctx.save();
  ctx.globalAlpha = alpha * (paint.appear ?? 1);
  ctx.fillStyle = color;
  // The digits do not follow zoom all the way down — under 11px they stop being readable.
  ctx.font = `${FONT_WEIGHT.strong} ${Math.max(10, Math.round(11 * Math.max(k, 0.85)))}px ui-monospace, SFMono-Regular, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, at.x + footprintPairRadius(size) * 0.75, at.y - footprintPairRadius(size) * 0.75);
  ctx.restore();
}






