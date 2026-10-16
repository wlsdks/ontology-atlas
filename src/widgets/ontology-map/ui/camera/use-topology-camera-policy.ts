"use client";

import {
  useCallback,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../../engine/camera";
import {
  measureBottomFitObstacle,
  measureCanvasInsets,
  measureEdgeFitObstacle,
  type EdgeFitObstacle
} from "../../interaction/free-area";
import { CANVAS_SPRING_PAN_MS, cameraTransitionDurationMs, type CameraKeyframe, type CameraTween, type CameraTweenAltitude, type CameraTweenEase } from "../../model/camera/camera-easing";
import {
  DOME_NODE_FIT_ALLOWANCE_PX,
  domeReachesRect,
  domeWorldBounds,
} from "../../model/dome-view/projection";
import type { DomeModel } from "../../model/dome-view/types";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
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
   * Tokens for a camera target with only the left and right safe insets replaced by measured values:
   * the CSS tokens are static while panel geometry depends on state. Top and bottom stay tokens
   * (layout promises also read by label culling). Takes the larger of token and measurement.
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
   * The camera target that puts the cone on the canvas: one function for entry, fit and deselect.
   * It hands `computeDomeFitCameraTarget` the measured panel obstruction (`measureCanvasInsets`) plus
   * the cone's own top and bottom bands, with no padding beyond `domeFitFill`.
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
       * The edge chrome's columns (utility rail, folded INDEX tab) are not panels, but drawings are centred
       * between the chrome on both sides, so they count where they cost the drawing nothing. Strata keeps
       * its width where a column covers none of it.
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
       * chrome (`model/dome-view/tier-names.ts`), the chrome's columns excluded whether or not
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
  const beginCameraTween = useCallback((target: CameraTarget, durationOverrideMs?: number, ease?: CameraTweenEase, altitude: CameraTweenAltitude = "follows-camera") => {
    if (reducedMotionRef.current) {
      cameraTweenRef.current = null;
      return;
    }
    const cam = cameraRef.current;
    const start: CameraKeyframe = { x: cam.x.value, y: cam.y.value, scale: cam.scale.value };
    const tgt: CameraKeyframe = { x: target.tx, y: target.ty, scale: target.tscale };
    cameraTweenRef.current = { start, target: tgt, startMs: performance.now(), durationMs: durationOverrideMs ?? (ease === "spring" ? CANVAS_SPRING_PAN_MS : cameraTransitionDurationMs(start, tgt)), ease, altitude };
  }, [cameraRef, cameraTweenRef, reducedMotionRef]);
  return { cameraTokens, domeFitTarget, beginCameraTween };
}
