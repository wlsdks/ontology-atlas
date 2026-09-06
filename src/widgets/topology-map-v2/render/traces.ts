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
  halo?: { color: string; px: number; alpha: number } | null;
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
  /** Edge-selection stroke (`--topology-v2-edge-selected`); falls back to indigoBright. */
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

export function draw(ctx: CanvasRenderingContext2D, state: TraceDrawState, tokens: TraceTokens): void {
  const { a, b, control, farT, egoState, t } = state;
  const isDepends = state.relationType === "depends";
  const emphasized = egoState === "ego" && state.emphasized === true;

  let stroke: string;
  let width: number;
  // "The walked path" wins over every other state. While the lens
  // is on this edge is neither selected nor ego — the caller turns both off —
  // yet it is the only thing the user is trying to read. Width goes from dim (1)
  // to at most 1.6: any thicker and the line beats the footprint marks, and the
  // picture reads as "an emphasised relation" instead of "a path".
  const trailWalked = clamp01(state.trailWalked ?? 0);
  if (trailWalked > 0.01 && tokens.edgeTrail) {
    stroke = mixHex(tokens.edgeDim, tokens.edgeTrail, trailWalked);
    width = 1 + 0.6 * trailWalked;
  } else if (state.selected === true) {
    // The subject of the pair focus — pale indigo, the top ink.
    stroke = tokens.edgeSelected ?? tokens.indigoBright;
    // Toned down — owner: "The colour is too strong." Thin and
    // pale so it reads as light rather than ink over a dim scene; the liveliness
    // keeps coming from the depends comet tail.
    width = (isDepends ? 1.7 : 1.5) - farT * 0.4;
  } else if (egoState === "dim") {
    stroke = tokens.edgeDim;
    width = 1;
  } else if (egoState === "ego") {
    // Panel-linked ripple: brightest indigo + thicker; otherwise the standard
    // ego brightening (depends bright, contains indigo).
    stroke = emphasized || isDepends ? tokens.indigoBright : tokens.indigo;
    width = (isDepends ? 1.8 : 1.5) - farT * 0.5 + (emphasized ? 0.9 : 0);
  } else {
    if (isDepends) {
      stroke = tokens.edgeDepends;
      width = 1.3 + (0.6 - 1.3) * farT;
    } else {
      // Ink ramp: L0 darker and thicker (trunk), L2 slightly receded (twig).
      const level = state.level ?? 1;
      stroke =
        level === 0
          ? tokens.edgeContainsL0 ?? tokens.edgeContains
          : level === 2
            ? tokens.edgeContainsL2 ?? tokens.edgeContains
            : tokens.edgeContains;
      width = (1 + (0.45 - 1) * farT) * CONTAINS_LEVEL_WIDTH_FACTOR[level];
    }
    const hoverLift = clamp01(state.hoverLift ?? 0);
    if (hoverLift > 0.01) {
      // The same ink the ego state uses, blended by the ramp: at 1 the line is
      // exactly what a click would make it, so hover reads as "this is what you
      // would get" rather than a third colour.
      stroke = mixHex(stroke, isDepends ? tokens.indigoBright : tokens.indigo, hoverLift);
      width += HOVER_LIFT_WIDTH_PX * hoverLift;
    }
  }

  // 3D view — hairline falloff by depth. The caller (`topology-frame-draw.ts`)
  // computes it from the dome falloff × depth; 2D passes 1.
  width *= state.widthScale ?? 1;
  // …then the device-pixel floor under a resting 3D line (`minWidthPx`). Applied
  // to the base width only, so the taper below still modulates around it.
  const minWidthPx = state.minWidthPx ?? 0;
  if (minWidthPx > width) width = minWidthPx;

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

  ctx.strokeStyle = stroke;
  // Symmetric relations (`related_to`) keep the dash but get **no taper** —
  // uniform width encodes that both ends are equals. The width used is the
  // taper's **mean** (1.0): matching the start width (1.4) would add 49% ink to
  // the screen, whereas the mean lands within 0.02% of the tapered line's total
  // ink (measured in the browser 2026-07-31).
  const tapered = isDepends && state.directional !== false;
  if (isDepends && !tapered) {
    ctx.beginPath();
    ctx.setLineDash(DEPENDS_DASH);
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
    ctx.lineWidth = Math.max(0.35, width);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (tapered) {
    // Directional taper: a variable-width polyline thinning source→target. Dash
    // continuity is kept by advancing `lineDashOffset` by the accumulated length
    // per segment; round cap/join hide the seams. No arrowhead — width is the
    // direction cue.
    // perf 2026-08-19 — segment points are computed inline into locals instead
    // of via `bezierPoint`: identical formula (u², 2ut, t²) so the coordinates
    // match, and the 14 temporary objects born per edge become 0.
    ctx.setLineDash(DEPENDS_DASH);
    const prevCap = ctx.lineCap;
    const prevJoin = ctx.lineJoin;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let prevX = a.x;
    let prevY = a.y;
    let acc = 0;
    for (let i = 1; i <= DEPENDS_TAPER_SEGMENTS; i += 1) {
      const t = i / DEPENDS_TAPER_SEGMENTS;
      const uu = 1 - t;
      const pointX = uu * uu * a.x + 2 * uu * t * control.x + t * t * b.x;
      const pointY = uu * uu * a.y + 2 * uu * t * control.y + t * t * b.y;
      const u = (i - 0.5) / DEPENDS_TAPER_SEGMENTS;
      ctx.beginPath();
      ctx.lineWidth = Math.max(0.35, width * dependsTaperFactor(u));
      ctx.lineDashOffset = -acc;
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(pointX, pointY);
      ctx.stroke();
      acc += Math.hypot(pointX - prevX, pointY - prevY);
      prevX = pointX;
      prevY = pointY;
    }
    ctx.lineCap = prevCap;
    ctx.lineJoin = prevJoin;
    ctx.lineDashOffset = 0;
    ctx.setLineDash([]);
  } else {
    // The dash state on entry is always [] (see the halo comment above), so this
    // path makes no dash call at all — the two `setLineDash([])` per frame that
    // every contains edge used to issue are now zero.
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
    ctx.lineWidth = Math.max(0.35, width);
    ctx.stroke();
  }

  if (isDepends) {
    if (egoState === "dim") return;
    // Always-on comets, restored on owner instruction "Bring the old one back", reversing the earlier demotion to "comet tail = focus
    // signal": the tail flows on every non-dim depends edge regardless of focus
    // (prototype §13 `drawEdge`, `state !== "dim"`). Phase advance is owned by
    // `updateParticles`, which stops under reduced-motion, so those users get
    // nothing here either and the canvas stays fully still.
    if (state.reducedMotion === true) return;
    // Edges outside the cap keep the dashed body and draw no particles: the
    // always-on behaviour, the speed, and the focus-independence are unchanged —
    // only the number of dots flowing at once becomes bounded.
    if (state.dependsCometEligible === false) return;

    // comet tail — three shrinking dots trailing the live pulse position,
    // thinning toward hairline dust as altitude rises rather than fading via
    // alpha (forbidden.md bans glow/alpha-based "signal" motifs). ego/selected
    // edges get a larger tail plus bright indigo; normal gets pale indigo, the
    // prototype's symmetry.
    const ego = egoState === "ego" || state.selected === true;
    const baseSizes = emphasized ? COMET_TAIL_BASE_EMPHASIZED : ego ? COMET_TAIL_BASE_EGO : COMET_TAIL_BASE_NORMAL;
    const tailColor = ego ? tokens.indigoBright : tokens.indigo;
    // perf 2026-08-19 — the forEach closure and the bezierPoint allocation are
    // gone; the same formula is inlined.
    ctx.fillStyle = tailColor;
    for (let i = 0; i < COMET_TAIL_STEPS.length; i += 1) {
      let tt = t - COMET_TAIL_STEPS[i];
      if (tt < 0) tt += 1;
      const uu = 1 - tt;
      const px = uu * uu * a.x + 2 * uu * tt * control.x + tt * tt * b.x;
      const py = uu * uu * a.y + 2 * uu * tt * control.y + tt * tt * b.y;
      const size = baseSizes[i] + (COMET_TAIL_FAR_SIZES[i] - baseSizes[i]) * farT;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Design Guardian-approved: contains edges incident to the selection (ego)
  // also carry comet flow — a continuous phase owned by `updateParticles`, not a
  // one-shot burst. Direction stays source→target (the parent→child typed fact;
  // no reversal or radiation as in depends), which holds automatically because
  // a/b are already the source/target screen coordinates and the call is the
  // same `bezierPoint(a, control, b, t)`. The tail is always the NORMAL tier
  // ([2.1, 1.5, 0.9] — one step below the depends-ego [2.9, 2.1, 1.3], preserving
  // the ink hierarchy) in standard indigo, never bright: no ego/emphasized
  // promotion. When `containsCometEligible` is false, only the body stroke drawn
  // above remains. Deselecting takes egoState out of "ego", so the particles
  // disappear on the next frame with no separate exit animation.
  if (egoState !== "ego" || state.containsCometEligible !== true) return;
  if (state.reducedMotion === true) return;
  ctx.fillStyle = tokens.indigo;
  for (let i = 0; i < COMET_TAIL_STEPS.length; i += 1) {
    let tt = t - COMET_TAIL_STEPS[i];
    if (tt < 0) tt += 1;
    const uu = 1 - tt;
    const px = uu * uu * a.x + 2 * uu * tt * control.x + tt * tt * b.x;
    const py = uu * uu * a.y + 2 * uu * tt * control.y + tt * tt * b.y;
    const size = COMET_TAIL_BASE_NORMAL[i] + (COMET_TAIL_FAR_SIZES[i] - COMET_TAIL_BASE_NORMAL[i]) * farT;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
}
