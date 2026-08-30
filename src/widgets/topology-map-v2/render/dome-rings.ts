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
}

export interface DomeRingsTokens {
  /** Ring ink — the lowest ink rank, that of a coordinate system. */
  stroke: string;
}

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
