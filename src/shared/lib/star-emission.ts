/**
 * **A node, emitting — the walked path's star.**
 *
 * The painting half of the walked-path mark, with nothing in it that knows about the map: no
 * node kinds, no camera, no tokens, no clock. The caller hands it a silhouette to trace and a
 * level to burn at, so the same function draws a walked concept on the topology canvas and the
 * same concept in the settings preview.
 *
 * ⚠️ **It lives in `shared/` because the preview was drawing a different mark from the map.**
 * The settings panel painted the star *glyph* — a small four-point sparkle set beside a dark
 * node, and a row of them strung along the relation — while the map lit the node itself. Its
 * own caption described the map's behaviour correctly, so the words and the picture on that
 * panel disagreed, and the picture showed the notation the owner had already rejected: *"that
 * isn't the kind of star I meant — I mean the node's own border lighting up"* (2026-09-10).
 * The tone table was unified for exactly this reason earlier the same day and the painting was
 * left behind; one function is the rest of that repair.
 *
 * ⚠️ Two builds got the mark itself wrong before it worked, and both were the same mistake in
 * different clothes — painting a *mark* instead of making the node *bright*. A glyph beside the
 * node is the footprint notation in another shape. A pale outline stroke earned the verdict
 * *"it's just dark grey"*, and it was, because paint on a dark canvas is paint. Light on a dark
 * canvas has to **add**, which is why this composites with `lighter`.
 *
 * ## Why there is no cross on it
 *
 * There was one — `drawDiffractionSpike`'s four arms, the signature every bright node on this
 * canvas wears — and it went in two steps. design-infoviz measured that a walked star and a
 * magnitude spike wore the same primitive within one frame, separated only by hue at 1.68:1,
 * and offered two repairs: separate them by form, or drop the cross and let the lit rim and the
 * ordinal carry it. Form was tried first — turned 45 degrees and clamped clear of the label
 * ring — and rendered as an **X drawn across the node** rather than as light coming off it. A
 * diffraction spike belongs on a *point* of light; one centred on a 15-33 px silhouette crosses
 * the very thing it is meant to decorate. The second repair is also the smaller one: it removes
 * the semantic overlap instead of mitigating it. Nothing was lost with it — the cross said
 * "this is the end of the walk", and the end of the walk is the stop you are standing on,
 * already lit in the selection's own indigo and already numbered beside it.
 */
/** The rim's width on a node large enough to want one, in px. */
const STAR_RIM_PX = 1.8;

/**
 * How many strokes build the halo.
 *
 * ⚠️ Six was chosen by arithmetic and measured wrong: on a 33 px node each band is 5.5 px wide
 * and the innermost step drops 0.17 of alpha at once, so the star wore six visible concentric
 * rings. The step a band can hide behind is roughly its own width in pixels — at 20 the largest
 * step is 0.05 over ~1.6 px, and the falloff reads as light rather than as contour lines.
 */
const STAR_GLOW_LAYERS = 20;

/** Accumulated light at `t` of the way out from the silhouette, 0 at full reach. */
function falloff(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return STAR_GLOW_PEAK * u * u;
}

/**
 * How bright the halo is where it meets the silhouette.
 *
 * The rim stroke sits on top of this, so the two add: this is the light *around* the edge, not
 * the edge itself.
 */
const STAR_GLOW_PEAK = 0.55;

/**
 * How far the star's bloom reaches, in node radii.
 *
 * ⚠️ 3.2 with a gentle falloff measured as **fog** rather than as a star — a soft blob wide
 * enough to touch its neighbours, with the diffraction cross drowned inside it. A star is a
 * point of light: bright and tight at the core, gone quickly.
 */
const STAR_GLOW_REACH = 2.0;




export interface StarEmissionState {
  x: number;
  y: number;
  /** The node's own screen radius. Everything else is a multiple of it. */
  radius: number;
  /** `#rrggbb`. Star ink for a walked node; the selection's indigo for the one you stand on. */
  ink: string;
  /** 0–1. Below 0.01 nothing is painted. */
  lit: number;
  /**
   * Multiplier on the bloom's reach while the star is igniting.
   *
   * A star arriving has a size, not only a brightness — the light swells out and settles back.
   * It returns to 1 once the ignition is over, so a settled constellation is dimensionally
   * still and nothing on the canvas keeps breathing.
   */
  swell?: number;

  core?: number;
  /**
   * The node's silhouette at `radius`, as a path this function can both stroke and subtract.
   *
   * A callback rather than a kind, because the two callers disagree about what a node looks
   * like and neither is wrong: the map has hexagons, squares and circles that converge with
   * altitude; the settings preview has one rounded rectangle standing for all of them. What
   * they must agree on is the *light*, which is what this file owns.
   *
   * It returns a `Path2D` rather than drawing, because the halo needs the same outline twice —
   * once to stroke and once to cut out of its own clip — and a shape that draws itself can only
   * be used once.
   */
  bodyPath: (radius: number) => Path2D;
}


/** `#rrggbb` → `rgba(...)`, which a gradient stop takes where a `var()` cannot. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}
export function drawStarEmission(ctx: CanvasRenderingContext2D, state: StarEmissionState): void {
    const { x, y, radius, ink, lit, bodyPath } = state;
    const core = state.core ?? 0;
    if (lit <= 0.01 || radius <= 0)
        return;
    const k = Math.min(1, lit);
    const swell = state.swell ?? 1;
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = "lighter";
    /*
     * The light it throws, laid down as layered strokes **of the node's own outline** rather
     * than as a radial gradient.
     *
     * ⚠️ **A round hole under a square node reads as a black coin, not as a star.** The first
     * build cut the bloom with `ctx.arc(x, y, inner)` while the node is a rounded square: the
     * circle passes just outside the flat edges but well inside the corners, so along each side
     * a crescent of unlit canvas showed *between* the node and where its light began, and only
     * the corners had light touching them. The owner saw it immediately — "something about this
     * is awkward" (2026-09-10). A radial gradient has the same flaw even with the hole fixed:
     * distance from the centre is not distance from the silhouette, so a square's corners (at
     * 1.41r) would sit far down the ramp while its edge midpoints (at 1.0r) sat at the top, and
     * the rim would be bright on four sides and dim on four corners.
     *
     * Stroking the silhouette itself, wide and dim first, narrow and bright last, makes the
     * falloff a function of distance *from the shape* — which is what a halo is. The interior is
     * clipped away first, so the inward half of every wide stroke is discarded and the face is
     * never washed; that is now enforced by geometry rather than by a gradient stop.
     */
    const spread = radius * (STAR_GLOW_REACH - 1) * swell;
    const body = bodyPath(radius);
    ctx.save();
    // Clip to "everything except this node's body". Even-odd rather than winding, because the
    // silhouette comes from the caller and its direction is not this function's to know.
    const outside = new Path2D();
    const bound = radius + spread * 2;
    outside.rect(x - bound, y - bound, bound * 2, bound * 2);
    outside.addPath(body);
    ctx.clip(outside, "evenodd");
    ctx.strokeStyle = ink;
    for (let layer = 1; layer <= STAR_GLOW_LAYERS; layer += 1) {
        const outer = layer / STAR_GLOW_LAYERS;
        // Each band contributes the difference of the falloff across it, so the layers sum to
        // `STAR_GLOW_PEAK` at the silhouette and to nothing at full reach.
        const band = falloff((layer - 1) / STAR_GLOW_LAYERS) - falloff(outer);
        if (band <= 0.001)
            continue;
        ctx.globalAlpha = k * band;
        // Centred on the outline, so half of it lies outside; the clipped half is the inward one.
        ctx.lineWidth = spread * outer * 2;
        ctx.stroke(body);
    }
    ctx.restore();
    /*
     * The core. Brightest at the centre and falling toward the rim, so it reads as a point of
     * light rather than as a filled disc — a disc is a dot, and a dot is what the map draws when
     * it means "a node is here", which is the near view's job and not this one's.
     */
    if (core > 0.01) {
        const heart = ctx.createRadialGradient(x, y, 0, x, y, radius);
        heart.addColorStop(0, withAlpha(ink, 0.95 * k * core));
        heart.addColorStop(0.45, withAlpha(ink, 0.5 * k * core));
        heart.addColorStop(1, withAlpha(ink, 0.2 * k * core));
        ctx.globalAlpha = 1;
        ctx.fillStyle = heart;
        ctx.fill(body);
    }

    ctx.globalAlpha = k * (1 - core * 0.4);
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.min(STAR_RIM_PX, Math.max(0.5, radius * 0.22)) * (1 - core * 0.5);
    ctx.stroke(body);
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prevAlpha;
}
