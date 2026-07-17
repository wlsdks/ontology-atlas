/**
 * Edge (trace) geometry + paint — ported from the B2+ prototype's
 * `buildEdges()`/`bezierPoint()`/`drawEdge()`/`drawPulses()`
 * (`docs/prototypes/topology-b2plus.html` §5, §12-13).
 *
 * "Board-router feel" (design doc's phrase): every `contains`/`depends`
 * bow is precomputed once from real polar geometry, so it never re-routes —
 * only its rendered width/color/dash thins toward hairlines as `farT → 1`.
 * `depends` edges additionally carry a one-shot "signal pulse" on hover
 * (`model/focus-state.ts#scheduleRipple` triggers it) plus an ambient
 * "comet tail" that drifts along the curve continuously
 * (`updateParticles()`'s `e.t += dt*0.075`).
 *
 * Zero React imports — pure Canvas 2D drawing plus one extractable pure
 * geometry helper (`computeBowControlPoint`, unit-tested in `traces.test.ts`
 * without a canvas).
 */

export interface Point {
  x: number;
  y: number;
}

function polarOf(p: Point): { r: number; angle: number } {
  return { r: Math.hypot(p.x, p.y), angle: Math.atan2(p.y, p.x) };
}

/**
 * Quadratic-bezier control point for one edge, ported from `buildEdges()`.
 * The control point is pulled from the segment midpoint toward whichever
 * endpoint is closer to the shared origin (world center), at that
 * endpoint's angle, capped to `maxBow` and scaled by `blend`:
 *
 * ```
 * innerR    = min(|a|, |b|)                      // polar radius from origin
 * farAngle  = angle of whichever of a/b is farther from origin
 * cpFull    = (cos(farAngle)*innerR, sin(farAngle)*innerR)
 * mid       = (a+b)/2
 * v         = cpFull - mid
 * capped    = min(|v|, maxBow)
 * controlPt = mid + normalize(v) * capped * blend
 * ```
 *
 * @param maxBow `--topology-v2-edge-bow-contains` (70) or `-depends` (92)
 * @param blend `--topology-v2-edge-blend-contains` (0.46) or `-depends` (0.62)
 */
export function computeBowControlPoint(a: Point, b: Point, maxBow: number, blend: number): Point {
  const pa = polarOf(a);
  const pb = polarOf(b);
  const innerIsA = pa.r <= pb.r;
  const innerR = innerIsA ? pa.r : pb.r;
  const farAngle = innerIsA ? pb.angle : pa.angle;
  const cpFull = { x: Math.cos(farAngle) * innerR, y: Math.sin(farAngle) * innerR };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const vx = cpFull.x - mid.x;
  const vy = cpFull.y - mid.y;
  const vlen = Math.sqrt(vx * vx + vy * vy) || 1;
  const capped = Math.min(vlen, maxBow);
  return {
    x: mid.x + (vx / vlen) * capped * blend,
    y: mid.y + (vy / vlen) * capped * blend,
  };
}

/** Point at parameter `t` (0..1) along the quadratic bezier `p0 -> p1(control) -> p2`. */
export function bezierPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export interface TraceDrawState {
  /** Screen-space endpoints/control point — the caller converts world coordinates first. */
  a: Point;
  b: Point;
  control: Point;
  relationType: "contains" | "depends";
  egoState: "ego" | "dim" | "normal";
  farT: number;
  /** 0..1 progress of the ambient comet-tail / pulse position along the curve, `depends` edges only. */
  t: number;
}

export interface TraceTokens {
  edgeContains: string;
  edgeDepends: string;
  edgeDim: string;
  indigo: string;
  indigoBright: string;
}

/**
 * Draws one edge's curve plus (for `depends` edges not in the `"dim"` ego
 * state) its comet-tail. One-shot hover pulses are a separate transient list
 * — drawn by the caller looping active pulses through this same curve math,
 * not owned by this per-edge `draw()`.
 */
const DEPENDS_DASH = [3, 4];
const COMET_TAIL_STEPS = [0, 0.028, 0.056];
const COMET_TAIL_FAR_SIZES = [1.3, 0.9, 0.6];

export function draw(ctx: CanvasRenderingContext2D, state: TraceDrawState, tokens: TraceTokens): void {
  const { a, b, control, farT, egoState, t } = state;
  const isDepends = state.relationType === "depends";

  let stroke: string;
  let width: number;
  if (egoState === "dim") {
    stroke = tokens.edgeDim;
    width = 1;
  } else if (egoState === "ego") {
    stroke = isDepends ? tokens.indigoBright : tokens.indigo;
    width = (isDepends ? 1.8 : 1.5) - farT * 0.5;
  } else {
    stroke = isDepends ? tokens.edgeDepends : tokens.edgeContains;
    width = (isDepends ? 1.3 : 1) + ((isDepends ? 0.6 : 0.45) - (isDepends ? 1.3 : 1)) * farT;
  }

  ctx.beginPath();
  ctx.setLineDash(isDepends ? DEPENDS_DASH : []);
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(0.35, width);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!isDepends || egoState === "dim") return;

  // ambient comet tail — three shrinking dots trailing the live pulse
  // position, thinning toward hairline dust as altitude rises rather than
  // fading via alpha (forbidden.md bans glow/alpha-based "signal" motifs).
  const baseSizes = egoState === "ego" ? [2.9, 2.1, 1.3] : [2.1, 1.5, 0.9];
  const tailColor = egoState === "ego" ? tokens.indigoBright : tokens.indigo;
  COMET_TAIL_STEPS.forEach((step, i) => {
    let tt = t - step;
    if (tt < 0) tt += 1;
    const point = bezierPoint(a, control, b, tt);
    const size = baseSizes[i] + (COMET_TAIL_FAR_SIZES[i] - baseSizes[i]) * farT;
    ctx.beginPath();
    ctx.fillStyle = tailColor;
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fill();
  });
}
