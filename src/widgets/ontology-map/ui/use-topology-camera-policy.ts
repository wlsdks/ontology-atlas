"use client";

import {
  useCallback,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import {
  measureCanvasInsets
} from "../interaction/free-area";
import { cameraTransitionDurationMs, type CameraKeyframe, type CameraTween } from "../model/camera-easing";
import {
  DOME_NODE_FIT_ALLOWANCE_PX,
  domeWorldBounds,
  type DomeModel
} from "../model/dome-view";
import {
  TIER_LEGEND_RAIL_COLUMN_PX,
  tierLegendPlacement
} from "../model/tier-legend-rows";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { computeDomeFitCameraTarget } from "./topology-camera-math";

const TIER_LEGEND_RESERVE_PX = TIER_LEGEND_RAIL_COLUMN_PX;

interface Dependencies {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  panelInsetsRef: RefObject<{ left: number; right: number; } | null>;
  domeFitInsetsRef: RefObject<{ left: number; right: number; } | null>;
  reducedMotionRef: RefObject<boolean>;
  cameraTweenRef: RefObject<CameraTween | null>;
  cameraRef: RefObject<CameraAxes>;
}

/** Camera inset, dome fitting, and tween policy shared by frame and navigation owners. */
export function useTopologyCameraPolicy({
  canvasRef,
  panelInsetsRef,
  domeFitInsetsRef,
  reducedMotionRef,
  cameraTweenRef,
  cameraRef,
}: Dependencies) {

  /**
   * Tokens for computing a camera target — **only the left and right safe
   * insets are replaced with measured values.**
   *
   * `topology-camera-math` already dodges the panels via the safe insets, but
   * those are CSS tokens and therefore static while the real geometry depends
   * on state. Measured 2026-08-10 at 1512×982: the tokens say left 78 / right
   * 120; the truth was **left 324 / right 0 before a selection** and **left 0 /
   * right 384 after one** (selecting collapses INDEX and opens the popover).
   *
   * A first attempt added a *second* correction (a free-area shift) on the
   * selection path only — a second system for one concern, landing 188 px short
   * in one case and over-correcting by 64 px in another. The fix is not another
   * shift but **feeding the existing insets true values**.
   *
   * Left and right only, and only here. `safeInsetTop` (148) is the tool lane
   * plus docked chips and `safeInsetBottom` (96) is a **label reservation** —
   * without it the bottom row of labels once silently disappeared. Those are
   * layout promises, not covering panels, so measuring over them brings that
   * defect back; and `safeInset*` is also read by label culling
   * (`topology-frame-draw`), which has nothing to do with the camera.
   *
   * Takes the **larger** of token and measurement, so width the token reserved
   * for other reasons is never lost.
   */
  const cameraTokens = useCallback(<T extends { safeInsetLeft: number; safeInsetRight: number; }>(tokens: T): T => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return tokens;
    const box = canvasEl.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return tokens;
    const measured = measureCanvasInsets(canvasEl, {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    });
    /*
     * The same measurement the names need. The frame reads its tokens every
     * frame, and `measureCanvasInsets` walks elements, so the draw cannot take
     * it per frame — it reads this ref instead. Written here because the moments
     * that move the camera are the moments a panel opens or closes: a selection
     * reframes, and so does a resize.
     */
    panelInsetsRef.current = { left: measured.left, right: measured.right };
    return {
      ...tokens,
      safeInsetLeft: Math.max(tokens.safeInsetLeft, measured.left),
      safeInsetRight: Math.max(tokens.safeInsetRight, measured.right),
      // What a panel really covers, so a narrow window may shrink the
      // reservation without sliding the graph under it (`clampFitInsets`).
      obstacleInsetLeft: measured.left,
      obstacleInsetRight: measured.right,
    };
  }, [canvasRef, panelInsetsRef]);

  /**
   * **The camera target that puts the cone on the canvas** — one function for the
   * three moments that frame it (entry, auto-align/fit, deselect), so they cannot
   * drift apart.
   *
   * It hands `computeDomeFitCameraTarget` the *measured* left and right panel
   * obstruction (`measureCanvasInsets`, the same measurement the 2D camera
   * consumes) plus the cone's own top and bottom bands, and no padding beyond
   * `domeFitFill`. The three call sites previously padded the bounds 15% a side
   * and then went through the 2D overview fit, which reserves the tool lane, the
   * docking chips and the 2D label row on top — none of which the cone draws.
   * Measured 2026-09-05 at 1920x1080, that stack left the cone at 22.6% of the
   * free canvas.
   */
  const domeFitTarget = useCallback(
    (
      model: DomeModel,
      yaw: number,
      pitch: number,
      width: number,
      height: number,
      tokens: OntologyMapTokens,
    ): CameraTarget | null => {
      const bounds = domeWorldBounds(model, yaw, pitch);
      if (bounds === null) return null;
      const canvasEl = canvasRef.current;
      let left = tokens.safeInsetLeft;
      let right = tokens.safeInsetRight;
      if (canvasEl) {
        const box = canvasEl.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          const measured = measureCanvasInsets(canvasEl, { x: box.x, y: box.y, width: box.width, height: box.height });
          left = measured.left;
          right = measured.right;
        }
      }
      /*
       * Strata keeps its legend rail's names clear of the graph — **while the rail
       * is what is drawn**. The rail sits at the canvas's right edge
       * (`OntologyMapTierLegend`) and it is **not** a side panel: it covers under
       * half the canvas height, so `measureCanvasInsets` correctly declines to
       * treat it as one, and without the reservation the fit runs the graph out to
       * the canvas edge. It did: three nodes landed under the rows at 1040×720,
       * measured 2026-09-06, which is the same "a name on the data" defect the
       * rail exists to end.
       *
       * But at that size the reservation is 6% of the canvas and width is what
       * binds the fit, so the graph paid for it (2026-09-07: fill 72.5% → 63.6%,
       * two element pairs touching). `tierLegendPlacement` decides from the fit's
       * own free box which of the two is true here, and the legend reads the same
       * predicate — so the column is reserved exactly when a rail is drawn in it,
       * and at 1040 nothing is reserved and the legend goes to the corner.
       */
      domeFitInsetsRef.current = { left, right };
      const legendRight =
        model.arrangement === "strata" &&
          tierLegendPlacement(
            width - left - right,
            height - tokens.domeFitInsetTop - tokens.domeFitInsetBottom,
          ) === "rail"
          ? TIER_LEGEND_RESERVE_PX
          : 0;
      return computeDomeFitCameraTarget(
        bounds,
        width,
        height,
        { left, right: Math.max(right, legendRight), top: tokens.domeFitInsetTop, bottom: tokens.domeFitInsetBottom },
        DOME_NODE_FIT_ALLOWANCE_PX,
        tokens,
      );
    },
    [canvasRef, domeFitInsetsRef],
  );

  /**
   * Begin a cubic ease-in-out camera transition from the live camera to
   * `target` (van Wijk's principle: duration proportional to distance), driven
   * each frame by the rAF loop via `easeCameraKeyframe`. Under
   * `prefers-reduced-motion` it no-ops and clears any tween, so the
   * physics-step reduced snap owns the jump. Its identity is stable (refs
   * only), so listing it in the programmatic-move effects' deps never re-fires
   * them.
   */
  const beginCameraTween = useCallback((target: CameraTarget, durationOverrideMs?: number, ease?: "out") => {
    if (reducedMotionRef.current) {
      cameraTweenRef.current = null;
      return;
    }
    const cam = cameraRef.current;
    const start: CameraKeyframe = { x: cam.x.value, y: cam.y.value, scale: cam.scale.value };
    const tgt: CameraKeyframe = { x: target.tx, y: target.ty, scale: target.tscale };
    cameraTweenRef.current = { start, target: tgt, startMs: performance.now(), durationMs: durationOverrideMs ?? cameraTransitionDurationMs(start, tgt), ease };
  }, [cameraRef, cameraTweenRef, reducedMotionRef]);
  return { cameraTokens, domeFitTarget, beginCameraTween };
}
