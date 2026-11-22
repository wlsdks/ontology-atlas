/**
 * The 3D dome's latitude rings as a polyline, not one `ctx.ellipse`: a single stroke has one alpha, so front
 * and back would look alike. Each segment takes the ink of its own depth, and that asymmetry is which way is
 * front. Colours arrive as arguments (the `render/*` convention).
 */

interface DomeRingScreenSample {
  x: number;
  y: number;
  /** Normalised depth this frame: 0 near … 1 far. */
  u: number;
}

interface DomeRingScreen {
  /** Which tier this ring belongs to — only the legend's raise reads it. */
  kind?: string;
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
  /** The tier whose ring is raised (the legend row under the pointer): it strokes in `tokens.strokeRaised` at full base alpha; null raises nothing. */
  raisedKind?: string | null;
}

export interface DomeRingsTokens {
  /** Ring ink — the lowest ink rank, that of a coordinate system. */
  stroke: string;
  strokeRaised?: string;
}

/** Draws every ring for one frame, before the edges: the rings are the stage, so relations and nodes sit on top. Overwrites `ctx.globalAlpha` and restores it. */
export function draw(ctx: CanvasRenderingContext2D, state: DomeRingsDrawState, tokens: DomeRingsTokens): void {
  const { rings, baseAlpha, baseWidthPx, fog, widthFactor } = state;
  if (rings.length === 0) return;

  const previousAlpha = ctx.globalAlpha;
  const previousCap = ctx.lineCap;
  ctx.strokeStyle = tokens.stroke;
  ctx.lineCap = "butt";
  ctx.setLineDash([]);
  const raisedKind = state.raisedKind ?? null;
  const raisedStroke = tokens.strokeRaised ?? tokens.stroke;

  for (const ring of rings) {
    if (ring.a <= 0.01) continue;
    const raised = raisedKind !== null && ring.kind === raisedKind;
    ctx.strokeStyle = raised ? raisedStroke : tokens.stroke;
    const ringAlpha = raised ? 1 : baseAlpha;
    const points = ring.points;
    const count = points.length;
    if (count < 3) continue;
    for (let i = 0; i < count; i++) {
      const from = points[i];
      const to = points[(i + 1) % count];
      // Mean of the two ends, or neighbouring segments claim different brightness at a joint (a stair-step).
      const u = (from.u + to.u) / 2;
      const alpha = ringAlpha * fog(u) * ring.a;
      if (alpha <= 0.004) continue;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(0.35, baseWidthPx * widthFactor(u));
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = previousAlpha;
  ctx.lineCap = previousCap;
}
