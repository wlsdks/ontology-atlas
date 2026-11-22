/**
 * Node body geometry and paint, pure canvas 2D with no React. Shape by kind: project = hex plate, domain = square
 * chip with pin ticks, capability = circle, element = square pad with a via. Corner rounding grows to the full radius
 * as `farT → 1`, so every polygon converges into a circle (continuous morph, no shape swap).
 * Pure-geometry helpers are unit-tested in `node-shapes.test.ts`; `draw()` is verified by screenshot.
 */
import { smoothstep } from "../model/visibility/altitude";
import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { computeHoverShimmer } from "../model/ambient/hover-shimmer";
import { drawStarEmission } from "@/shared/lib/map-canvas/star-emission";
import {
    bodyPointsScratch,
    DOMAIN_HALF_EXTENT_RATIO,
    domainPinTicks,
    FULL_CIRCLE_FAR_T,
    interpolateCornerRadius,
    minCornerRadius,
    projectPinTicks,
    roundedPolygonPath,
    type NodeKind,
} from "./node-shapes/silhouette";

/**
 * How far outside the disc the recent-changes ring is drawn; the label placer reserves it too
 * (`ui/frame-draw/nodes/paint-nodes.ts`), so a name is not laid across a neighbour's ring.
 */
export const SPOTLIGHT_RING_OFFSET = 6;

/** Light-source offset of the depth shading as a multiple of the radius, up and to the left (the "light from above, slightly left" prior). */
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
    -r * NODE_DEPTH_SHADE_LIGHT_OFFSET,
    -r * NODE_DEPTH_SHADE_LIGHT_OFFSET,
    r * 0.05,
    0,
    0,
    r * 1.25);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(0.55, `rgba(0, 0, 0, ${(NODE_DEPTH_SHADE_MAX_ALPHA * strength * 0.35).toFixed(3)})`);
    shade.addColorStop(1, `rgba(0, 0, 0, ${(NODE_DEPTH_SHADE_MAX_ALPHA * strength).toFixed(3)})`);
    return shade;
}
export interface NodeShapeDrawState {
    kind: NodeKind;
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
    /** Top stop of the vertical sheen gradient, resolved by the caller from the `--map-node-sheen-*` tokens so this module stays token-free; the bottom stop is `fill`. */
    sheenTop: string;
    /** Engraved node-count numeral, or null to skip (project and domain only). */
    countLabel: string | null;
    /** The hovered node (no focus active; `paint-nodes.ts` nulls it under focus): draws a static 1px indigo hairline ring, never for the `"center"` node. */
    isHovered: boolean;
    /**
     * The hovered node's hover-ripple emphasis (0..1, the `emphasisById` scalar the body wake rides): it multiplies the
     * hover ring's alpha so the ring rises on the wake curve instead of popping. Read only while `isHovered`; defaults to 1.
     */
    hoverEmphasis?: number;
    /**
     * One-shot commit pulse for the just-selected (`egoState === "center"`) node, or null outside its brief window
     * (`model/ambient/selection-pulse.ts#computeSelectionPulse`). Never loops.
     */
    selectionPulse: {
        scaleFactor: number;
        alpha: number;
    } | null;
    /**
     * True for the one node matching the agent heartbeat's `focus.ontologySlug` while that heartbeat is fresh: a static
     * amber hairline ring in the `amberHub` tone, never a glow. Real heartbeat data only.
     */
    agentFocus: boolean;
    /**
     * Spotlight ring for nodes changed inside the lens window: a rotating dashed amber outline, no glow.
     * `alpha` is the lens fade, `dashOffset` the rotation phase in px (0 under reduced motion).
     * null hides it.
     */
    spotlightRing: {
        alpha: number;
        dashOffset: number;
    } | null;
    /** Frame timestamp for the hover shimmer, passed in because this layer knows nothing of time; the static hover ring is drawn regardless, the shimmer arc only when `!reducedMotion`. */
    now: number;
    reducedMotion: boolean;
    /** `"fill"` (default) is the kind fill plus sheen gradient, `"line"` an unfilled dark body with a thinner outline; render style only, shared with the DOM `OntologyMapKindGlyph` through `canvas-appearance-preferences`. */
    glyphStyle?: "fill" | "line";
    /**
     * 3D depth shading strength, 0..1; at 0 (default) no extra stroke is issued. One luminance gradient lit from
     * above-left makes a disc read as a sphere (Sun & Perona 1998). Only the dark side darkens, never a highlight:
     * a rim light would be glow.
     */
    depthShade?: number;
    /**
     * 3D far-side detail factor, 0..1 (`model/dome-view/ink.ts#domeDetailFactor`); 1 (default) changes nothing. It folds
     * to 0 on the rear hemisphere and only supplementary strokes recede (the fill-set outline, domain pin ticks), smoothly (C¹).
     */
    detail?: number;
    /**
     * 3D view: floor for the rim against depth fog, at least 1. The caller passes
     * `max(1, DOME_RIM_FOG_FLOOR / fog)`; the outline is drawn at that share of its unfogged alpha,
     * overriding the far-side detail fade, so a node always keeps a visible edge.
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
    /** Inner offset hairline of the project hexagon's double hairline; the outer stroke is the body's own `stroke` (`node-visual.ts#resolveNodeVisual`). */
    projectHairlineInner: string;
    /** The project hexagon's 4-direction pin ticks. */
    projectPinTick: string;
    /** The static 2px selection ring's colour (`tokens.indigoBright`). */
    selectionIndigo: string;
    /** The outer 6px hairline ring's colour, a lower-alpha indigo. */
    selectionHairline: string;
    /** Thin pale-indigo ring on every 1-hop neighbour of the selection: the selection ring's hue, told apart by value only (`--map-edge-selected`). */
    neighborRing: string;
    /** The static 1px indigo hover hairline, distinct from the brighter selection ring. */
    hoverRing: string;
    /** Hover shimmer arc length, as a fraction of the perimeter (`--map-hover-shimmer-seg`). */
    hoverShimmerSeg: number;
    /** Hover shimmer period for one full revolution, ms (`--map-hover-shimmer-period-ms`). */
    hoverShimmerPeriodMs: number;
    /** Hover shimmer arc colour — reuses `--map-indigo-bright`; no new hue. */
    hoverShimmerColor: string;
}
/** Above this farT (or below `SHEEN_MIN_RADIUS`) the body fills flat so far points read luminous, not machined. */
const SHEEN_MAX_FAR_T = 0.98;
const SHEEN_MIN_RADIUS = 3;
/**
 * The engraved node-count numeral shows only above this screen radius: 13 keeps the domain chip's count visible at
 * the overview (~14.7 px) with margin over the ±4% breathe trough, and hides counts once nodes shrink far out.
 */
const ENGRAVED_COUNT_MIN_RADIUS = 13;
/** Domain chip-leg pin ticks: offsets `[-0.45, 0.45]`, leg length `s * 0.34`, drawn only for `s > 6 && farT < 0.9`. */
const DOMAIN_PIN_MIN_HALF_EXTENT = 6;
const DOMAIN_PIN_MAX_FAR_T = 0.9;
/** The project hexagon's decor (inner hairline, pin ticks) fades toward far field, like the domain pin ticks. */
const PROJECT_DECOR_MIN_RADIUS = 8;
const PROJECT_DECOR_MAX_FAR_T = 0.9;
/** Inner hairline inset as a fraction of the outer body radius (double hex, circumradii 41 and 31). */
const PROJECT_HAIRLINE_INNER_RATIO = 0.75;
/** The inner selection ring sits on the body outline, the outer hairline this far beyond it (px). */
const SELECTION_RING_OUTER_OFFSET = 6;
/** The commit-pulse ring sits between the two static rings so its expansion reads as coming from the node. */
const SELECTION_PULSE_RING_OFFSET = 3;
/** The hover ring sits just outside the body, inside the selection ring's radius (hover never fires under focus). */
const HOVER_RING_OFFSET = 3;
/** Agent-focus ring offset, wider than the hub ring's r+4 so the two never merge on a focused hub. */
export const AGENT_FOCUS_RING_OFFSET = 8;
/** A vertical `sheenTop → fill` gradient when the node is big and near enough (`r > 3 && farT < 0.98`), otherwise the flat `fill`. */
function resolveBodyFill(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, farT: number, fill: string, sheenTop: string): string | CanvasGradient {
    if (r <= SHEEN_MIN_RADIUS || farT >= SHEEN_MAX_FAR_T)
        return fill;
    // With sheenTop equal to fill both stops match: return the flat fill rather than build the gradient.
    if (sheenTop === fill)
        return fill;
    const grad = ctx.createLinearGradient(x, y - r, x, y + r);
    grad.addColorStop(0, sheenTop);
    grad.addColorStop(1, fill);
    return grad;
}
/** A 1px dark shadow beneath a lighter face, reading as an inset numeral. */
function drawEngraved(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, alpha: number, tokens: NodeShapeTokens): void {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${FONT_WEIGHT.strong} ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    // Multiplies into the frame's alpha: the caller already folded tier, dim and appear ramp into
    // `ctx.globalAlpha`.
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = previousAlpha * alpha;
    ctx.fillStyle = tokens.numeralShadow;
    ctx.fillText(text, x, y + 1);
    ctx.fillStyle = tokens.numeralFace;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = previousAlpha;
}
/**
 * The walked path's star: the node, emitting. Composites with `lighter` so light adds on a dark
 * canvas; the face is never filled so the numeral stays readable (the bloom is an annulus).
 */
export function drawNodeStar(ctx: CanvasRenderingContext2D, kind: NodeShapeDrawState["kind"], x: number, y: number, radius: number, farT: number, ink: string, lit: number, swell = 1,
/** How much of the interior burns — 0 for a lit node, 1 for a star. See `StarEmissionState`. */
core = 0): void {
    // The map contributes only the silhouette; the light is `shared/lib/map-canvas/star-emission.ts`, shared with the settings preview.
    drawStarEmission(ctx, {
        x,
        y,
        radius,
        ink,
        lit,
        swell,
        core,
        // A `Path2D` rather than a draw call, so the emitter can both stroke the silhouette and
        // subtract it from a clip region without tracing it twice or knowing what shape it is.
        bodyPath: (r) => {
            const path = new Path2D();
            const points = bodyPointsScratch(kind, x, y, r);
            if (points === null || farT > FULL_CIRCLE_FAR_T)
                path.arc(x, y, r, 0, Math.PI * 2);
            else
                roundedPolygonPath(path, points, interpolateCornerRadius(minCornerRadius(kind, r), r, farT));
            return path;
        },
    });
}
/**
 * Strokes one ring at `radius` along the node's own kind shape (converging to a circle past `FULL_CIRCLE_FAR_T`), a
 * material ring, never a glow. The hub ring, project double hairline, selection rings, commit pulse and hover ring use it.
 */
function strokeKindOutline(ctx: CanvasRenderingContext2D, kind: NodeShapeDrawState["kind"], x: number, y: number, radius: number, farT: number, color: string, lineWidth: number, alpha: number): void {
    if (alpha <= 0.01 || radius <= 0)
        return;
    const points = bodyPointsScratch(kind, x, y, radius);
    if (points === null || farT > FULL_CIRCLE_FAR_T) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    else {
        ctx.beginPath();
        roundedPolygonPath(ctx, points, interpolateCornerRadius(minCornerRadius(kind, radius), radius, farT));
    }
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = previousAlpha * alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.globalAlpha = previousAlpha;
}
/** Approximate perimeter (straight-edge sum of `bodyPoints`, or the circle circumference past `FULL_CIRCLE_FAR_T`); it only sizes the hover-shimmer dash pattern. */
function outlinePerimeter(kind: NodeShapeDrawState["kind"], radius: number, farT: number): number {
    const points = bodyPointsScratch(kind, 0, 0, radius);
    if (points === null || farT > FULL_CIRCLE_FAR_T)
        return 2 * Math.PI * radius;
    let perimeter = 0;
    for (let i = 0; i < points.length; i += 1) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        perimeter += Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }
    return perimeter;
}
/**
 * One slow travelling arc over the static hover ring: the same shape path, revealed in part through
 * `setLineDash`/`lineDashOffset`, no glow. A zero segment length draws nothing.
 */
function drawHoverShimmer(ctx: CanvasRenderingContext2D, kind: NodeShapeDrawState["kind"], x: number, y: number, radius: number, farT: number, now: number, periodMs: number, segRatio: number, color: string): void {
    const perimeter = outlinePerimeter(kind, radius, farT);
    const { dash, offset } = computeHoverShimmer(now, periodMs, perimeter, segRatio);
    if (dash[0] <= 0)
        return;
    const points = bodyPointsScratch(kind, x, y, radius);
    if (points === null || farT > FULL_CIRCLE_FAR_T) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    else {
        ctx.beginPath();
        roundedPolygonPath(ctx, points, interpolateCornerRadius(minCornerRadius(kind, radius), radius, farT));
    }
    ctx.setLineDash([...dash]);
    ctx.lineDashOffset = offset;
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = previousAlpha * 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.globalAlpha = previousAlpha;
}
/** Draws one node body: fill, stroke, dash, shape morph, rings and the engraved numeral. Not the diffraction spike (`starfield.ts#drawDiffractionSpike`) or the label (`labels.ts`). */
export function draw(ctx: CanvasRenderingContext2D, state: NodeShapeDrawState, tokens: NodeShapeTokens): void {
    // Every sub-stroke multiplies into the frame's alpha and restores it; none replaces it.
    const entryAlpha = ctx.globalAlpha;
    const { kind, screenX: x, screenY: y, screenRadius: r, farT, egoState, fill, stroke, lineWidth, dash, hub, sheenTop, countLabel, isHovered, hoverEmphasis, selectionPulse, agentFocus, spotlightRing, now, reducedMotion, glyphStyle, depthShade = 0, detail = 1, rimAlphaScale = 1, } = state;
    const { lineOnly, lineWidthScale } = glyphStyleDescriptor(glyphStyle);
    // Every painter restores the dash to [], so dash state on entry is empty; only dashed nodes make
    // the native calls.
    const hasDash = dash.length > 0;
    if (hasDash)
        ctx.setLineDash([...dash]);
    const points = bodyPointsScratch(kind, x, y, r);
    if (points === null || farT > FULL_CIRCLE_FAR_T) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    else {
        ctx.beginPath();
        roundedPolygonPath(ctx, points, interpolateCornerRadius(minCornerRadius(kind, r), r, farT));
    }
    // The line set fills a flat dark body (edges behind do not show) with no sheen; the fill set takes the kind fill plus sheen.
    ctx.fillStyle = lineOnly ? tokens.holeFill : resolveBodyFill(ctx, x, y, r, farT, fill, sheenTop);
    ctx.fill();
    /* Depth shading re-fills the path just filled (canvas `fill` does not clear it), so the silhouette cannot drift; skipped below the minimum radius, where it reads as noise. */
    if (depthShade > 0.01 && r >= NODE_DEPTH_SHADE_MIN_RADIUS_PX) {
        /*
         * Cached by rounded radius and strength, which fix the gradient's shape; `translate` moves it into place.
         * Fresh gradients per node in 3D (125 nodes at 120 Hz) cost a GC stutter.
         */
        const key = `${Math.round(r * 2)}:${Math.round(depthShade * 20)}`;
        let shade = shadeGradientCache.get(key);
        if (!shade) {
            shade = buildDepthShade(ctx, r, depthShade);
            // Zoom is continuous, so radius × strength reaches thousands of entries in a long session; clearing on overflow is cheaper than an LRU.
            if (shadeGradientCache.size > SHADE_CACHE_MAX)
                shadeGradientCache.clear();
            shadeGradientCache.set(key, shade);
        }
        // Undone by an inverse translate instead of save/restore: the base transform is a pure DPR scale,
        // so translate(x, y) then translate(-x, -y) restores it exactly.
        ctx.translate(x, y);
        ctx.fillStyle = shade;
        ctx.fill();
        ctx.translate(-x, -y);
    }
    /* The outline is a supplementary stroke in the fill set (fades by far-side detail, then skipped); in the line set it is the mark and survives at any depth. */
    const strokeFade = lineOnly ? 1 : detail;
    // The rim floor outranks the far-side fade: a node always keeps the edge that says it is there.
    const rimAlpha = Math.min(1, entryAlpha * Math.max(strokeFade, rimAlphaScale));
    if (Math.abs(rimAlpha - entryAlpha) < 1e-6) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth * lineWidthScale;
        ctx.stroke();
    }
    else if (rimAlpha > 0.01) {
        const previousAlpha = ctx.globalAlpha;
        ctx.globalAlpha = rimAlpha;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth * lineWidthScale;
        ctx.stroke();
        ctx.globalAlpha = previousAlpha;
    }
    if (hasDash)
        ctx.setLineDash([]);
    // Domain pin ticks are circuit-only detail (alpha `1 - smoothstep(0.55, 0.9, farT)`), also folded by the far-side detail factor.
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
    // Agent-focus ring at r+8 stacks with the hub (r+4) and selection rings instead of replacing them.
    if (agentFocus && egoState !== "dim") {
        strokeKindOutline(ctx, kind, x, y, r + AGENT_FOCUS_RING_OFFSET, farT, tokens.amberHub, 1, 1);
    }
    // Spotlight ring sits at r+6, between hub (r+4) and agentFocus (r+8), so all three stack.
    // Under reduced motion the caller pins `dashOffset` to 0 for a static dash.
    if (spotlightRing !== null && egoState !== "dim") {
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -spotlightRing.dashOffset;
        strokeKindOutline(ctx, kind, x, y, r + SPOTLIGHT_RING_OFFSET, farT, tokens.recentChange, 1.2, spotlightRing.alpha);
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
    }
    // The project hexagon's own decor: the outer amber stroke is the body's `stroke` (`resolveNodeVisual`); this adds the inner hairline and pin ticks, fading toward far field like the domain's.
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
    // Hover preview: `isHovered` is only true with no focus, so it never collides with the selection ring; the `egoState` guards are defence in depth.
    if (isHovered && egoState !== "dim" && egoState !== "center") {
        // The ring alpha rides the body's hover-ripple wake so it fades up with the disc; omitted emphasis is 1 and reduced motion snaps to 1 upstream.
        const ringAlpha = Math.min(1, Math.max(0, hoverEmphasis ?? 1));
        strokeKindOutline(ctx, kind, x, y, r + HOVER_RING_OFFSET, farT, tokens.hoverRing, 1, ringAlpha);
        // The shimmer arc is pure motion over the static ring, so reduced motion keeps the ring and drops the arc; checked only here.
        if (!reducedMotion) {
            drawHoverShimmer(ctx, kind, x, y, r + HOVER_RING_OFFSET, farT, now, tokens.hoverShimmerPeriodMs, tokens.hoverShimmerSeg, tokens.hoverShimmerColor);
        }
    }
    // Connected-neighbor ring: a thin pale-indigo outline on every direct neighbor of the selection,
    // one value paler than the center ring.
    if (egoState === "neighbor") {
        strokeKindOutline(ctx, kind, x, y, r, farT, tokens.neighborRing, 1.25, 1);
    }
    // The selected node's static double ring is unconditional while `egoState === "center"`, so it reads as a fixed fact after the commit pulse finishes.
    if (egoState === "center") {
        strokeKindOutline(ctx, kind, x, y, r, farT, tokens.selectionIndigo, 2, 1);
        strokeKindOutline(ctx, kind, x, y, r + SELECTION_RING_OUTER_OFFSET, farT, tokens.selectionHairline, 1, 1);
        if (selectionPulse) {
            const pulseRadius = (r + SELECTION_PULSE_RING_OFFSET) * selectionPulse.scaleFactor;
            strokeKindOutline(ctx, kind, x, y, pulseRadius, farT, tokens.selectionIndigo, 1.5, selectionPulse.alpha);
        }
    }
    if (countLabel !== null && r > ENGRAVED_COUNT_MIN_RADIUS && egoState !== "dim" && farT < 0.9) {
        // The project's count reads amber like its body stroke, not neutral gray.
        const numeralTokens = kind === "project" ? { ...tokens, numeralFace: tokens.amberHub } : tokens;
        drawEngraved(ctx, countLabel, x, y + r * 0.52, Math.max(8, Math.min(11, r * 0.4)), 1 - smoothstep(0.5, 0.9, farT), numeralTokens);
    }
}
