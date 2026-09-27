/**
 * Camera-coupled parallax for the constellation background. The starfield is a far
 * layer, so it moves less than the ground; the blueprint grid is ground and stays at
 * factor 1. The origin depends only on the camera, so a still camera means a still
 * background: no idle-frame cost and no time-driven motion.
 */

/**
 * Applied about the viewport centre, where the camera looks, so the layers agree there;
 * about the top-left they would be misaligned at rest. `k` 1 welds to the world, 0 to
 * the screen.
 */
export function backgroundParallaxOrigin(
  origin: { x: number; y: number },
  viewport: { width: number; height: number },
  k: number,
): { x: number; y: number } {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const f = Number.isFinite(k) ? k : 1;
  return {
    x: cx + (origin.x - cx) * f,
    y: cy + (origin.y - cy) * f,
  };
}

/**
 * Reduced motion is 1, not 0: relative motion between layers is the vestibular trigger,
 * and 0 would weld the background to the screen and create it. Depth dots carry
 * per-layer factors (`render/grid.ts` `DEPTH_DOT_LAYERS`), computed by the frame draw.
 */
export function resolveBackgroundOrigin(
  gridOrigin: { x: number; y: number },
  viewport: { width: number; height: number },
  variant: string | undefined,
  token: number,
  reducedMotion: boolean,
): { x: number; y: number } {
  return backgroundParallaxOrigin(
    gridOrigin,
    viewport,
    resolveBackgroundParallax(variant, token, reducedMotion),
  );
}

export function resolveBackgroundParallax(
  variant: string | undefined,
  token: number,
  reducedMotion: boolean,
): number {
  if (variant !== "web") return 1;
  if (reducedMotion) return 1;
  if (!Number.isFinite(token)) return 1;
  // Above 1 the background outruns the content and reads as a near layer; negative
  // flows backwards and causes motion sickness.
  return Math.min(1, Math.max(0, token));
}
