import { backgroundParallaxOrigin } from "../../model/background-parallax";
import { DEPTH_DOT_LAYERS, draw as gridDraw } from "../../render/grid";
import { drawRealmStars, drawStarDust } from "../../render/starfield";
import { worldToScreen } from "../topology-camera-math";
import { type FrameScope } from "./frame-scope";

export function paintBackdrop(F: FrameScope): void {
  const { viewportWidth, viewportHeight, farT, domeRamp, backgroundVariant, gridPattern,
    paintAnimatedBackground, depthDotPatterns, reducedMotion, tokens, dustPoints, realmDustParallax,
    wardingRing, realmStarPoints, camera, ctx, gridOrigin, bgOrigin } = F;
  gridDraw(ctx, {
    viewportWidth,
    viewportHeight,
    farT: Math.max(farT, domeRamp, 0),
    variant: backgroundVariant,
    gridPattern,
    paintAnimated: domeRamp > 0.001 ? null : paintAnimatedBackground,
    depthLayersAlpha: 1 - domeRamp,
    depthLayers: depthDotPatterns && domeRamp < 0.999
      ? DEPTH_DOT_LAYERS.map((layer, i) => {
        // Parallax comes from gridOrigin, not the already-parallaxed bgOrigin; doubling it collapses the layers.
        const o = backgroundParallaxOrigin(gridOrigin, { width: viewportWidth, height: viewportHeight }, reducedMotion ? 1 : layer.parallax);
        return { pattern: depthDotPatterns[i] ?? null, originX: o.x, originY: o.y, spacing: layer.spacing };
      })
      : undefined,
    originX: bgOrigin.x,
    originY: bgOrigin.y,
  }, {
    canvasBgNear: tokens.canvasBgNear,
    canvasBgFar: tokens.canvasBgFar,
    vignetteBaseAlpha: tokens.vignetteBaseAlpha,
    vignetteFarAlpha: tokens.vignetteFarAlpha,
  });
  drawStarDust(ctx, {
    points: dustPoints,
    farT: Math.max(farT, 0),
    // The caller already scaled ctx by the device pixel ratio.
    devicePixelRatio: 1,
    opacityScale: 1,
    originX: reducedMotion ? 0 : gridOrigin.x,
    originY: reducedMotion ? 0 : gridOrigin.y,
    radialParallax: reducedMotion ? 0 : realmDustParallax,
  });
  if (wardingRing !== null && realmStarPoints !== null && realmStarPoints.length > 0) {
    const wc = worldToScreen(camera, viewportWidth, viewportHeight, wardingRing.centerX, wardingRing.centerY);
    drawRealmStars(ctx, {
      points: realmStarPoints,
      originX: gridOrigin.x,
      originY: gridOrigin.y,
      clip: { cx: wc.x, cy: wc.y, radius: wardingRing.radius * camera.scale.value },
      devicePixelRatio: 1,
      radialParallax: realmDustParallax,
      reducedMotion,
    });
  }
}
