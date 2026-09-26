"use client";

import {
  useCallback,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import {
  measureBottomFitObstacle,
  measureCanvasInsets,
  measureEdgeFitObstacle,
  type EdgeFitObstacle
} from "../interaction/free-area";
import { cameraTransitionDurationMs, type CameraKeyframe, type CameraTween } from "../model/camera-easing";
import {
  DOME_NODE_FIT_ALLOWANCE_PX,
  domeReachesRect,
  domeWorldBounds,
  type DomeModel
} from "../model/dome-view";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { computeDomeFitCameraTarget } from "./topology-camera-math";

interface Dependencies {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  panelInsetsRef: RefObject<{ left: number; right: number; } | null>;
  domeFitInsetsRef: RefObject<{ left: number; right: number; top: number; bottom: number; } | null>;
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
      // What the chrome really covers — a panel, the folded INDEX tab, the utility
      // rail's column — so a narrow window may shrink the reservation without
      // sliding the graph under it (`clampFitInsets`).
      obstacleInsetLeft: Math.max(measured.left, measureEdgeFitObstacle(canvasEl, "left")?.reach ?? 0),
      obstacleInsetRight: Math.max(measured.right, measureEdgeFitObstacle(canvasEl, "right")?.reach ?? 0),
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
      let edges: { left: EdgeFitObstacle | null; right: EdgeFitObstacle | null } = { left: null, right: null };
      if (canvasEl) {
        const box = canvasEl.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          const measured = measureCanvasInsets(canvasEl, { x: box.x, y: box.y, width: box.width, height: box.height });
          left = measured.left;
          right = measured.right;
          edges = { left: measureEdgeFitObstacle(canvasEl, "left"), right: measureEdgeFitObstacle(canvasEl, "right") };
        }
      }
      const panels = {
        left,
        right,
        top: tokens.domeFitInsetTop,
        bottom: Math.max(tokens.domeFitInsetBottom, canvasEl ? measureBottomFitObstacle(canvasEl) : 0),
      };
      /*
       * **The edge chrome's columns — the utility rail, the folded INDEX tab — where
       * they cost the drawing nothing or the drawing would sit under them**
       * (2026-09-26). They are not panels, but every other view centres its drawing
       * between the chrome on both sides: fitted up to the canvas's edge instead,
       * Neural sat 30 px right of the free map's centre at 1512×949 (half the rail's
       * footprint) and at 1040×720 nine of its nodes stood under the tiles.
       *
       * Except where a column is width the drawing needs and the chrome covers none of
       * it: Strata is narrow at the top, where the tiles stand, and at 1040×720 its width
       * binds the fit — reserving the column there shrank it from 73.7% to 66.9% of the
       * free canvas and fused two element pairs on one plane, the trade the 2026-09-07
       * legend decision already refused. The drawing then keeps the width.
       */
      const chromed = {
        ...panels,
        left: Math.max(panels.left, edges.left?.reach ?? 0),
        right: Math.max(panels.right, edges.right?.reach ?? 0),
      };
      let target = computeDomeFitCameraTarget(bounds, width, height, panels, DOME_NODE_FIT_ALLOWANCE_PX, tokens);
      if (chromed.left !== panels.left || chromed.right !== panels.right) {
        const centred = computeDomeFitCameraTarget(bounds, width, height, chromed, DOME_NODE_FIT_ALLOWANCE_PX, tokens);
        const costsNothing = centred.tscale >= target.tscale * (1 - 1e-6);
        const covered = [
          edges.left && { left: 0, right: edges.left.reach, top: edges.left.top, bottom: edges.left.bottom },
          edges.right && { left: width - edges.right.reach, right: width, top: edges.right.top, bottom: edges.right.bottom },
        ].some((rect) => rect && domeReachesRect(model, yaw, pitch, target, width, height, rect, DOME_NODE_FIT_ALLOWANCE_PX));
        if (costsNothing || covered) target = centred;
      }
      /*
       * Strata's tier names stand beside their rims in the free map between the
       * chrome (`model/tier-names.ts`), the chrome's columns excluded whether or not
       * the drawing uses them, so the frame reads the box measured here rather than
       * walking the DOM on every frame. No column is reserved for the names: one that
       * finds no clear place beside its rim goes unnamed, and the drawing keeps the width.
       */
      domeFitInsetsRef.current = chromed;
      return target;
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
