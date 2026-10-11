/**
 * **The four-point diffraction spike** — the cross a bright point of light wears.
 *
 * Pulled out of `widgets/ontology-map/render/starfield.ts` so the walked-path star
 * (`shared/lib/map-canvas/star-emission.ts`) can wear it in the settings preview as well as on the map.
 * Solid tapering slivers, no gradient, blur or glow: the shape is the signature.
 */

export interface DiffractionSpikeDrawState {
  screenX: number;
  screenY: number;
  /** Node's own screen-space draw radius — spike arm lengths scale off this (`r*2.6`/`r*1.5`). */
  screenRadius: number;
  color: string;
  /** farT-gated — spike is invisible at farT<=0.02, fully present by farT=1 (prototype: `alpha = farT`). */
  alpha: number;
  /**
   * Arm rotation in radians, default 0 (upright cross). Rotating one set of arms separates a walked
   * star from a magnitude spike by form, which holds for colour-vision deficiency where hue does not.
   */
  rotation?: number;
  /**
   * Ceiling on the long arm, in screen px. Default: none. A long arm on a small node outshines its own
   * domain label's row; the walked star clamps, the far-field starfield does not.
   */
  maxLong?: number;
}

/** Draws one crisp 4-point diffraction spike — solid tapering slivers, no gradient/blur/glow. */
export function drawDiffractionSpike(ctx: CanvasRenderingContext2D, state: DiffractionSpikeDrawState): void {
  if (state.alpha <= 0.01) return;
  const { screenX: cx0, screenY: cy0, screenRadius: r, color, alpha, rotation, maxLong } = state;
  const long = maxLong === undefined ? r * 2.6 : Math.min(r * 2.6, maxLong);
  // The short arms keep their proportion to the long ones, so a clamped cross is the same
  // star drawn smaller rather than a differently shaped one.
  const short = long * (1.5 / 2.6);
  const baseW = Math.max(0.6, r * 0.09);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  // Rotation is applied to the canvas, not to eight hand-computed points, so the two arm
  // pairs cannot drift out of square.
  let cx = cx0;
  let cy = cy0;
  if (rotation !== undefined && rotation !== 0) {
    ctx.translate(cx0, cy0);
    ctx.rotate(rotation);
    cx = 0;
    cy = 0;
  }

  ctx.beginPath();
  ctx.moveTo(cx, cy - long);
  ctx.lineTo(cx + baseW, cy);
  ctx.lineTo(cx, cy + long);
  ctx.lineTo(cx - baseW, cy);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - short, cy);
  ctx.lineTo(cx, cy - baseW);
  ctx.lineTo(cx + short, cy);
  ctx.lineTo(cx, cy + baseW);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
