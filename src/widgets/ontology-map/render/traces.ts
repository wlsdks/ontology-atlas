/**
 * Edge geometry and paint, pure canvas 2D. Every bow is precomputed once from polar geometry, so edges never
 * re-route; only width, colour and dash thin toward hairlines as `farT → 1`. `depends` edges carry an ambient
 * comet tail and a hover pulse. `computeBowControlPoint` is unit-tested in `traces.test.ts` without a canvas.
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
 * Quadratic control point for one edge: pulled from the segment midpoint toward the polar point
 * `(cos(farAngle) * innerR, sin(farAngle) * innerR)` (`innerR` is the nearer endpoint's radius from the origin),
 * capped to `maxBow` and scaled by `blend` (`--map-edge-bow-*`, `--map-edge-blend-*`).
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
 * `depends`-only bow, perpendicular to the left of the travel direction: the polar bow means nothing for peer
 * edges after drag or force, and a direction-based bow separates a mutual A→B / B→A pair into two arcs.
 */
export function computeDependsBowControlPoint(a: Point, b: Point, maxBow: number): Point {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const vectorLength = Math.hypot(dx, dy) || 1;
  const bow = Math.min(vectorLength * 0.12, maxBow);
  return { x: mx + (-dy / vectorLength) * bow, y: my + (dx / vectorLength) * bow };
}

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
   * Whether this relation has a direction (`isDirectionalRelation`): `depends` holds everything but containment,
   * symmetric relations (`related_to`) included. Only directional ones get the taper; symmetric ones draw uniform
   * width. Defaults to `true`.
   */
  directional?: boolean;
  egoState: "ego" | "dim" | "normal";
  farT: number;
  /** 0..1 progress of the ambient comet-tail / pulse position along the curve, `depends` edges only. */
  t: number;
  /** The single ego edge hovered in the detail panel's "connected nodes" list: an emphasis ripple so the row and the edge read as one. Ignored unless `egoState === "ego"`. */
  emphasized?: boolean;
  /**
   * Hover lift 0..1: how far a `normal` edge touching the hovered node has risen toward the ego ink,
   * on the node's own emphasis ramp. Ignored unless `egoState === "normal"`.
   */
  hoverLift?: number;
    /** Edge selection (pair focus): the pale-indigo stroke, the same family as node selection but a different value. */
    selected?: boolean;
  /** Containment ink level (0 trunk, 1 middle, 2 twig): picks the stroke token and width factor of the non-ego `contains` render only. */
  level?: 0 | 1 | 2;
  /** 3D view — line-width multiplier (depth falloff). Defaults to 1, i.e. 2D. */
  widthScale?: number;
  /**
   * 3D view: the smallest stroke this line may draw at, in CSS px after the depth multiplier. It is derived from the
   * raster ratio (`domeEdgeMinWidthPx`) so it holds a device-pixel width: below one device pixel the alpha spreads
   * over two rows and contrast collapses. It floors the base width before the directional taper; omitted/0 means 2D.
   */
  minWidthPx?: number;
  /**
   * 3D view depth halo: just before the ink the curve is stroked once wider in the canvas background colour, cutting
   * that much out of what is already behind it (rationale in `domeHaloPx`, `model/dome-view/`). `px` is the
   * half-width in screen px, `alpha` the final opacity; omitted or null means 2D, zero extra strokes.
   */
  halo?: { color: string; px: number; alpha: number;
    } | null;
  /** The comet tail is the only moving mark here; honouring `prefers-reduced-motion` keeps the canvas fully static. */
  reducedMotion?: boolean;
  /**
   * True only for `egoState === "ego"` contains edges passing the cap (`selectEgoContainsComets`,
   * top 24 by seed order). Edges outside the cap keep the ego brightening of the main stroke and
   * draw no particles. `depends` edges ignore this.
   */
  containsCometEligible?: boolean;
  /** Whether the ambient `depends` comet passed the cap, like `containsCometEligible`: false draws the dashed body only. Defaults to `true`. */
  dependsCometEligible?: boolean;
  cometOwner?: ParticleEdge;
  /**
   * Walked-path lens strength, 0..1; non-zero only when this relation was stepped along
   * consecutively. The colour is the footprint ink itself (`edgeTrail`): mark and line must share
   * one colour.
   */
  trailWalked?: number;
  /**
   * Which way the walk crossed this relation: `true` from `a` toward `b`. Drawn as a light
   * travelling the line. Absent means no glint.
   */
  trailDirection?: boolean;
  /**
   * Phase of the travelling light, 0-1, supplied by the caller's clock so every walked
   * relation glints in step rather than each keeping its own drift.
   */
  /**
   * Where the travelling light is **on this relation**, 0–1 — or `null` when the one light on
   * the walk is somewhere else in its lap. See `model/visibility/footprint-steps.ts#buildTrailGlintLegs`.
   */
  trailGlint?: number | null;
  reveal?: EdgeReveal | null;
  dimRamp?: number;
}

export interface TraceTokens {
  edgeContains: string;
  edgeContainsL0?: string;
  edgeContainsL2?: string;
  edgeDepends: string;
  edgeDim: string;
  indigo: string;
  indigoBright: string;
  /** Edge-selection stroke (`--map-edge-selected`); falls back to indigoBright. */
  edgeSelected?: string;
  /** Stroke for a stepped-along relation, the same ink as the footprints (`--color-footprint-trail`); used only where `trailWalked > 0`. */
  edgeTrail?: string;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Linear interpolation between two hex colours for the trail ramp from `dim`; duplicated from `lerpColorHex` because this renderer knows nothing of the token layer. */
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
        const previousCap = ctx.lineCap;
        const previousJoin = ctx.lineJoin;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        let previousX = a.x;
        let previousY = a.y;
        let previousT = 0;
        let acc = 0;
        for (let i = 1; i <= DEPENDS_TAPER_SEGMENTS; i += 1) {
            const t = i / DEPENDS_TAPER_SEGMENTS;
            const uu = 1 - t;
            const pointX = uu * uu * a.x + 2 * uu * t * control.x + t * t * b.x;
            const pointY = uu * uu * a.y + 2 * uu * t * control.y + t * t * b.y;
            const from = previousT < lo ? lo : previousT;
            const to = t > hi ? hi : t;
            if (to > from) {
                const sx = from > previousT ? quadAt(a, control, b, from, "x") : previousX;
                const sy = from > previousT ? quadAt(a, control, b, from, "y") : previousY;
                const ex = to < t ? quadAt(a, control, b, to, "x") : pointX;
                const ey = to < t ? quadAt(a, control, b, to, "y") : pointY;
                const u = (i - 0.5) / DEPENDS_TAPER_SEGMENTS;
                ctx.beginPath();
                ctx.lineWidth = Math.max(0.35, width * dependsTaperFactor(u));
                ctx.lineDashOffset = -(acc + Math.hypot(sx - previousX, sy - previousY));
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }
            acc += Math.hypot(pointX - previousX, pointY - previousY);
            previousX = pointX;
            previousY = pointY;
            previousT = t;
        }
        ctx.lineCap = previousCap;
        ctx.lineJoin = previousJoin;
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
const DEPENDS_DASH = [3, 4];
/**
 * Directional taper for `depends` edges: width thins from source (1.4×) to target (0.6×), so direction reads from
 * width with no arrowhead. The factors are ratios on the computed width, so orthogonal to every state; containment gets none.
 */
export const DEPENDS_TAPER_START = 1.4;
export const DEPENDS_TAPER_END = 0.6;
export function dependsTaperFactor(u: number): number {
    const t = u < 0 ? 0 : u > 1 ? 1 : u;
    return DEPENDS_TAPER_START + (DEPENDS_TAPER_END - DEPENDS_TAPER_START) * t;
}
const DEPENDS_TAPER_SEGMENTS = 14;
/**
 * Per-level width factors. Like a cartographic road hierarchy, one ink family
 * varies only by width × lightness.
 */
const CONTAINS_LEVEL_WIDTH_FACTOR: Record<0 | 1 | 2, number> = { 0: 1.4, 1: 1, 2: 0.8 };
const COMET_TAIL_STEPS = [0, 0.028, 0.056];
const COMET_TAIL_FAR_SIZES = [1.3, 0.9, 0.6];
/**
 * Comet-tail base radii. As farT rises they interpolate toward `COMET_TAIL_FAR_SIZES`, thinning to
 * hairline dust rather than fading via alpha.
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
     * The depth halo goes down before the ink: edges paint far-to-near, so a wider background-colour stroke erases
     * that much of the far lines already drawn. Never dashed: a dashed halo leaves gaps and reads as a dotted shadow.
     */
    const halo = state.halo;
    if (halo && halo.px > 0.05 && halo.alpha > 0.01) {
        const previousAlpha = ctx.globalAlpha;
        const previousCap = ctx.lineCap;
        const previousJoin = ctx.lineJoin;
        ctx.globalAlpha = halo.alpha;
        ctx.strokeStyle = halo.color;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(0.35, width) + halo.px * 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = previousAlpha;
        ctx.lineCap = previousCap;
        ctx.lineJoin = previousJoin;
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
    /* The travelling light runs only on a walked relation while the trail lens is open; `trailGlint` is null where the light is not crossing, so one light moves along the walk in order. */
    if (glint > 0.01 && tokens.edgeTrail && state.reducedMotion !== true && state.trailGlint != null) {
        const phase = clamp01(state.trailGlint);
        const u = state.trailDirection === false ? 1 - phase : phase;
        const at = bezierPoint(a, control, b, u);
        const previousAlpha = ctx.globalAlpha;
        // Brightest mid-flight and gone at both ends, so it reads as light travelling, not a dot popping at one node.
        const travel = Math.sin(Math.PI * u);
        ctx.globalAlpha = previousAlpha * glint * travel * 0.9;
        ctx.fillStyle = tokens.edgeTrail;
        ctx.beginPath();
        ctx.arc(at.x, at.y, Math.max(0.9, width * 0.9), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = previousAlpha;
    }
    /* A still direction mark for a walked relation: reduced motion gets no direction from the light and endpoint ordinals are ambiguous on a revisited node; offset from the midpoint to clear the caption. */
    if (glint > 0.01 && tokens.edgeTrail) {
        const forward = state.trailDirection !== false;
        const head = bezierPoint(a, control, b, forward ? TRAIL_CHEVRON_AT : 1 - TRAIL_CHEVRON_AT);
        const tailAt = forward ? TRAIL_CHEVRON_AT - TRAIL_CHEVRON_SPAN : 1 - TRAIL_CHEVRON_AT + TRAIL_CHEVRON_SPAN;
        const tail = bezierPoint(a, control, b, tailAt);
        const dx = head.x - tail.x;
        const dy = head.y - tail.y;
        const vectorLength = Math.hypot(dx, dy);
        if (vectorLength > 0.5) {
            const ux = dx / vectorLength;
            const uy = dy / vectorLength;
            const arm = Math.max(3, width * TRAIL_CHEVRON_ARM);
            const previousAlpha = ctx.globalAlpha;
            const previousCap = ctx.lineCap;
            const previousJoin = ctx.lineJoin;
            ctx.globalAlpha = previousAlpha * glint;
            ctx.strokeStyle = tokens.edgeTrail;
            ctx.lineWidth = Math.max(1, width * 0.9);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            // An open chevron, never a filled triangle, so it stays the weight of the line it rides on.
            ctx.moveTo(head.x - (ux * 0.72 + uy * 0.62) * arm, head.y - (uy * 0.72 - ux * 0.62) * arm);
            ctx.lineTo(head.x, head.y);
            ctx.lineTo(head.x - (ux * 0.72 - uy * 0.62) * arm, head.y - (uy * 0.72 + ux * 0.62) * arm);
            ctx.stroke();
            ctx.globalAlpha = previousAlpha;
            ctx.lineCap = previousCap;
            ctx.lineJoin = previousJoin;
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
/** Past the midpoint to clear the relation caption, short of the target so it is not mistaken for the node's. */
const TRAIL_CHEVRON_AT = 0.62;
/** How far back along the curve the chevron takes its heading from. */
const TRAIL_CHEVRON_SPAN = 0.08;
/** Arm length as a multiple of the line's own width, floored at 3px so it survives a hairline. */
const TRAIL_CHEVRON_ARM = 3.4;
