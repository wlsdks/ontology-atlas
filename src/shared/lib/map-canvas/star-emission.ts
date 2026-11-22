/**
 * Painting half of the walked-path mark, with nothing that knows about the map (no node kinds,
 * camera, tokens or clock); the canvas and the settings preview share it. Light on a dark canvas
 * must add, so it composites with `lighter`. There is no diffraction cross.
 */
const STAR_RIM_PX = 1.8;

/** A band hides an alpha step about its own width in px; six bands showed rings on a 33 px node. */
const STAR_GLOW_LAYERS = 20;

function falloff(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return STAR_GLOW_PEAK * u * u;
}

/** The rim stroke adds on top: this is the light around the edge, not the edge. */
const STAR_GLOW_PEAK = 0.55;

/** In node radii; a wider bloom reads as fog touching the neighbours, not a point of light. */
const STAR_GLOW_REACH = 2.0;




export interface StarEmissionState {
  x: number;
  y: number;
  radius: number;
  /** `#rrggbb`. Star ink for a walked node; the selection's indigo for the one you stand on. */
  ink: string;
  lit: number;
  swell?: number;

  core?: number;
  /**
   * A callback because the map and the settings preview draw different silhouettes; a `Path2D`
   * because the halo both strokes the outline and cuts it out of its own clip.
   */
  bodyPath: (radius: number) => Path2D;
}


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
     * The light is layered strokes of the node's own outline, not a radial gradient: distance from the
     * centre is not distance from the silhouette, so a gradient or a round hole leaves gaps along a
     * rounded square's sides. The interior is clipped away first so the face is never washed.
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
    /* Falls off toward the rim so the core reads as light, not the near view's filled node dot. */
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
