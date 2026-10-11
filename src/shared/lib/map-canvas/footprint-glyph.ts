import { FONT_WEIGHT } from "@/shared/ui/font-weight";

/**
 * Footprint glyph — the visual notation for the path you walked.
 *
 * It lives in `shared` because the map canvas and the **settings preview** must
 * draw the same picture. A second implementation for the preview would drift, and
 * a preview that drifts is not a preview.
 *
 * **Why footprints and not a ring** (owner decision, 2026-07-29). The previous
 * notation was a concentric hairline ring on visited nodes (the old
 * `model/footprint-ring.ts` under `widgets/ontology-map`). Its structural limit
 * was that a ring shares the grammar of the node outline — the selection ring, the
 * expansion aura and the boundary are already circles, so the footprint ring became
 * a fourth circle whose meaning the user had to re-learn each time. Owner:
 * *"Show the visit order on the nodes you walked, and leave small
 * footprints along the connecting lines too."* (show the visit order on the nodes you walked, and leave small
 * footprints along the connecting lines too). A footprint sits **outside the circle
 * grammar**, so that collision cannot arise, and it carries what a ring could not:
 * direction (the toes point the way of travel) and order (the step number beside
 * the node).
 *
 * **The shape is not a setting.** Both-feet shoe prints, fixed. Letting users pick
 * the shape means different people see different pictures, and the screen can no
 * longer state what the mark means. The only thing a user chooses is **how loudly
 * the same meaning is stated** (`FootprintPreference`).
 *
 * **Beside the line, not on it.** Owner: *"Don't overlap the
 * line."* (don't overlap the line). A relation line is the channel carrying a typed fact (containment /
 * dependency); a mark laid on top makes two facts fight over one ink. Footprints
 * are offset along the normal and say only "someone passed along here".
 *
 * Drawn only for pairs that **have** a relation. Two consecutively visited nodes
 * may have none, and tracing prints between them would break the contract that a
 * line means a relation.
 */

import { type FootprintPreference } from "../preferences/appearance-preferences";

/** Footprint ink as an RGB triple — the caller reads it from a token and passes it in. */
export type FootprintInk = readonly [number, number, number];

export interface FootprintPaintContext {
  ctx: CanvasRenderingContext2D;
  pref: FootprintPreference;
  ink: FootprintInk;
  /**
   * Size factor taken from camera zoom — zooming out shrinks the prints too.
   *
   * Owner decision: *"I want to avoid overlaps; it is fine for footprints to shrink
   * as nodes recede."* (nothing should overlap; it is fine for footprints to shrink
   * as nodes recede). Overlap is worst when **zoomed out**: nodes and relation lines
   * crowd the screen, and prints held at a fixed pixel size would bury the graph.
   * Tying them to zoom makes the prints retreat first.
   *
   * Defaults to 1.
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
 * Camera zoom → footprint size factor. Pure function (under test).
 *
 * 1.0 at zoom 1.0, shrinking as you zoom out but stopping at the floor. Not left
 * strictly proportional, because at deep zoom-out the print collapses to **a single
 * dot** and can no longer say "you walked here".
 */
export function footprintScaleFor(cameraScale: number): number {
  if (!Number.isFinite(cameraScale) || cameraScale <= 0) return 1;
  const t = Math.sqrt(cameraScale);
  return Math.min(FOOTPRINT_SCALE_RANGE.max, Math.max(FOOTPRINT_SCALE_RANGE.min, t));
}

/**
 * A print **never grows larger than the node it marks** (2026-08-02, owner:
 * *"Tighten how the
 * footprint size adapts when the window gets small."* — tighten how the
 * footprint size adapts when the window gets small).
 *
 * `footprintScaleFor` above is the **square root** of camera zoom while node radius
 * is **linear**, so the further you zoom out the larger a print gets relative to its
 * node. Measured:
 *
 * | Camera zoom | Print vs node |
 * |---|---|
 * | 1.0 | 1.00× |
 * | 0.5 | 1.41× |
 * | 0.3 | 1.83× |
 * | 0.2 | 2.75× |
 *
 * The square root itself is right — strict proportionality collapses the print to a
 * dot at deep zoom-out (see above). **What needs fixing is the cap, not the slope**:
 * clamp the print radius to `FOOTPRINT_NODE_RATIO` × the node radius. Large nodes
 * (domains, projects) are already under the cap and do not move at all; only small
 * element nodes shrink. The change lands only where the problem was.
 *
 * The separate floor (`FOOTPRINT_MIN_SIZE`) exists because at deep zoom-out, where a
 * node is 2px, a cap alone erases the print — returning to the exact failure the
 * square root was there to prevent.
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
 * Where the pair sits beside a node — upper right, the quadrant the label (below) does
 * not use.
 *
 * ⚠️ The distance **includes the print radius**. Without it `gap` is the distance to the
 * print's *centre*, and the print bites into the node disc (measured in the installed
 * app — owner: *"I want to avoid overlapping."*, nothing should overlap). Overlap is an
 * edge condition, not a centre condition.
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






