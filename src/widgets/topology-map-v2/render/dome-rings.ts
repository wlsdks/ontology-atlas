/**
 * Renderer for the 3D dome's **latitude rings**. Why the rings must exist at all
 * is in the `DOME_RING_KINDS` doc-block of `model/dome-view.ts` — in short,
 * without them the arrangement reads as a tent rather than a dome, and rotation
 * has no reference.
 *
 * **Why a polyline and not one ellipse.** Drawing it in a single `ctx.ellipse`
 * call gives **one alpha per stroke**, so the whole ring is equally bright, front
 * and back are indistinguishable, and the ring stops being a depth cue and
 * becomes a border. All this file does is split that circle into segments so each
 * arc gets **the ink of its own depth** — the rear half sinks into fog while the
 * near half stays, and that asymmetry *is* which way is front.
 *
 * **This file knows nothing of tokens.** Per the `render/*` convention (set by
 * `node-shapes.ts`) every colour arrives as an argument; the values live in
 * `model/dome-view.ts` for the physics and in the token reader for the colours.
 */

interface DomeRingScreenSample {
  x: number;
  y: number;
  /** Normalised depth this frame: 0 near … 1 far. */
  u: number;
}

interface DomeRingScreen {
  /** That tier's assembly factor 0..1, so rings rise and fade with their tier across the 2D↔3D transition. */
  a: number;
  points: readonly DomeRingScreenSample[];
  /**
   * The tier's name and where to hang it — Strata's four plane rings carry one,
   * every cone base carries none. `x`/`y` are the ring's screen-rightmost point.
   */
  label?: { x: number; y: number; text: string } | null;
}

export interface DomeRingsDrawState {
  rings: readonly DomeRingScreen[];
  /** Base opacity, before fog and the tier factor are multiplied in. */
  baseAlpha: number;
  /** Base width in screen px, multiplied by the depth width falloff. */
  baseWidthPx: number;
  /** Depth → fog multiplier. The caller passes the **same function** nodes and edges use. */
  fog: (u: number) => number;
  /** Depth → width multiplier. The caller passes the **same function** nodes and edges use. */
  widthFactor: (u: number) => number;
  /**
   * Rightmost x a tier name may occupy (screen px) — the label safe rect's right
   * edge. Past it the name flips to the inside of its own ring; see the label
   * loop. Omitted, nothing flips.
   */
  labelMaxX?: number;
}

export interface DomeRingsTokens {
  /** Ring ink — the lowest ink rank, that of a coordinate system. */
  stroke: string;
  /** Tier-name ink. A name has to be read, so it is a step above the ring it names. */
  labelFill: string;
  /** Font string for a tier name — assembled by the caller from the label ramp. */
  labelFont: string;
}

/**
 * Gap between a ring's right edge and its tier name (screen px), and the name's
 * opacity.
 *
 * The name hangs **outside** the plane rather than on it: a legend that sits over
 * the data it labels is the thing the three.js probe had to fix twice. The
 * opacity is a fixed number rather than the ring's fog, because the anchor is the
 * ellipse's right extreme — always mid-depth, so fog would only dim a name that
 * exists to be read, and dim it by the same amount every frame.
 *
 * **0.85, not the 0.62 this shipped at first.** Measured on the sample vault at
 * 1512 (2026-09-06): 0.62 of `--topology-v2-label-element` (#7e7e87) composites
 * to #525259 on the canvas ground, **2.55 : 1** — under the map's own 3 : 1 ink
 * floor, and on screen the four tier names read as smudges rather than words.
 * 0.85 composites to #6d6d75, **3.86 : 1**. It is still a step below a domain
 * name at full ink, so the plane label does not outrank the data on it; it is
 * simply legible, which is the entire reason the label exists.
 */
const RING_LABEL_GAP_PX = 8;
const RING_LABEL_ALPHA = 0.85;

/**
 * Draws every ring for one frame. The caller invokes this **before the edges** —
 * the rings are the stage, not the actors, so relations and nodes must sit on
 * top of them.
 *
 * This function overwrites `ctx.globalAlpha` and restores it on exit.
 */
export function draw(ctx: CanvasRenderingContext2D, state: DomeRingsDrawState, tokens: DomeRingsTokens): void {
  const { rings, baseAlpha, baseWidthPx, fog, widthFactor } = state;
  if (rings.length === 0) return;

  const prevAlpha = ctx.globalAlpha;
  const prevCap = ctx.lineCap;
  ctx.strokeStyle = tokens.stroke;
  ctx.lineCap = "butt";
  ctx.setLineDash([]);

  for (const ring of rings) {
    if (ring.a <= 0.01) continue;
    const points = ring.points;
    const count = points.length;
    if (count < 3) continue;
    for (let i = 0; i < count; i++) {
      const from = points[i];
      const to = points[(i + 1) % count];
      // A segment's depth is the mean of its two ends. Using an endpoint value
      // directly makes neighbouring segments claim different brightness at the
      // same point, showing a stair-step at every joint.
      const u = (from.u + to.u) / 2;
      const alpha = baseAlpha * fog(u) * ring.a;
      if (alpha <= 0.004) continue;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(0.35, baseWidthPx * widthFactor(u));
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = prevAlpha;
  ctx.lineCap = prevCap;
}

/**
 * Draws the **tier names** for the Strata plane rings.
 *
 * Separate from `draw` and called **after** the relations and nodes, not before.
 * A ring is the stage and belongs under the actors; a tier name is a **legend**,
 * and a legend that the data paints over is not one. Measured at 1040 on the
 * sample vault: drawn with the rings, "Domain" and "Element" were unreadable —
 * the fit puts the widest plane's rim at the canvas edge, so at that width there
 * is no clear space outside the ring to hang a name in and the name has to sit
 * on the plane. Four short words on top of the graph is the smaller cost.
 *
 * This function overwrites `ctx.globalAlpha`, `font`, `textAlign` and
 * `textBaseline`, and restores all four on exit.
 */
export function drawTierLabels(
  ctx: CanvasRenderingContext2D,
  state: DomeRingsDrawState,
  tokens: DomeRingsTokens,
): void {
  const named = state.rings.filter((ring) => ring.label && ring.a > 0.01);
  if (named.length === 0) return;
  const prevAlpha = ctx.globalAlpha;
  const prevFont = ctx.font;
  const prevAlign = ctx.textAlign;
  const prevBaseline = ctx.textBaseline;
  ctx.font = tokens.labelFont;
  ctx.fillStyle = tokens.labelFill;
  ctx.textBaseline = "middle";
  const maxX = state.labelMaxX ?? Number.POSITIVE_INFINITY;
  for (const ring of named) {
    const label = ring.label!;
    ctx.globalAlpha = RING_LABEL_ALPHA * ring.a;
    /*
     * Outside the ring by default, and on its inner side when outside would run
     * off the frame. Either way the name stays **on its own rim**, so which plane
     * it names is never in question; moving it somewhere emptier would break that.
     */
    const width = ctx.measureText(label.text).width;
    const outside = label.x + RING_LABEL_GAP_PX;
    if (outside + width <= maxX) {
      ctx.textAlign = "left";
      ctx.fillText(label.text, outside, label.y);
    } else {
      ctx.textAlign = "right";
      ctx.fillText(label.text, Math.min(label.x - RING_LABEL_GAP_PX, maxX), label.y);
    }
  }
  ctx.globalAlpha = prevAlpha;
  ctx.font = prevFont;
  ctx.textAlign = prevAlign;
  ctx.textBaseline = prevBaseline;
}
