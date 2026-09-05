/**
 * Node body geometry + paint — ported from the B2+ prototype's
 * `roundedPolygonPath()`/`hexPoints()`/`squarePoints()`/`drawEngraved()`/
 * `drawNode()` (`docs/prototypes/topology-b2plus.html` §12-13).
 *
 * Shape-by-kind (unchanged across altitude): project = hex plate, domain =
 * square chip (with pin-tick legs in circuit range), capability = circle
 * (no morph needed), element = square copper-pad-with-drilled-via. Corner
 * rounding grows toward the full radius as `farT → 1`, so every polygon
 * converges into a plain circle at the far-field end
 * (`docs/TOPOLOGY-V2-DESIGN.md` §3.1 — continuous morph, no shape swap).
 *
 * Zero React imports (per module contract) — this is pure Canvas 2D drawing
 * plus a few extractable pure-geometry helpers that ARE unit-testable
 * without a canvas (`node-shapes.test.ts`).
 *
 * `draw()` itself has no dedicated test (canvas side effects aren't
 * meaningfully assertable without a heavy mock; P5's screenshot gate is the
 * real verification for paint correctness, per design doc §4 P3 gate).
 */

import { smoothstep } from "../model/altitude";
import { FONT_WEIGHT } from "@/shared/ui/font-weight";
import { computeHoverShimmer } from "../model/hover-shimmer";

export interface Point {
  x: number;
  y: number;
}

/** Six points of a regular hexagon, flat-top-rotated -90° (prototype: `a = i*60 - 90` degrees). */
/**
 * Light-source offset of the depth shading, as a multiple of the radius — up and
 * to the left. Rationale: the `depthShade` doc-block (Sun & Perona 1998 — the
 * visual system's "light comes from above, slightly left" assumption).
 */
const NODE_DEPTH_SHADE_LIGHT_OFFSET = 0.4;
/** Max black alpha at the shaded rim. Any stronger and the disc reads as a hole. */
const NODE_DEPTH_SHADE_MAX_ALPHA = 0.5;
/**
 * Below this screen radius (px) the shading is skipped — on a 3–4px disc the
 * gradient reads as noise rather than volume, and all that is left is the cost
 * of building a gradient object per node.
 */
const NODE_DEPTH_SHADE_MIN_RADIUS_PX = 3.5;

/**
 * Depth-shading gradient cache, keyed by rounded (radius, strength). Coordinates
 * are deliberately not in the key: the gradient is built **around the origin**
 * and moved into place with `translate` at draw time.
 */
const shadeGradientCache = new Map<string, CanvasGradient>();
const SHADE_CACHE_MAX = 512;

function buildDepthShade(ctx: CanvasRenderingContext2D, r: number, strength: number): CanvasGradient {
  const shade = ctx.createRadialGradient(
    // Where the light comes from — up and slightly left; that spot stays untouched.
    -r * NODE_DEPTH_SHADE_LIGHT_OFFSET,
    -r * NODE_DEPTH_SHADE_LIGHT_OFFSET,
    r * 0.05,
    0,
    0,
    r * 1.25,
  );
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(0.55, `rgba(0, 0, 0, ${(NODE_DEPTH_SHADE_MAX_ALPHA * strength * 0.35).toFixed(3)})`);
  shade.addColorStop(1, `rgba(0, 0, 0, ${(NODE_DEPTH_SHADE_MAX_ALPHA * strength).toFixed(3)})`);
  return shade;
}

export function hexPoints(cx: number, cy: number, r: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return points;
}

/** Four corners of an axis-aligned square, half-extent `s`. */
export function squarePoints(cx: number, cy: number, s: number): Point[] {
  return [
    { x: cx - s, y: cy - s },
    { x: cx + s, y: cy - s },
    { x: cx + s, y: cy + s },
    { x: cx - s, y: cy + s },
  ];
}

/**
 * Corner radius at a given altitude — `lerp(minRadius, fullRadius, farT)`.
 * `minRadius` is a small constant per kind in the prototype (e.g.
 * `Math.min(4, r*0.14)` for project); `fullRadius` is the node's own draw
 * radius `r` (farT=1 → radius=r → the "rounded polygon" degenerates into a
 * circle, which `draw()` special-cases at `farT > 0.985` exactly like the
 * prototype, to avoid float-precision polygon/circle seams).
 */
export function interpolateCornerRadius(minRadius: number, fullRadius: number, farT: number): number {
  return minRadius + (fullRadius - minRadius) * farT;
}

export interface NodeShapeDrawState {
  kind: "project" | "domain" | "capability" | "element";
  screenX: number;
  screenY: number;
  /** Screen-space draw radius (world radius × camera.scale × breathe). */
  screenRadius: number;
  farT: number;
  egoState: "center" | "neighbor" | "dim" | "normal";
  fill: string;
  stroke: string;
  lineWidth: number;
  dash: readonly number[];
  hub: boolean;
  /**
   * Top stop of the vertical metallic-sheen gradient (prototype `drawNode`:
   * `lerpColor(fill, "#232329", 0.6)`). Resolved by the caller from the
   * `--topology-v2-node-sheen-*` tokens so this pure module stays token-free;
   * the bottom stop is always `fill`.
   */
  sheenTop: string;
  /** Engraved node-count numeral, or null to skip (project/domain only, per prototype). */
  countLabel: string | null;
  /**
   * The currently-hovered node (no focus active — hover is suppressed under
     * focus, `topology-frame-draw.ts` nulls `hoveredNodeId` there). Draws a
     * static 1px indigo hairline preview ring — the "Can grab this"
     * affordance of the canvas-emphasis slice §C — never for the already-`"center"` node, which
     * has its own stronger selection ring below.
     */
  isHovered: boolean;
  /**
   * rank5 — the hovered node's own hover-ripple emphasis (0..1, the SAME
   * `emphasisById` scalar the body wake rides, rise τ 0.09). The static hover
   * preview ring's alpha is multiplied by it so the ring rises ON the body's
   * wake curve instead of hard-popping to full opacity on the first hover frame.
   * Only read while `isHovered`; defaults to 1 when omitted (callers that don't
   * thread emphasis keep the pre-rank5 always-solid ring). reduced-motion snaps
   * emphasis to 1, so the ring is instantly solid there.
   */
  hoverEmphasis?: number;
  /**
   * One-shot commit-pulse visual for the just-selected (`egoState ===
   * "center"`) node, or `null` outside its brief window (already played out,
   * `prefers-reduced-motion`, or this isn't the node that was just clicked).
   * `model/selection-pulse.ts#computeSelectionPulse` is the pure source;
   * never loops — once elapsed exceeds the duration it's permanently null
   * until the NEXT click resets the timestamp.
   */
  selectionPulse: { scaleFactor: number; alpha: number } | null;
  /**
   * W6 agent visibility — true for the single node matching the current
     * agent heartbeat's `focus.ontologySlug` (resolved upstream by
     * `views/home/lib/resolve-agent-focus-node.ts`), only while that
     * heartbeat is fresh (`hasFreshHeartbeat`, `topology-frame-draw.ts`'s
     * caller nulls the id otherwise). Draws a static amber hairline ring — the
     * SAME `amberHub` signal tone as the hub ring / project hexagon, never a
     * glow (design.md "Material instead of emission" — material, not emission). Real heartbeat
     * data only; `false`
     * whenever there's no fresh focus (fabrication 0).
     */
  agentFocus: boolean;
  /**
   * Spotlight ring for changed nodes. Owner, 2026-07-23: "Only the changed ones should have a rotating border." While the
     * lens is on, nodes inside the mtime window get an amberHub **rotating dashed**
     * kind-outline — the fix for a report that changed nodes were unreadable in
     * the element view when settling contrast was the only cue. Zero glow/blur
     * (material, not emission); amberHub follows the agent-focus ring's precedent
     * as a signal tone. `alpha` is the lens fade in/out, `dashOffset` the rotation
     * phase in px (the caller pins it to 0 under reduced-motion, giving a static
     * dash). null hides it.
     */
  spotlightRing: { alpha: number; dashOffset: number } | null;
  /**
   * Time source for the hover circuit-trace shimmer: the frame's
   * `performance.now()`-compatible timestamp, taken here only because the pixel
   * drawing itself is a pure layer that knows nothing of time. The static hover
   * ring (the `isHovered` block) is drawn regardless of this value; only the
   * shimmer arc is layered on top, and only when `!reducedMotion`.
   */
  now: number;
  reducedMotion: boolean;
  /**
   * Icon set. The kind→silhouette mapping is identical regardless of this value
   * (`bodyPoints` unchanged); it switches **render style only**: `"fill"` (the
   * current default) is the kind fill plus the metallic sheen gradient, `"line"`
   * is an unfilled flat dark body (hole-fill) with a slightly thinner outline.
   * It reads the same store (`appearance-preferences`) as the DOM
   * `TopologyV2KindGlyph` line set, so both surfaces swap together. Defaults to
   * `"fill"`.
   */
  glyphStyle?: "fill" | "line";
  /**
   * 3D view — **depth shading** strength, 0..1. At 0 (the default) not a single
   * extra stroke is issued.
   *
   * The human visual system resolves shading ambiguity by assuming light comes
   * from above and slightly to the left (Sun & Perona, *Nature Neuroscience*
   * 1(3), 1998). So laying a single luminance gradient in that direction over a
   * disc makes it read as a **sphere** — the cheapest way to stop the dots from
   * looking like stickers in 3D.
   *
   * **The dark side is darkened; the lit side is never brightened.** A highlight
   * or rim light on the opposite side would be exactly the glow the charter
   * bans. All this uses is one black alpha: zero new hues, no bleed, no motion.
   */
  depthShade?: number;
  /**
   * 3D view — **far-side detail factor**, 0..1
   * (`model/dome-view.ts#domeDetailFactor`). At 1 (the default) the result is
   * pixel-identical to before. It folds to 0 on the rear hemisphere, and only
   * **supplementary strokes** recede: the outline stroke (fill set only — in the
   * line set the outline *is* the mark, so it never folds) and the domain pin
   * ticks. The disc fill, being the mark itself, is untouched at any value. The
   * falloff is C¹ continuous (smoothstep), so a stroke can never pop out
   * mid-rotation.
   */
  detail?: number;
  /**
   * 3D view — **the rim's floor against depth fog**, ≥ 1. At 1 (the default) the
   * result is pixel-identical to before.
   *
   * Depth fog multiplies the whole node, rim included, and bottoms out at 0.09.
   * Measured on the sample vault at 1920 (2026-09-05): the median node rim stood
   * at 1.15 : 1 against the background beside it, 117 of 125 nodes were under
   * 3 : 1, and 92 were under 1.5 : 1 — a hundred shapes whose edge you cannot
   * see. The caller passes `max(1, DOME_RIM_FOG_FLOOR / fog)` here and the
   * outline is drawn at that share of its unfogged alpha, overriding the
   * far-side detail fade as well: a mark with no visible edge is not a mark.
   *
   * The fill, the depth shading, the halo, the line-width attenuation, the
   * perspective size and the draw order all still carry depth, so this costs the
   * cue nothing it was the only carrier of.
   */
  rimAlphaScale?: number;
}

/** Pure descriptor for render style only; the kind→silhouette mapping is invariant. */
export interface GlyphStyleDescriptor {
  /** Line set: no kind fill, a flat dark body plus the outline. */
  lineOnly: boolean;
  /** Body outline width multiplier — the line set is slightly lighter. */
  lineWidthScale: number;
}

// perf 2026-08-19 — two pure constants with no reason to be rebuilt per node.
// Consumers only read them, so sharing one object each is pixel-identical.
const GLYPH_STYLE_LINE: GlyphStyleDescriptor = { lineOnly: true, lineWidthScale: 0.8 };
const GLYPH_STYLE_FILL: GlyphStyleDescriptor = { lineOnly: false, lineWidthScale: 1 };

export function glyphStyleDescriptor(glyphStyle: "fill" | "line" | undefined): GlyphStyleDescriptor {
  return glyphStyle === "line" ? GLYPH_STYLE_LINE : GLYPH_STYLE_FILL;
}

export interface NodeShapeTokens {
  amberHub: string;
  recentChange: string;
  numeralShadow: string;
  numeralFace: string;
  holeFill: string;
  /**
   * Canvas-emphasis slice — Layer-0 container identity (design.md: "Amber allowed on hub nodes and Layer 0 containers only" — amber is allowed on hub nodes and
     * Layer-0 containers only). Inner offset hairline for the
     * project hexagon's double-hairline "machined bezel" (spec §A1's second
     * stroke — the outer stroke itself is `amberHub`, applied to the BODY
     * stroke by `topology-frame-draw.ts#resolveNodeVisual`, not here).
     */
  projectHairlineInner: string;
  /** Canvas-emphasis slice — project hexagon's 4-direction chassis-leg pin ticks (spec §A2). */
  projectPinTick: string;
  /** Canvas-emphasis slice — the static 2px selection ring's color (`tokens.indigoBright`, spec §B1). */
  selectionIndigo: string;
  /** Canvas-emphasis slice — the outer 6px hairline ring's color, a lower-alpha indigo (spec §B1's second ring). */
  selectionHairline: string;
  /**
   * #5 — the connected-neighbor ring color. A THIN pale-indigo ring on the
   * body outline of every direct (1-hop) neighbor of the selected node, so
   * "what this connects to" reads as clearly as the edges do. Same indigo
   * hue as the selection ring, differentiated by VALUE only (pale
   * `--topology-v2-edge-selected`), per the charter's selection-color ladder
   * — never a new blue hue.
   */
  neighborRing: string;
  /** Canvas-emphasis slice — the hover preview ring's color (spec §C), a static 1px indigo hairline distinct from the brighter selection ring. */
  hoverRing: string;
  /** Hover shimmer arc length, as a fraction of the perimeter (`--topology-v2-hover-shimmer-seg`). */
  hoverShimmerSeg: number;
  /** Hover shimmer period for one full revolution, ms (`--topology-v2-hover-shimmer-period-ms`). */
  hoverShimmerPeriodMs: number;
  /** Hover shimmer arc colour — reuses `--topology-v2-indigo-bright`; no new hue. */
  hoverShimmerColor: string;
}

/** Full convergence to a plain circle above this farT — avoids float-precision polygon/circle seams (prototype: `farT > 0.985`). */
const FULL_CIRCLE_FAR_T = 0.985;

/** Sheen dissolves out toward far field — above this farT (or below `SHEEN_MIN_RADIUS`) the body fills flat so constellation points read luminous, not machined (prototype: `r > 3 && farT < 0.98`). */
const SHEEN_MAX_FAR_T = 0.98;
const SHEEN_MIN_RADIUS = 3;

/**
 * Engraved node-count numeral shows only above this screen radius (project/
 * domain). Ported prototype literal was 15; lowered to 13 because with the
 * decoupled circuit-entry camera the domain chip (worldRadius 17 × entry scale
 * ≈ 0.86) lands at ~14.7px on load — just under the old gate, so domain counts
 * never appeared at the overview even though `farT = 0` (circuit). 13 clears the
 * ±4% breathe trough with margin so counts stay stable, and still hides counts
 * once nodes shrink toward the far-field/constellation size on zoom-out.
 */
const ENGRAVED_COUNT_MIN_RADIUS = 13;

/** Domain chip-leg pin ticks — geometry ratios ported from the prototype's `[-0.45,0.45]` offsets + `tick = s*0.34` leg length, gated `s > 6 && farT < 0.9`. */
const DOMAIN_PIN_MIN_HALF_EXTENT = 6;
const DOMAIN_PIN_MAX_FAR_T = 0.9;
const DOMAIN_PIN_TICK_RATIO = 0.34;
const DOMAIN_PIN_OFFSET_FACTORS = [-0.45, 0.45] as const;

/** Half-extent factor of the domain square relative to its draw radius (prototype `s = r * 0.86`). */
const DOMAIN_HALF_EXTENT_RATIO = 0.86;

/** Canvas-emphasis slice — project hexagon decor (double hairline + pin ticks) fades out toward far field, mirroring the domain pin-tick gate. */
const PROJECT_DECOR_MIN_RADIUS = 8;
const PROJECT_DECOR_MAX_FAR_T = 0.9;
/** Inner hairline sits inset at this fraction of the outer body radius (ported ratio from the flagship prototype's double-hex, `docs/prototypes/first-run-v3-flagship.html` — outer circumradius 41, inner 31 ≈ 0.756). */
const PROJECT_HAIRLINE_INNER_RATIO = 0.75;
/** Selection ring offsets — the inner ring sits exactly on the body outline (spec §B1's "Node outer edge", the node's outer edge), the outer hairline 6px beyond it. */
const SELECTION_RING_OUTER_OFFSET = 6;
/** The one-shot commit-pulse ring sits between the two static rings so its brief expansion reads as coming FROM the node, not replacing either static ring. */
const SELECTION_PULSE_RING_OFFSET = 3;
/** Hover preview ring sits just outside the body, inside the (mutually-exclusive, hover never fires under focus) selection ring's radius. */
const HOVER_RING_OFFSET = 3;
/** W6 agent visibility — agent-focus ring offset (owner spec: "Static 1px, r+8"), deliberately wider than the hub ring's r+4 so the two never visually merge on a hub node the agent is also focused on. */
const AGENT_FOCUS_RING_OFFSET = 8;

export interface PinTick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The four chip-leg pin ticks of a domain square — two above, two below, one
 * pair per `[-0.45, 0.45]` x-offset. Pure screen-space geometry (ported from
 * the prototype's domain branch), unit-tested in `node-shapes.test.ts`.
 */
export function domainPinTicks(cx: number, cy: number, s: number): PinTick[] {
  const tick = s * DOMAIN_PIN_TICK_RATIO;
  const ticks: PinTick[] = [];
  for (const f of DOMAIN_PIN_OFFSET_FACTORS) {
    const x = cx + s * f;
    ticks.push({ x1: x, y1: cy - s, x2: x, y2: cy - s - tick });
    ticks.push({ x1: x, y1: cy + s, x2: x, y2: cy + s + tick });
  }
  return ticks;
}

/** Fixed 6px leg length for the project hexagon's 4-direction pin ticks (owner spec, canvas-emphasis slice — "Pin ticks in 4 directions (up/down/left/right 6px line)": four ticks, up/down/left/right, 6px each), unlike domain's radius-proportional ticks. */
const PROJECT_PIN_TICK_LENGTH = 6;

/**
 * The four "chassis leg" pin ticks on the project hexagon — one per cardinal
 * direction (up/down/left/right), each a fixed 6px line starting at the
 * node's own edge (`r`) and pointing outward. "Machined-part vocabulary" — reinforces the project node's Layer-0-container identity
 * without any glow, mirroring `domainPinTicks`' geometry-as-decoration
 * approach but with fixed (not radius-proportional) leg length per spec.
 */
export function projectPinTicks(cx: number, cy: number, r: number): PinTick[] {
  const t = PROJECT_PIN_TICK_LENGTH;
  return [
    { x1: cx, y1: cy - r, x2: cx, y2: cy - r - t },
    { x1: cx, y1: cy + r, x2: cx, y2: cy + r + t },
    { x1: cx - r, y1: cy, x2: cx - r - t, y2: cy },
    { x1: cx + r, y1: cy, x2: cx + r + t, y2: cy },
  ];
}

/**
 * The body fill for one node: a vertical `sheenTop → fill` gradient when the
 * node is big + near enough (prototype `r > 3 && farT < 0.98`), otherwise the
 * flat `fill`. Ported from `drawNode`'s sheen block (§13).
 */
function resolveBodyFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  farT: number,
  fill: string,
  sheenTop: string,
): string | CanvasGradient {
  if (r <= SHEEN_MIN_RADIUS || farT >= SHEEN_MAX_FAR_T) return fill;
  // When the far-side detail factor has converged sheenTop onto fill (identical
  // string), both stops are the same colour — return the flat fill early instead
  // of building that gradient. Pixel-identical.
  if (sheenTop === fill) return fill;
  const grad = ctx.createLinearGradient(x, y - r, x, y + r);
  grad.addColorStop(0, sheenTop);
  grad.addColorStop(1, fill);
  return grad;
}

/** Ported from the prototype's `roundedPolygonPath()` — traces a closed polygon path with each corner rounded to `min(rad, adjacentEdgeLen*0.45)`. */
function roundedPolygonPath(ctx: CanvasRenderingContext2D, points: readonly Point[], rad: number): void {
  const n = points.length;
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const v1x = p1.x - p0.x;
    const v1y = p1.y - p0.y;
    const len1 = Math.hypot(v1x, v1y) || 1;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const r = Math.min(rad, len1 * 0.45, len2 * 0.45);
    const sx = p1.x - (v1x / len1) * r;
    const sy = p1.y - (v1y / len1) * r;
    const ex = p1.x + (v2x / len2) * r;
    const ey = p1.y + (v2y / len2) * r;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    ctx.quadraticCurveTo(p1.x, p1.y, ex, ey);
  }
  ctx.closePath();
}

/** Ported from the prototype's `drawEngraved()` — a 1px dark shadow beneath a lighter face, reading as an inset/engraved numeral rather than printed text. */
function drawEngraved(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  alpha: number,
  tokens: NodeShapeTokens,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${FONT_WEIGHT.strong} ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  // Multiply into the frame's alpha rather than replacing it — the caller has
  // already folded tier, dim and the appear ramp into `ctx.globalAlpha`, and a
  // numeral drawn at its own absolute alpha stayed visible on a node that was
  // otherwise gone (measured 2026-09-02 during the growth replay).
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  ctx.fillStyle = tokens.numeralShadow;
  ctx.fillText(text, x, y + 1);
  ctx.fillStyle = tokens.numeralFace;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = prevAlpha;
}

/**
 * This kind's polygon points at draw radius `r` — `null` for capability, which
 * is already a plain circle. Exported (in addition to internal use by
 * `draw()`/`strokeKindOutline()`/`outlinePerimeter()`) so
 * `tests/contract/node-kind-shape-parity.contract.test.ts` can read the
 * canvas gateway's kind→silhouette mapping directly instead of re-deriving it
 * from `draw()`'s side effects — that contract test is the ONLY thing that
 * checks this mapping agrees with the DOM gateway's
 * (`shared/ui/topology-v2-kind-glyph.tsx`); each file's own unit tests only
 * check internal consistency, not parity across the two gateways.
 */
export function bodyPoints(kind: NodeShapeDrawState["kind"], x: number, y: number, r: number): readonly Point[] | null {
  if (kind === "project") return hexPoints(x, y, r);
  if (kind === "domain") return squarePoints(x, y, r * DOMAIN_HALF_EXTENT_RATIO);
  if (kind === "element") return squarePoints(x, y, r * 0.92);
  return null;
}

/*
 * perf 2026-08-19 — draw-internal scratch version of `bodyPoints`.
 *
 * `hexPoints`/`squarePoints` allocate 4–6 point objects plus an array per call.
 * The node body and the ring overlays each call them per node, so 2,000 nodes ×
 * 60fps is hundreds of thousands per second. The coordinate formulas here are
 * **exactly** those functions' (same angles, same ratios), and the result is
 * consumed immediately by `roundedPolygonPath`, so no state is shared across
 * frames — this file's draw path runs synchronously inside a single rAF loop.
 * The external contract (the `bodyPoints` export, contract test) keeps the
 * allocating version.
 */
const HEX_SCRATCH: Point[] = Array.from({ length: 6 }, () => ({ x: 0, y: 0 }));
const SQUARE_SCRATCH: Point[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));

function hexPointsScratch(cx: number, cy: number, r: number): readonly Point[] {
  for (let i = 0; i < 6; i += 1) {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    HEX_SCRATCH[i].x = cx + r * Math.cos(a);
    HEX_SCRATCH[i].y = cy + r * Math.sin(a);
  }
  return HEX_SCRATCH;
}

function squarePointsScratch(cx: number, cy: number, s: number): readonly Point[] {
  SQUARE_SCRATCH[0].x = cx - s;
  SQUARE_SCRATCH[0].y = cy - s;
  SQUARE_SCRATCH[1].x = cx + s;
  SQUARE_SCRATCH[1].y = cy - s;
  SQUARE_SCRATCH[2].x = cx + s;
  SQUARE_SCRATCH[2].y = cy + s;
  SQUARE_SCRATCH[3].x = cx - s;
  SQUARE_SCRATCH[3].y = cy + s;
  return SQUARE_SCRATCH;
}

function bodyPointsScratch(kind: NodeShapeDrawState["kind"], x: number, y: number, r: number): readonly Point[] | null {
  if (kind === "project") return hexPointsScratch(x, y, r);
  if (kind === "domain") return squarePointsScratch(x, y, r * DOMAIN_HALF_EXTENT_RATIO);
  if (kind === "element") return squarePointsScratch(x, y, r * 0.92);
  return null;
}

/**
 * This kind's minimum corner radius at farT=0.
 *
 * B6 (Guardian): the old absolute px caps (`min(4, …)`) were keyed to the
 * SCREEN radius, so the same node changed silhouette character with zoom —
 * r=28 got 14% corners (soft hex), r=200 got 2% (razor hex). The engine's
 * declared contract is "farT is the ONLY morph axis"; screen scale was an
 * undeclared second one. Ratios keep the silhouette self-similar; the 0.5px
 * FLOOR keeps tiny radii from collapsing into sub-pixel corners (the caps'
 * original purpose, now expressed at the correct end of the scale).
 */
function minCornerRadius(kind: NodeShapeDrawState["kind"], r: number): number {
  if (kind === "project") return Math.max(0.5, r * 0.14);
  if (kind === "domain") return Math.max(0.5, r * 0.86 * 0.22);
  return Math.max(0.5, r * 0.92 * 0.3);
}

/**
 * Strokes ONE ring at `radius`, following the node's own kind-shape (hex/
 * square/rounded-square, converging to a circle past `FULL_CIRCLE_FAR_T` —
 * same convergence rule as the body itself) — a "material ring" overlay
 * (`.claude/rules/design.md` "Material, not emission" — material, not emission), never a
 * glow/shadow. Shared by
 * the hub ring, the project double-hairline, the selection double-ring, its
 * one-shot commit pulse, and the hover preview ring — all five are the same
 * primitive at a different radius/color/width/alpha.
 */
function strokeKindOutline(
  ctx: CanvasRenderingContext2D,
  kind: NodeShapeDrawState["kind"],
  x: number,
  y: number,
  radius: number,
  farT: number,
  color: string,
  lineWidth: number,
  alpha: number,
): void {
  if (alpha <= 0.01 || radius <= 0) return;
  const points = bodyPointsScratch(kind, x, y, radius);
  if (points === null || farT > FULL_CIRCLE_FAR_T) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  } else {
    roundedPolygonPath(ctx, points, interpolateCornerRadius(minCornerRadius(kind, radius), radius, farT));
  }
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.globalAlpha = prevAlpha;
}

/**
 * Approximate perimeter of the node's own outline at this farT/kind — the
 * straight-edge sum of `bodyPoints` (ignoring the small corner-rounding
 * inset `roundedPolygonPath` trims off) for the polygon range, or a plain
 * circle circumference past `FULL_CIRCLE_FAR_T` — mirrors the exact same
 * polygon/circle branch `strokeKindOutline` draws with. Used only to size
 * the hover-shimmer dash pattern (a decorative overlay, not a hit-test), so
 * this approximation is enough — no separate test needed the way the pure
 * `model/hover-shimmer.ts` time math is.
 */
function outlinePerimeter(kind: NodeShapeDrawState["kind"], radius: number, farT: number): number {
  const points = bodyPointsScratch(kind, 0, 0, radius);
  if (points === null || farT > FULL_CIRCLE_FAR_T) return 2 * Math.PI * radius;
  let perimeter = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    perimeter += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  return perimeter;
}

/**
 * Design Guardian-approved: one slow travelling arc layered over the static
 * hover ring (`strokeKindOutline`). It re-traces the same shape path (hex/
 * square/circle, farT convergence rule included) but reveals only part of it via
 * `setLineDash`/`lineDashOffset`, reading as a signal running around a circuit —
 * zero glow/shadow (design.md), colour reused from the standard bright indigo.
 * A zero segment length (token drift, say) draws nothing.
 */
function drawHoverShimmer(
  ctx: CanvasRenderingContext2D,
  kind: NodeShapeDrawState["kind"],
  x: number,
  y: number,
  radius: number,
  farT: number,
  now: number,
  periodMs: number,
  segRatio: number,
  color: string,
): void {
  const perimeter = outlinePerimeter(kind, radius, farT);
  const { dash, offset } = computeHoverShimmer(now, periodMs, perimeter, segRatio);
  if (dash[0] <= 0) return;
  const points = bodyPointsScratch(kind, x, y, radius);
  if (points === null || farT > FULL_CIRCLE_FAR_T) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  } else {
    roundedPolygonPath(ctx, points, interpolateCornerRadius(minCornerRadius(kind, radius), radius, farT));
  }
  ctx.setLineDash([...dash]);
  ctx.lineDashOffset = offset;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.globalAlpha = prevAlpha;
}

/**
 * Draws one node body (fill/stroke/dash + kind-specific shape morph + hub
 * ring + engraved numeral + via-hole for elements). Does NOT draw the
 * diffraction spike overlay (`render/starfield.ts#drawDiffractionSpike`
 * owns that — it's a far-field-only "magnitude" overlay, orthogonal to
 * shape-by-kind) or the label (`render/labels.ts`).
 */
export function draw(ctx: CanvasRenderingContext2D, state: NodeShapeDrawState, tokens: NodeShapeTokens): void {
  // The alpha the frame handed us (tier × dim × appear ramp × …). Every
  // sub-stroke below multiplies into it and restores it; none replaces it.
  const entryAlpha = ctx.globalAlpha;
  const {
    kind,
    screenX: x,
    screenY: y,
    screenRadius: r,
    farT,
    egoState,
    fill,
    stroke,
    lineWidth,
    dash,
    hub,
    sheenTop,
    countLabel,
    isHovered,
    hoverEmphasis,
    selectionPulse,
    agentFocus,
    spotlightRing,
    now,
    reducedMotion,
    glyphStyle,
    depthShade = 0,
    detail = 1,
    rimAlphaScale = 1,
  } = state;

  const { lineOnly, lineWidthScale } = glyphStyleDescriptor(glyphStyle);

  // perf 2026-08-19 — nodes without a dash (the vast majority) issue no dash
  // call at all. Every painter restores [] after using a dash (traces,
  // cluster-chips, dome-rings, the frame-draw ring block, and this function
  // itself), so the dash state on entry is always empty — the two native calls
  // and the spread allocation per node now happen only on fresh/stale dashed
  // nodes.
  const hasDash = dash.length > 0;
  if (hasDash) ctx.setLineDash([...dash]);
  const points = bodyPointsScratch(kind, x, y, r);
  if (points === null || farT > FULL_CIRCLE_FAR_T) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else {
    roundedPolygonPath(ctx, points, interpolateCornerRadius(minCornerRadius(kind, r), r, farT));
  }
  // Line set: a flat dark body (hole-fill) rather than transparency, so edges
  // behind do not show through, and no metallic sheen — the mark reads as pure
  // outline. Fill set: the kind fill plus the sheen gradient. Either way the
  // silhouette path was already traced identically above.
  ctx.fillStyle = lineOnly ? tokens.holeFill : resolveBodyFill(ctx, x, y, r, farT, fill, sheenTop);
  ctx.fill();
  /*
   * Depth shading (3D) — see the `depthShade` doc-block above. This re-fills
   * **the very path just filled** (canvas `fill` does not clear the current
   * path), so the silhouette cannot drift. Skipped below the minimum radius,
   * where the gradient would be noise rather than volume.
   */
  if (depthShade > 0.01 && r >= NODE_DEPTH_SHADE_MIN_RADIUS_PX) {
    /*
     * **The gradient is cached.** This branch runs per node in 3D, and every
     * canvas gradient object is born fresh: 125 nodes × 120Hz is 15,000 per
     * second, and the bill arrives not as frame time but as a stutter the moment
     * GC steps in.
     *
     * The key is the **rounded radius and strength**. Those two alone fix the
     * gradient's shape (both the centre offset and the stops are functions of r
     * and strength), and differences below 0.5px / 0.05 are indistinguishable on
     * screen. Coordinates stay out of the key because `translate` below moves the
     * gradient into place.
     */
    const key = `${Math.round(r * 2)}:${Math.round(depthShade * 20)}`;
    let shade = shadeGradientCache.get(key);
    if (!shade) {
      shade = buildDepthShade(ctx, r, depthShade);
      // Keep the cache from growing without bound: the radius × strength
      // combinations are finite, but zoom is continuous, so a long session
      // reaches thousands of entries. On overflow just clear it — these objects
      // are not expensive enough to justify an LRU.
      if (shadeGradientCache.size > SHADE_CACHE_MAX) shadeGradientCache.clear();
      shadeGradientCache.set(key, shade);
    }
    // perf 2026-08-19 — undone by an inverse translate rather than save/restore
    // of the whole state stack. The base transform is a pure DPR scale (tx = 0),
    // so `translate(x, y)` followed by `translate(-x, -y)` restores it exactly,
    // down to the float (0 + d - d = 0). The only other state this block touches
    // is fillStyle, and the next stroke sets its own first anyway.
    ctx.translate(x, y);
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.translate(-x, -y);
  }
  /*
   * Outline — governed by the far-side detail factor (see the `detail`
   * doc-block). In the fill set the outline is a **supplementary stroke** laid
   * over the fill, so on the rear hemisphere it fades continuously by alpha and
   * is then skipped. In the line set (lineOnly) the outline *is* the mark and
   * survives at any depth — on that path the "never make a node vanish"
   * contract rests on this stroke.
   */
  const strokeFade = lineOnly ? 1 : detail;
  // The rim floor outranks the far-side fade (`rimAlphaScale` doc-block): the
  // fade may take a supplementary stroke away, but not the edge that says a node
  // is there. With `rimAlphaScale` at 1 this is `entryAlpha × strokeFade`, the
  // previous expression exactly.
  const rimAlpha = Math.min(1, entryAlpha * Math.max(strokeFade, rimAlphaScale));
  if (Math.abs(rimAlpha - entryAlpha) < 1e-6) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth * lineWidthScale;
    ctx.stroke();
  } else if (rimAlpha > 0.01) {
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = rimAlpha;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth * lineWidthScale;
    ctx.stroke();
    ctx.globalAlpha = prevAlpha;
  }
  if (hasDash) ctx.setLineDash([]);

  // Domain chip-leg pin ticks — circuit-only detail, fades out with altitude
  // (prototype: `s > 6 && farT < 0.9`, alpha `1 - smoothstep(0.55,0.9,farT)`).
  // Far-side detail factor also folds the tick alpha on the rear hemisphere, continuously.
  if (kind === "domain" && egoState !== "dim" && detail > 0.01) {
    const s = r * DOMAIN_HALF_EXTENT_RATIO;
    if (s > DOMAIN_PIN_MIN_HALF_EXTENT && farT < DOMAIN_PIN_MAX_FAR_T) {
      ctx.globalAlpha = entryAlpha * (1 - smoothstep(0.55, 0.9, farT)) * detail;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      for (const t of domainPinTicks(x, y, s)) {
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }
      ctx.globalAlpha = entryAlpha;
    }
  }

  if (kind === "element") {
    const half = r * 0.92;
    if (half > 3 && farT < 0.9) {
      ctx.globalAlpha = entryAlpha * (1 - smoothstep(0.55, 0.9, farT));
      ctx.beginPath();
      ctx.arc(x, y, half * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = tokens.holeFill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = entryAlpha;
    }
  }

  if (hub && egoState !== "dim") {
    strokeKindOutline(ctx, kind, x, y, r + 4, farT, tokens.amberHub, 1.4, 1);
  }

  // W6 agent visibility — the fresh heartbeat's current target gets a static amber
  // hairline ring (owner spec: "Static 1px, r+8", same signal tone as the hub
  // ring/project hexagon amber — never a new color system). Independent of
  // `hub`/`egoState === "center"` — an agent-focused node can simultaneously
  // be a hub or the user's own selection; the rings stack at their own
  // offsets (hub r+4, selection r/r+6, this one r+8) rather than replacing
  // each other.
  if (agentFocus && egoState !== "dim") {
    strokeKindOutline(ctx, kind, x, y, r + AGENT_FOCUS_RING_OFFSET, farT, tokens.amberHub, 1, 1);
  }

  // Spotlight ring for changed nodes — an amberHub **rotating dashed**
  // kind-outline. The r+6 offset is its own slot between hub (r+4) and
  // agentFocus (r+8), so all three stack rather than replace one another.
  // lineDashOffset carries the rotation phase; under reduced-motion the caller
  // pins dashOffset to 0, leaving a static dash. Zero glow.
  if (spotlightRing !== null && egoState !== "dim") {
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -spotlightRing.dashOffset;
    strokeKindOutline(ctx, kind, x, y, r + 6, farT, tokens.recentChange, 1.2, spotlightRing.alpha);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  // Canvas-emphasis slice §A — project hexagon's own decorative identity
  // (design.md: "Amber allowed on hub nodes and Layer 0 containers only" — amber on
  // hub nodes and Layer-0 containers only). The
  // OUTER amber stroke is the body's own `stroke` (set by
  // `topology-frame-draw.ts#resolveNodeVisual` for kind==="project", not
  // here) — this block only adds the inner offset hairline + the 4-direction
  // chassis pin ticks, both fading out toward far field like domain's pins.
  if (kind === "project" && egoState !== "dim") {
    if (r > PROJECT_DECOR_MIN_RADIUS && farT < PROJECT_DECOR_MAX_FAR_T) {
      const decorAlpha = 1 - smoothstep(0.55, 0.9, farT);
      strokeKindOutline(ctx, "project", x, y, r * PROJECT_HAIRLINE_INNER_RATIO, farT, tokens.projectHairlineInner, 1, decorAlpha);
      ctx.globalAlpha = entryAlpha * decorAlpha;
      ctx.strokeStyle = tokens.projectPinTick;
      ctx.lineWidth = 1;
      for (const t of projectPinTicks(x, y, r)) {
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }
      ctx.globalAlpha = entryAlpha;
    }
  }

  // Canvas-emphasis slice §C — hover preview: a static 1px indigo hairline
  // ring, "Can grab this" affordance. `isHovered` is only ever
  // true while no focus is active (`topology-frame-draw.ts` nulls
  // `hoveredNodeId` under focus), so this never collides with the selection
  // ring below — but the `egoState` guards stay as defense in depth.
  if (isHovered && egoState !== "dim" && egoState !== "center") {
    // rank5 — ring alpha rides the body's hover-ripple wake (`emphasisById`,
    // rise τ 0.09) so it fades up with the disc instead of a first-frame hard
    // pop. Omitted emphasis → 1 (pre-rank5 solid ring); reduced-motion snaps
    // emphasis to 1 upstream, so the ring is instantly solid there.
    const ringAlpha = Math.min(1, Math.max(0, hoverEmphasis ?? 1));
    strokeKindOutline(ctx, kind, x, y, r + HOVER_RING_OFFSET, farT, tokens.hoverRing, 1, ringAlpha);
    // The shimmer arc is pure motion layered over the static ring, so
    // reduced-motion users keep the static ring and see none of it. Checked here
    // only — no second branch elsewhere.
    if (!reducedMotion) {
      drawHoverShimmer(
        ctx,
        kind,
        x,
        y,
        r + HOVER_RING_OFFSET,
        farT,
        now,
        tokens.hoverShimmerPeriodMs,
        tokens.hoverShimmerSeg,
        tokens.hoverShimmerColor,
      );
    }
  }

  // #5 — connected-neighbor ring. Every direct neighbor of the selected node
  // gets a single THIN pale-indigo ring on its outline so "what this connects
  // to" is visible as nodes, not only as highlighted edges (owner report: the
  // relation lit up but the node on the other end stayed invisible). Same
  // indigo hue as the center's ring, one value paler and thinner — the
  // charter's value-only selection ladder, never a new blue hue. Sits below
  // the `center` block so a node that is somehow both never double-draws.
  if (egoState === "neighbor") {
    strokeKindOutline(ctx, kind, x, y, r, farT, tokens.neighborRing, 1.25, 1);
  }

  // Canvas-emphasis slice §B — the selected node's STATIC double ring (2px on
  // the outline + a 6px-out 1px hairline), plus its brief one-shot commit
  // pulse (`model/selection-pulse.ts`). The double ring is unconditional
  // while `egoState === "center"` — it never animates itself, so it reads as
  // a fixed "this is selected" fact even after the pulse (if any) finishes.
  if (egoState === "center") {
    strokeKindOutline(ctx, kind, x, y, r, farT, tokens.selectionIndigo, 2, 1);
    strokeKindOutline(ctx, kind, x, y, r + SELECTION_RING_OUTER_OFFSET, farT, tokens.selectionHairline, 1, 1);
    if (selectionPulse) {
      const pulseRadius = (r + SELECTION_PULSE_RING_OFFSET) * selectionPulse.scaleFactor;
      strokeKindOutline(ctx, kind, x, y, pulseRadius, farT, tokens.selectionIndigo, 1.5, selectionPulse.alpha);
    }
  }

  if (countLabel !== null && r > ENGRAVED_COUNT_MIN_RADIUS && egoState !== "dim" && farT < 0.9) {
    // Project's engraved count reads amber, not neutral gray — the same
    // Layer-0-container tint as its body stroke (design.md), so the numeral
    // doesn't look like a leftover from the generic domain/capability treatment.
    const numeralTokens = kind === "project" ? { ...tokens, numeralFace: tokens.amberHub } : tokens;
    drawEngraved(ctx, countLabel, x, y + r * 0.52, Math.max(8, Math.min(11, r * 0.4)), 1 - smoothstep(0.5, 0.9, farT), numeralTokens);
  }
}
