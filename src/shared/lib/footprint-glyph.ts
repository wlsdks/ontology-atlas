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
 * `model/footprint-ring.ts` under `widgets/topology-map-v2`). Its structural limit
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

import {
  FOOTPRINT_EDGE_COUNT,
  FOOTPRINT_EDGE_SCALE,
  type FootprintPreference,
} from "./appearance-preferences";

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
/** Below this the silhouette — ball and heel as two blobs — stops reading. */
export const FOOTPRINT_MIN_SIZE = 3.5;

/** Print size clamped to the node radius in screen space. Pure function (under test). */
export function footprintSizeFor(baseSize: number, screenNodeRadius: number): number {
  if (!Number.isFinite(screenNodeRadius) || screenNodeRadius <= 0) return baseSize;
  // `footprintPairRadius(size) = size * 0.9`, so clamp against that radius.
  const capped = (FOOTPRINT_NODE_RATIO * screenNodeRadius) / 0.9;
  return Math.max(FOOTPRINT_MIN_SIZE, Math.min(baseSize, capped));
}

/**
 * The shoe-print silhouette — ball and heel are **two separate blobs**. That gap is
 * the whole silhouette; joined up it is just an ellipse. Procedural paths only, no
 * asset imports.
 *
 * Returns the function that draws the heel: fill/stroke the ball first, then call it,
 * so each blob ends up its own closed shape.
 */
function shoeSole(ctx: CanvasRenderingContext2D, s: number, mirror: boolean): () => void {
  const m = mirror ? -1 : 1;
  ctx.beginPath();
  ctx.ellipse(m * s * 0.02, -s * 0.26, s * 0.26, s * 0.36, m * 0.12, 0, Math.PI * 2);
  ctx.closePath();
  return () => {
    ctx.beginPath();
    ctx.ellipse(m * -s * 0.06, s * 0.34, s * 0.19, s * 0.2, m * 0.12, 0, Math.PI * 2);
    ctx.closePath();
  };
}

/** Offsets for the pair beside a node — one foot ahead, one behind, or it does not read as a stride. */
const PAIR_OFFSET = [
  { dx: -0.3, dy: 0.1, mirror: false },
  { dx: 0.3, dy: -0.1, mirror: true },
] as const;

/**
 * Draws a footprint at the current transform origin. With `singleFoot`, one foot (for
 * edges); without it, both (for nodes).
 */
function drawSoles(ctx: CanvasRenderingContext2D, pref: FootprintPreference, size: number, singleFoot?: boolean): void {
  const paint = () => (pref.filled ? ctx.fill() : ctx.stroke());
  const feet =
    singleFoot === undefined ? PAIR_OFFSET : [{ dx: 0, dy: 0, mirror: singleFoot } as const];
  for (const foot of feet) {
    ctx.save();
    ctx.translate(foot.dx * size, foot.dy * size);
    const heel = shoeSole(ctx, size, foot.mirror);
    paint();
    heel();
    paint();
    ctx.restore();
  }
}

/**
 * Sets ink, stroke width and bloom, then runs `draw`.
 *
 * ⚠️ `bloom` goes out as `shadowBlur`. The charter forbids glow, so the **default is
 * always 0** and this branch never executes while it is 0 — turning it on is an
 * explicit user choice.
 */
function withFootprintInk(
  { ctx, pref, ink }: FootprintPaintContext,
  alpha: number,
  draw: () => void,
): void {
  const rgb = `${ink[0]}, ${ink[1]}, ${ink[2]}`;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.lineWidth = pref.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (pref.bloom > 0) {
    ctx.shadowColor = `rgba(${rgb}, 0.9)`;
    ctx.shadowBlur = pref.bloom;
  }
  draw();
  ctx.restore();
}

/**
 * Radius (px) a pair of prints occupies — measured on the diagonal, since the feet are
 * offset from each other. `PAIR_OFFSET`'s largest excursion (0.3) plus one foot's
 * half-height (0.6).
 */
export function footprintPairRadius(size: number): number {
  return size * 0.9;
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

/** Stamps one pair of prints beside a node. */
export function drawNodeFootprint(
  paint: FootprintPaintContext,
  x: number,
  y: number,
  nodeRadius: number,
  alpha: number,
): void {
  const k = paint.scale ?? 1;
  const size = footprintSizeFor(paint.pref.size * k, nodeRadius);
  const at = footprintAnchor(x, y, nodeRadius, paint.pref.gap * k, size);
  // The entrance is expressed as **position**: the foot slides out from the node as if
  // stepping away. Growing it in would read as a marker that keeps animating.
  const appear = paint.appear ?? 1;
  const slide = (1 - appear) * size * 0.45;
  withFootprintInk(paint, alpha * appear, () => {
    paint.ctx.translate(at.x - slide * Math.SQRT1_2, at.y + slide * Math.SQRT1_2);
    drawSoles(paint.ctx, paint.pref, size);
  });
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

/**
 * Positions and angles of the prints left along one relation line. Kept pure and apart
 * from rendering: "does it clear the line" and "does it touch the node" are properties
 * of **coordinates**, not of the picture, so they can be locked down without a canvas.
 */
export function edgeFootprintPlacements(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  pref: FootprintPreference,
  scale = 1,
): { x: number; y: number; angle: number; mirror: boolean; fade: number }[] {
  const size = pref.size * scale;
  const gap = pref.gap * scale;
  const count = FOOTPRINT_EDGE_COUNT[pref.edgeDensity];
  const angle = Math.atan2(by - ay, bx - ax);
  const nx = Math.cos(angle + Math.PI / 2);
  const ny = Math.sin(angle + Math.PI / 2);
  const len = Math.hypot(bx - ax, by - ay);
  // Leave both ends empty — a print touching a node is misread as node decoration.
  const pad = size * 1.6;
  const usable = len - pad * 2;
  if (usable <= 0) return [];

  /**
   * For a print to actually clear the line the offset must be **the gap plus the print's
   * half-width**. `gap` alone only moves the print's centre, so anything wider gets the
   * line running through its middle — exactly what the installed app showed (gap 8px,
   * print half-width ~3px and up). The owner's requirement *"Don't overlap the line"* is an **edge** condition, not a centre-distance one.
   *
   * Half-width is the ball ellipse's x radius (`size * 0.26`) scaled, plus half the stroke
   * width — it grows with the print, so enlarging the glyph cannot bring the overlap back.
   */
  const glyphHalfWidth = size * FOOTPRINT_EDGE_SCALE * 0.26 + pref.strokeWidth / 2;
  const offset = gap + glyphHalfWidth;

  const out: { x: number; y: number; angle: number; mirror: boolean; fade: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (pad + (usable * (i + 0.5)) / count) / len;
    const alt = i % 2 === 0 ? 1 : -1;
    // "right": a single row on one side. "both": alternating either side of the line.
    const d = pref.placement === "both" ? alt * offset : offset;
    out.push({
      x: ax + (bx - ax) * t + nx * d,
      y: ay + (by - ay) * t + ny * d,
      angle: angle + Math.PI / 2,
      mirror: alt < 0,
      // Leading prints are darker — direction ("which end did I come from"), not recency.
      fade: 0.5 + 0.5 * (1 - i / Math.max(1, count - 1)),
    });
  }
  return out;
}

/** Stamps prints alongside one relation line. */
export function drawEdgeFootprints(
  paint: FootprintPaintContext,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  alpha: number,
): void {
  const { ctx, pref } = paint;
  const k = paint.scale ?? 1;
  for (const spot of edgeFootprintPlacements(ax, ay, bx, by, pref, k)) {
    withFootprintInk(paint, alpha * spot.fade, () => {
      ctx.translate(spot.x, spot.y);
      ctx.rotate(spot.angle);
      drawSoles(ctx, pref, pref.size * k * FOOTPRINT_EDGE_SCALE, spot.mirror);
    });
  }
}
