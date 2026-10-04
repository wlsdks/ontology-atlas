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
import { type EdgeReveal, partialQuadratic, type Point, revealSpan } from "../expressive/edge-reveal";
import { isEdgeSignalled } from "../light/signal-plan";
import type { ParticleEdge } from "./edge-fireflies";

export type { Point };

function polarOf(p: Point): { r: number; angle: number;
} {
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
 * @param maxBow `--map-edge-bow-contains` (70) or `-depends` (92)
 * @param blend `--map-edge-blend-contains` (0.46) or `-depends` (0.62)
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

/**
 * `depends`-only bow: a perpendicular offset to the left of the travel direction.
 *
 * The polar bow (`computeBowControlPoint`) assumes the concentric-ring meaning
 * "bend toward the parent ring" — still true for containment, but meaningless
 * for peer `depends` edges after drag/force, where adjacent edges bowed in
 * opposite directions for no reason (Guardian measurement: some long edges
 * bowed, others stayed straight). A consistent left-perpendicular bow is a
 * function of direction, so a mutual A→B / B→A pair separates into two arcs on
 * its own — previously they overlapped exactly into one strand.
 */
export function computeDependsBowControlPoint(a: Point, b: Point, maxBow: number): Point {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(len * 0.12, maxBow);
  // Left normal of the travel direction: (-dy, dx)/len
  return { x: mx + (-dy / len) * bow, y: my + (dx / len) * bow };
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
  /**
   * Whether this relation **has a direction**
   * (`entities/knowledge-graph/lib/ontology-tree/relations#isDirectionalRelation`).
   * `relationType === "depends"` is a two-way split that holds **everything**
   * that is not containment, so symmetric relations (`related_to`) sit inside
   * it too. The directional taper (thick at source → thin at target) is drawn
   * only when a direction really exists; symmetric relations get **uniform
   * width**, encoding the fact that both ends are equals.
   *
   * Defaults to `true`, so an unknown type is never silently demoted to
   * symmetric.
   */
  directional?: boolean;
  egoState: "ego" | "dim" | "normal";
  farT: number;
  /** 0..1 progress of the ambient comet-tail / pulse position along the curve, `depends` edges only. */
  t: number;
  /**
   * True for the single ego edge the user is hovering in the detail panel's
   * "connected nodes" list — an extra "emphasis ripple" over the ego brightening so
   * the panel row and this edge read as one (lead spec §4). Ignored unless
   * `egoState === "ego"`.
   */
  emphasized?: boolean;
  /**
   * **Hover lift** 0..1 — how far a `normal` edge that touches the hovered node
   * has risen toward the ego ink (2026-09-02). The map's hover used to move only
   * the node (ring, shimmer, neighbour ripple) and left every line untouched;
   * the note-graph views the owner keeps naming as the tactile reference light a
   * note's connections the moment the cursor lands. The value is the hovered
   * node's own emphasis ramp, so lines rise and fall on the same clock as the
   * ring and never cut. Ignored unless `egoState === "normal"`.
   */
  hoverLift?: number;
    /**
     * Edge selection (pair focus) — drawn with the dedicated pale-indigo stroke.
     * Same family as node selection (standard indigo) but a different value, so
     * the two read apart at a glance without adding a second colour system.
     */
    selected?: boolean;
  /**
   * Containment ink level (0 trunk · 1 middle · 2 twig). Consumed only by the
   * non-ego `contains` render: stroke picks the per-level token, width the
   * per-level factor. The depends/ego/dim paths are untouched — the type and
   * attention channels stay orthogonal to this ramp.
   */
  level?: 0 | 1 | 2;
  /** 3D view — line-width multiplier (depth falloff). Defaults to 1, i.e. 2D. */
  widthScale?: number;
  /**
   * 3D view — **the smallest stroke this line may be drawn at, in CSS px**, after
   * the depth multiplier. The caller derives it from the ratio the canvas is
   * rasterising at (`model/dome-view.ts#domeEdgeMinWidthPx`), so what is really
   * held is a width in *device* pixels: below one device pixel the rasteriser
   * spreads the stroke's alpha over the two pixel rows it straddles and the peak
   * contrast collapses, which is how the depth-ink floor's whole gain disappeared
   * at DPR 1 while measuring intact at DPR 2.
   *
   * It floors the **base** width, before the directional taper and after the
   * per-level factor, so source→target still reads from width and the near lines,
   * already above it, are untouched. Far lines that were below it tie at the
   * floor — the cartographic hairline minimum, and the reason depth keeps being
   * carried by alpha, halo, node fog, size and draw order rather than by a stroke
   * too thin to raster.
   *
   * Omitted/0 means 2D or an interaction-exempt line: no floor, byte-identical
   * output.
   */
  minWidthPx?: number;
  /**
   * 3D view — **depth halo**. Just before the ink, the same curve is stroked
   * once in the canvas background colour slightly wider, cutting that much out
   * of whatever was already drawn behind it. Rationale, values, and why this is
   * not a glow: `domeHaloPx` in `model/dome-view.ts`
   * (Everts et al. 2009, IEEE TVCG 15(6)).
   *
   * `px` is the **half-width in screen px**; `alpha` is the final opacity at
   * that spot — the caller computes both from the depth and the line's own
   * alpha. Omitted/`null` means 2D: zero extra strokes.
   */
  halo?: { color: string; px: number; alpha: number;
    } | null;
  /**
   * `prefers-reduced-motion: reduce`. The comet tail is the one moving mark
   * this module paints, so honouring the preference here is what keeps the
   * canvas fully static for those users (audit A8: the tail was the largest
   * of five uncovered motion sources).
   */
  reducedMotion?: boolean;
  /**
   * Design Guardian-approved condition for comet flow on `contains` edges
   * incident to the selection (ego). True only for `egoState === "ego"` contains
   * edges that pass the cap (`render/edge-fireflies.ts#selectEgoContainsComets`,
   * top 24 by seed order); edges outside the cap keep the ego brightening of the
   * main stroke and draw no particles. `depends` edges ignore this field.
   */
  containsCometEligible?: boolean;
  /**
   * Whether the always-on ambient `depends` comet passed the cap. Same grammar
   * as its sibling `containsCometEligible`: false draws the dashed body only.
   * Defaults to `true` — the pre-cap behaviour — so a caller that passes no cap
   * does not regress.
   */
  dependsCometEligible?: boolean;
  cometOwner?: ParticleEdge;
  /**
   * "walked-path lens" strength, 0..1 — non-zero only when this
   * relation was stepped along **consecutively**.
   *
   * Owner, 2026-08-02: *"Does the yellow reach the lines too?"* (does the yellow reach the lines
   * too?). With the lens on, this file drew every edge `dim`: footprints landed
   * beside the visited nodes but **the lines joining them carried background
   * ink**, so the "path walked" showed no path.
   *
   * This opens no new hue — the colour is the footprint ink itself, passed in as
   * `edgeTrail` (`--color-footprint-trail`, whichever of the two choices,
   * yellow or indigo, the user picked). Mark and line must share one colour to
   * read as two notations of the same fact.
   */
  trailWalked?: number;
  /**
   * Which way the walk crossed this relation — `true` from `a` toward `b`.
   *
   * ⚠️ **The mark on the nodes lost its heading on 2026-09-10 and this is where it went.**
   * The old shoe prints came in pairs whose toes pointed the way of travel; a star has no
   * toes, so the direction runs along the line instead, as a light travelling it. Absent
   * means no glint and no behaviour change.
   */
  trailDirection?: boolean;
  /**
   * Phase of the travelling light, 0-1, supplied by the caller's clock so every walked
   * relation glints in step rather than each keeping its own drift.
   */
  /**
   * Where the travelling light is **on this relation**, 0–1 — or `null` when the one light on
   * the walk is somewhere else in its lap. See `model/footprint-steps.ts#buildTrailGlintLegs`.
   */
  trailGlint?: number | null;
  reveal?: EdgeReveal | null;
  dimRamp?: number;
}

export interface TraceTokens {
  edgeContains: string;
  /** P3a hierarchy ladder — optional so legacy callers (hover pulses) keep working. */
  edgeContainsL0?: string;
  edgeContainsL2?: string;
  edgeDepends: string;
  edgeDim: string;
  indigo: string;
  indigoBright: string;
  /** Edge-selection stroke (`--map-edge-selected`); falls back to indigoBright. */
  edgeSelected?: string;
  /**
   * Stroke for a stepped-along relation — the **same** ink as the footprints
   * (`--color-footprint-trail`). Used only where `trailWalked > 0`; absent means
   * no trail emphasis and no behaviour change.
   */
  edgeTrail?: string;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Linear interpolation between two hex colours — used only where the trail ramps
 * up from `dim` to the trail ink (hard cuts are banned). Same formula as
 * `lerpColorHex` in `render/grid.ts`, duplicated rather than imported because
 * this file is a pure renderer that knows nothing of the token layer.
 */
function mixHex(from: string, to: string, t: number): string {
  const parse = (hex: string): [number, number, number] | null => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = Number.parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return t >= 0.5 ? to : from;
  const k = clamp01(t);
  const ch = (i: 0 | 1 | 2) => Math.round(a[i] + (b[i] - a[i]) * k);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}
function normalInk(state: TraceDrawState, tokens: TraceTokens, isDepends: boolean, hoverLift: number): {
    stroke: string;
    width: number;
} {
    const { farT } = state;
    let stroke: string;
    let width: number;
    if (isDepends) {
        stroke = tokens.edgeDepends;
        width = 1.3 + (-0.7000000000000001) * farT;
    }
    else {
        const level = state.level ?? 1;
        stroke = (level === 0
            ? tokens.edgeContainsL0 ?? tokens.edgeContains
            : level === 2
                ? tokens.edgeContainsL2 ?? tokens.edgeContains
                : tokens.edgeContains);
        width = (1 + (-0.55) * farT) * CONTAINS_LEVEL_WIDTH_FACTOR[level];
    }
    if (hoverLift > 0.01) {
        stroke = mixHex(stroke, isDepends ? tokens.indigoBright : tokens.indigo, hoverLift);
        width += HOVER_LIFT_WIDTH_PX * hoverLift;
    }
    return { stroke, width };
}
function finishWidth(state: TraceDrawState, raw: number): number {
    let width = raw;
    width *= state.widthScale ?? 1;
    const minWidthPx = state.minWidthPx ?? 0;
    return minWidthPx > width ? minWidthPx : width;
}
function quadAt(a: Point, c: Point, b: Point, t: number, axis: "x" | "y"): number {
    const u = 1 - t;
    return u * u * a[axis] + 2 * u * t * c[axis] + t * t * b[axis];
}
function curveLength(a: Point, c: Point, b: Point, upTo: number): number {
    let length = 0;
    let px = a.x;
    let py = a.y;
    for (let i = 1; i <= DEPENDS_TAPER_SEGMENTS; i += 1) {
        const t = (upTo * i) / DEPENDS_TAPER_SEGMENTS;
        const x = quadAt(a, c, b, t, "x");
        const y = quadAt(a, c, b, t, "y");
        length += Math.hypot(x - px, y - py);
        px = x;
        py = y;
    }
    return length;
}
function strokeBody(ctx: CanvasRenderingContext2D, state: TraceDrawState, stroke: string, width: number, lo: number, hi: number): void {
    if (hi - lo <= 0.0005)
        return;
    const { a, b, control } = state;
    const isDepends = state.relationType === "depends";
    const part = lo <= 0 && hi >= 1
        ? null
        : lo <= 0
            ? partialQuadratic(a, control, b, hi, "a")
            : partialQuadratic(a, control, b, 1 - lo, "b");
    const pa = part ? part.a : a;
    const pc = part ? part.control : control;
    const pb = part ? part.b : b;
    ctx.strokeStyle = stroke;
    const tapered = isDepends && state.directional !== false;
    if (isDepends && !tapered) {
        ctx.beginPath();
        ctx.setLineDash(DEPENDS_DASH);
        if (lo > 0)
            ctx.lineDashOffset = -curveLength(a, control, b, lo);
        ctx.moveTo(pa.x, pa.y);
        ctx.quadraticCurveTo(pc.x, pc.y, pb.x, pb.y);
        ctx.lineWidth = Math.max(0.35, width);
        ctx.stroke();
        ctx.lineDashOffset = 0;
        ctx.setLineDash([]);
    }
    else if (tapered) {
        // Width thins source to target; the dash offset carries the length walked so far, so a
        // partial span meets the rest of the line without a seam.
        ctx.setLineDash(DEPENDS_DASH);
        const prevCap = ctx.lineCap;
        const prevJoin = ctx.lineJoin;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        let prevX = a.x;
        let prevY = a.y;
        let prevT = 0;
        let acc = 0;
        for (let i = 1; i <= DEPENDS_TAPER_SEGMENTS; i += 1) {
            const t = i / DEPENDS_TAPER_SEGMENTS;
            const uu = 1 - t;
            const pointX = uu * uu * a.x + 2 * uu * t * control.x + t * t * b.x;
            const pointY = uu * uu * a.y + 2 * uu * t * control.y + t * t * b.y;
            const from = prevT < lo ? lo : prevT;
            const to = t > hi ? hi : t;
            if (to > from) {
                const sx = from > prevT ? quadAt(a, control, b, from, "x") : prevX;
                const sy = from > prevT ? quadAt(a, control, b, from, "y") : prevY;
                const ex = to < t ? quadAt(a, control, b, to, "x") : pointX;
                const ey = to < t ? quadAt(a, control, b, to, "y") : pointY;
                const u = (i - 0.5) / DEPENDS_TAPER_SEGMENTS;
                ctx.beginPath();
                ctx.lineWidth = Math.max(0.35, width * dependsTaperFactor(u));
                ctx.lineDashOffset = -(acc + Math.hypot(sx - prevX, sy - prevY));
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }
            acc += Math.hypot(pointX - prevX, pointY - prevY);
            prevX = pointX;
            prevY = pointY;
            prevT = t;
        }
        ctx.lineCap = prevCap;
        ctx.lineJoin = prevJoin;
        ctx.lineDashOffset = 0;
        ctx.setLineDash([]);
    }
    else {
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.quadraticCurveTo(pc.x, pc.y, pb.x, pb.y);
        ctx.lineWidth = Math.max(0.35, width);
        ctx.stroke();
    }
}
/**
 * Draws one edge's curve plus (for `depends` edges not in the `"dim"` ego
 * state) its comet-tail. One-shot hover pulses are a separate transient list
 * — drawn by the caller looping active pulses through this same curve math,
 * not owned by this per-edge `draw()`.
 */
const DEPENDS_DASH = [3, 4];
/**
 * Directional taper for `depends` (non-containment) edges: width thins from
 * source (`a`) to target (`b`), so direction reads from width alone with no
 * arrowhead (keeping the "board-router" vocabulary). The factors are **ratios**
 * applied to the already-computed width, so they sit orthogonally on top of
 * every state (ego/selected/farT). The midpoint is ≈ base, so total ink is
 * roughly preserved (source 1.4×, target 0.6×). Containment (solid) gets no
 * taper — its direction is already obvious from the structure (parent→child).
 * Plain constants, not tokens: these are render factors, like the per-kind
 * ratios in node-shapes.
 */
export const DEPENDS_TAPER_START = 1.4;
export const DEPENDS_TAPER_END = 0.6;
/** Taper factor at curve parameter u (0 = source, 1 = target); monotonically decreasing. */
export function dependsTaperFactor(u: number): number {
    const t = u < 0 ? 0 : u > 1 ? 1 : u;
    return DEPENDS_TAPER_START + (DEPENDS_TAPER_END - DEPENDS_TAPER_START) * t;
}
/** Segment count for the tapered polyline — enough to approximate the bowed curve smoothly. */
const DEPENDS_TAPER_SEGMENTS = 14;
/**
 * Per-level width factors. Like a cartographic road hierarchy, one ink family
 * varies only by width × lightness.
 */
const CONTAINS_LEVEL_WIDTH_FACTOR: Record<0 | 1 | 2, number> = { 0: 1.4, 1: 1, 2: 0.8 };
const COMET_TAIL_STEPS = [0, 0.028, 0.056];
const COMET_TAIL_FAR_SIZES = [1.3, 0.9, 0.6];
/**
 * Comet-tail base radii, from the prototype (topology-b2plus §13 `drawEdge`).
 * **Non-ego (normal) `depends` edges flow too, regardless of focus** — an owner
 * instruction reversed the earlier demotion to "comet tail = focus signal".
 * ego/selected edges get a larger tail plus bright ink; the panel-linked
 * emphasis is largest. As farT rises these interpolate toward
 * `COMET_TAIL_FAR_SIZES`, thinning to hairline dust rather than fading via alpha
 * (glow is banned).
 */
const COMET_TAIL_BASE_NORMAL = [2.1, 1.5, 0.9];
/** Extra width a hovered node's lines gain at full lift — half the ego step, since nothing is selected yet. */
export const HOVER_LIFT_WIDTH_PX = 0.45;
const COMET_TAIL_BASE_EGO = [2.9, 2.1, 1.3];
const COMET_TAIL_BASE_EMPHASIZED = [3.6, 2.7, 1.7];
export interface CometMark {
    owner: ParticleEdge;
    a: Point;
    control: Point;
    b: Point;
    base: readonly number[];
    farT: number;
    color: string;
    alpha: number;
    shadowBlur: number;
    shadowColor: string;
    span: {
        lo: number;
        hi: number;
    } | null;
}
let cometMarks: CometMark[] | null = null;
export function recordComets(into: CometMark[] | null): void {
    cometMarks = into;
}
export function cometDots(a: Point, control: Point, b: Point, t: number, base: readonly number[], farT: number, span: {
    lo: number;
    hi: number;
} | null, out: Float64Array): number {
    let n = 0;
    for (let i = 0; i < COMET_TAIL_STEPS.length; i += 1) {
        let tt = t - COMET_TAIL_STEPS[i];
        if (tt < 0)
            tt += 1;
        if (span && (tt < span.lo || tt > span.hi))
            continue;
        const uu = 1 - tt;
        out[n] = uu * uu * a.x + 2 * uu * tt * control.x + tt * tt * b.x;
        out[n + 1] = uu * uu * a.y + 2 * uu * tt * control.y + tt * tt * b.y;
        out[n + 2] = base[i] + (COMET_TAIL_FAR_SIZES[i] - base[i]) * farT;
        n += 3;
    }
    return n;
}
export const COMET_DOT_VALUES = COMET_TAIL_STEPS.length * 3;
const dotsScratch = new Float64Array(COMET_DOT_VALUES);
export function fillCometDots(ctx: CanvasRenderingContext2D, dots: Float64Array, n: number): void {
    for (let k = 0; k < n; k += 3) {
        ctx.beginPath();
        ctx.arc(dots[k], dots[k + 1], dots[k + 2], 0, Math.PI * 2);
        ctx.fill();
    }
}
function comet(ctx: CanvasRenderingContext2D, state: TraceDrawState, base: readonly number[], color: string, span: {
    lo: number;
    hi: number;
} | null): void {
    const { a, b, control, farT, cometOwner } = state;
    if (cometMarks && cometOwner) {
        cometMarks.push({
            owner: cometOwner,
            a: { x: a.x, y: a.y },
            control: { x: control.x, y: control.y },
            b: { x: b.x, y: b.y },
            base,
            farT,
            color,
            alpha: ctx.globalAlpha,
            shadowBlur: ctx.shadowBlur,
            shadowColor: ctx.shadowColor,
            span: span ? { lo: span.lo, hi: span.hi } : null,
        });
        return;
    }
    ctx.fillStyle = color;
    fillCometDots(ctx, dotsScratch, cometDots(a, control, b, state.t, base, farT, span, dotsScratch));
}
export function draw(ctx: CanvasRenderingContext2D, state: TraceDrawState, tokens: TraceTokens): void {
    const { a, b, control, farT, egoState } = state;
    const isDepends = state.relationType === "depends";
    const emphasized = egoState === "ego" && state.emphasized === true;
    let stroke: string;
    let width: number;
    /** Strength of the travelling light; 0 everywhere except a walked relation. */
    let glint = 0;
    const trailWalked = clamp01(state.trailWalked ?? 0);
    if (trailWalked > 0.01 && tokens.edgeTrail) {
        stroke = mixHex(tokens.edgeDim, tokens.edgeTrail, trailWalked);
        width = 1 + 0.6 * trailWalked;
        glint = trailWalked;
    }
    else if (state.selected === true) {
        stroke = tokens.edgeSelected ?? tokens.indigoBright;
        width = (isDepends ? 1.7 : 1.5) - farT * 0.4;
    }
    else if (egoState === "dim") {
        stroke = tokens.edgeDim;
        width = 1;
        const dimRamp = clamp01(state.dimRamp ?? 1);
        if (dimRamp < 1) {
            const from = normalInk(state, tokens, isDepends, 0);
            stroke = mixHex(from.stroke, stroke, dimRamp);
            width = from.width + (width - from.width) * dimRamp;
        }
    }
    else if (egoState === "ego") {
        stroke = emphasized || isDepends ? tokens.indigoBright : tokens.indigo;
        width = (isDepends ? 1.8 : 1.5) - farT * 0.5 + (emphasized ? 0.9 : 0);
    }
    else {
        ({ stroke, width } = normalInk(state, tokens, isDepends, clamp01(state.hoverLift ?? 0)));
    }
    const reveal = egoState === "ego" && trailWalked <= 0.01 && state.selected !== true && state.reveal && state.reveal.progress < 1
        ? state.reveal
        : null;
    const span = reveal ? revealSpan(reveal) : null;
    width = finishWidth(state, width);
    /*
     * Depth halo — goes down **before** the ink. This one stroke is what creates
     * front-to-back in 3D: edges are painted far-to-near this frame (painter order
     * in the caller), so stroking the background colour slightly wider here erases
     * that much of the far lines already drawn.
     *
     * The halo is never dashed — a dashed halo leaves gaps where it cuts, so it
     * reads as a dotted shadow rather than as occlusion.
     */
    // perf 2026-08-19 — the `setLineDash([])` before the halo was removed. This
    // file and every neighbouring painter always restore `[]` after using a dash
    // (the body path below, node-shapes, cluster-chips, dome-rings, the frame-draw
    // ring block), so the dash state on entry is always empty. Only the redundant
    // re-set was deleted, verified by the pixel gate (screenshot comparison).
    const halo = state.halo;
    if (halo && halo.px > 0.05 && halo.alpha > 0.01) {
        const prevAlpha = ctx.globalAlpha;
        const prevCap = ctx.lineCap;
        const prevJoin = ctx.lineJoin;
        ctx.globalAlpha = halo.alpha;
        ctx.strokeStyle = halo.color;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(0.35, width) + halo.px * 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = prevAlpha;
        ctx.lineCap = prevCap;
        ctx.lineJoin = prevJoin;
    }
    if (reveal && span) {
        const base = normalInk(state, tokens, isDepends, clamp01(reveal.baseLift));
        const baseDim = clamp01(reveal.baseDim ?? 0);
        if (baseDim > 0) {
            base.stroke = mixHex(base.stroke, tokens.edgeDim, baseDim);
            base.width += (1 - base.width) * baseDim;
        }
        const baseWidth = finishWidth(state, base.width);
        if (reveal.from === "a") {
            strokeBody(ctx, state, stroke, width, 0, span.hi);
            strokeBody(ctx, state, base.stroke, baseWidth, span.hi, 1);
        }
        else {
            strokeBody(ctx, state, base.stroke, baseWidth, 0, span.lo);
            strokeBody(ctx, state, stroke, width, span.lo, 1);
        }
    }
    else {
        strokeBody(ctx, state, stroke, width, 0, 1);
    }
    /*
     * The travelling light — the walk's direction, said by the line.
     *
     * ⚠️ It runs **only on a walked relation, only while the trail lens is open**, which is
     * the whole of its licence. This canvas had its ambient drift removed on 2026-09-08 after
     * the owner found it hard to look at, and nothing here reopens that: the light exists in a
     * lens a person deliberately opened, it moves along a path they themselves walked, and it
     * is answering a question they asked. That is the whole licence, and it is narrower than the
     * one this file used to cite: the 2026-09-08 drift removal governs the *Library's* canvas,
     * and quoting it here claimed an authority this loop does not have (design-motion,
     * 2026-09-10).
     *
     * ⚠️ The second half of that sentence was **also wrong on both of its facts**. It said the
     * stars hold still, and that they hold still because brightness means recency. They twinkle,
     * and brightness means *walked* — order moved to the ordinal on 2026-09-10 precisely because
     * additive light cannot rank. A twinkle argues with nothing now, which is the only reason it
     * is allowed to exist. See `TRAIL_STAR_TWINKLE` in `ui/topology-frame-draw.ts`.
     *
     * ⚠️ **One light on the walk, not one per line.** `state.trailGlint` is `null` on every
     * relation the light is not currently crossing, so a walk's lines take their turn in the
     * order they were walked, all at one speed.
     */
    if (glint > 0.01 && tokens.edgeTrail && state.reducedMotion !== true && state.trailGlint != null) {
        const phase = clamp01(state.trailGlint);
        // Direction is which end the walk left from; absent, the light runs a→b.
        const u = state.trailDirection === false ? 1 - phase : phase;
        const at = bezierPoint(a, control, b, u);
        const prevAlpha = ctx.globalAlpha;
        // Brightest mid-flight and gone at both ends, so it reads as a light travelling the
        // line rather than a dot that pops into existence at one node and dies at the other.
        const travel = Math.sin(Math.PI * u);
        ctx.globalAlpha = prevAlpha * glint * travel * 0.9;
        ctx.fillStyle = tokens.edgeTrail;
        ctx.beginPath();
        ctx.arc(at.x, at.y, Math.max(0.9, width * 0.9), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = prevAlpha;
    }
    /*
     * **The chevron — the walk's direction, standing still.**
     *
     * ⚠️ Before this mark, the *only* thing on a walked relation that said which way the walk
     * went was the travelling light, and both council seats measured the same consequence
     * independently: a reduced-motion reader was handed **no per-relation direction at all**
     * (peak-over-median in the edge band falls 192 → 4 with the light gated off), and even with
     * motion on, the light is dark 13% of every lap and wants about a second of watching before
     * its direction is legible. A still frame of this surface could not be read either.
     *
     * The endpoint ordinals are not a fallback: on a walk that revisits a node they read
     * "2·5" and "4·7", so a line between those two stops could be 2→4, 4→5 or 5→7.
     *
     * It is a permitted arrow, not a decorative one — `forbidden.md` bans the trailing `Open →`
     * flourish and explicitly keeps arrows that convey path, order or causality, which is the
     * entire content of this one. Placed at 0.62 rather than the midpoint so it never sits under
     * the relation caption, and drawn at the line's own alpha so it arrives with the line during
     * the ignition sweep instead of being a second event.
     */
    if (glint > 0.01 && tokens.edgeTrail) {
        const forward = state.trailDirection !== false;
        const head = bezierPoint(a, control, b, forward ? TRAIL_CHEVRON_AT : 1 - TRAIL_CHEVRON_AT);
        const tailAt = forward ? TRAIL_CHEVRON_AT - TRAIL_CHEVRON_SPAN : 1 - TRAIL_CHEVRON_AT + TRAIL_CHEVRON_SPAN;
        const tail = bezierPoint(a, control, b, tailAt);
        const dx = head.x - tail.x;
        const dy = head.y - tail.y;
        const len = Math.hypot(dx, dy);
        if (len > 0.5) {
            const ux = dx / len;
            const uy = dy / len;
            const arm = Math.max(3, width * TRAIL_CHEVRON_ARM);
            const prevAlpha = ctx.globalAlpha;
            const prevCap = ctx.lineCap;
            const prevJoin = ctx.lineJoin;
            ctx.globalAlpha = prevAlpha * glint;
            ctx.strokeStyle = tokens.edgeTrail;
            ctx.lineWidth = Math.max(1, width * 0.9);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            // Two arms swept back from the head — an open chevron, never a filled triangle, so it
            // stays the same weight of mark as the line it rides on.
            ctx.moveTo(head.x - (ux * 0.72 + uy * 0.62) * arm, head.y - (uy * 0.72 - ux * 0.62) * arm);
            ctx.lineTo(head.x, head.y);
            ctx.lineTo(head.x - (ux * 0.72 - uy * 0.62) * arm, head.y - (uy * 0.72 + ux * 0.62) * arm);
            ctx.stroke();
            ctx.globalAlpha = prevAlpha;
            ctx.lineCap = prevCap;
            ctx.lineJoin = prevJoin;
        }
    }
    if (isDepends) {
        if (egoState === "dim")
            return;
        if (glint > 0.01 || undefined)
            return;
        if (state.reducedMotion === true)
            return;
        if (state.dependsCometEligible === false)
            return;
        if (isEdgeSignalled(a, control, b))
            return;
        const ego = egoState === "ego" || state.selected === true;
        const baseSizes = emphasized ? COMET_TAIL_BASE_EMPHASIZED : ego ? COMET_TAIL_BASE_EGO : COMET_TAIL_BASE_NORMAL;
        comet(ctx, state, baseSizes, ego ? tokens.indigoBright : tokens.indigo, span);
        return;
    }
    if (egoState !== "ego" || state.containsCometEligible !== true)
        return;
    if (state.reducedMotion === true)
        return;
    if (isEdgeSignalled(a, control, b))
        return;
    comet(ctx, state, COMET_TAIL_BASE_NORMAL, tokens.indigo, span);
}
/**
 * Where along a walked relation the direction chevron sits.
 *
 * Past the midpoint, so it clears the relation caption; short of the target, so it is not
 * mistaken for something belonging to the node it points at.
 */
const TRAIL_CHEVRON_AT = 0.62;
/** How far back along the curve the chevron takes its heading from. */
const TRAIL_CHEVRON_SPAN = 0.08;
/** Arm length as a multiple of the line's own width, floored at 3px so it survives a hairline. */
const TRAIL_CHEVRON_ARM = 3.4;
