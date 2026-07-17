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
 *
 * STUB: the lead implements both bodies.
 */

export interface Point {
  x: number;
  y: number;
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
export function computeBowControlPoint(
  _a: Point,
  _b: Point,
  _maxBow: number,
  _blend: number,
): Point {
  throw new Error(
    "TODO(lead): implement computeBowControlPoint per the prototype's buildEdges() — traces.test.ts pins the contract.",
  );
}

/** Point at parameter `t` (0..1) along the quadratic bezier `p0 -> p1(control) -> p2`. */
export function bezierPoint(_p0: Point, _p1: Point, _p2: Point, _t: number): Point {
  throw new Error(
    "TODO(lead): implement bezierPoint per the prototype's bezierPoint() — traces.test.ts pins the contract.",
  );
}

export interface TraceDrawState {
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
export function draw(
  _ctx: CanvasRenderingContext2D,
  _state: TraceDrawState,
  _tokens: TraceTokens,
): void {
  throw new Error(
    "TODO(lead): implement draw() per the prototype's drawEdge() — see docs/TOPOLOGY-V2-DESIGN.md §3.1.",
  );
}
