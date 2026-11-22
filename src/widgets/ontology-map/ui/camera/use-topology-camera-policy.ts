"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../../engine/camera";
import {
  collectCanvasObstacles,
  measureBottomFitObstacle,
  measureCanvasInsets,
  measureEdgeFitObstacle,
  measureNameObstacles,
  type EdgeFitObstacle,
  type PanelInsets
} from "../../interaction/free-area";
import { cameraTransitionDurationMs, selectionTweenDurationMs, selectionTweenSpeed, type CameraKeyframe, type CameraTween, type CameraTweenAltitude, type CameraTweenEase } from "../../model/camera/camera-easing";
import {
  DOME_NODE_FIT_ALLOWANCE_PX,
  domeReachesRect,
  domeWorldBounds,
} from "../../model/dome-view/camera/projection";
import type { DomeFitTarget } from "../../model/dome-view/runtime";
import { domeTurnReach } from "../../model/dome-view/camera/turn-follow";
import type { DomeModel } from "../../model/dome-view/dome-shapes";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { computeDomeFitCameraTarget, domeFitFreeHalfSize } from "./target/fit-targets";

interface Dependencies {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  panelInsetsRef: RefObject<PanelInsets | null>;
  domeFitInsetsRef: RefObject<{ left: number; right: number; top: number; bottom: number; } | null>;
  reducedMotionRef: RefObject<boolean>;
  cameraTweenRef: RefObject<CameraTween | null>;
  cameraRef: RefObject<CameraAxes>;
  view3dRef: RefObject<boolean>;
  /** Writing it asks the map for a frame. */
  lastActiveMsRef: RefObject<number>;
}

/** The chrome whose size decides where map names may draw. */
const NAME_CHROME_SELECTOR = "[data-topology-camera-obstacle], [data-map-name-obstacle], [data-map-fit-obstacle]";

interface ChromeWatch {
  observer: ResizeObserver;
  watched: Set<Element>;
  frame: number;
}

/** Camera inset, dome fitting, and tween policy shared by frame and navigation owners. */
export function useTopologyCameraPolicy({
  canvasRef,
  panelInsetsRef,
  domeFitInsetsRef,
  reducedMotionRef,
  cameraTweenRef,
  cameraRef,
  view3dRef,
  lastActiveMsRef,
}: Dependencies) {
  const chromeWatchRef = useRef<ChromeWatch | null>(null);

  /*
   * The chrome can change size between camera moments: the detail panel grows when its content
   * arrives, the key wraps, INDEX folds while the agent dock is open. A size change re-measures
   * once, in the next frame, and asks for that frame: the name boxes in Flat, the side insets a
   * 3D title stands between otherwise. At rest nothing runs.
   */
  const watchChrome = useCallback((canvasElement: HTMLCanvasElement) => {
    if (typeof ResizeObserver === "undefined") return;
    let watch = chromeWatchRef.current;
    if (!watch) {
      const fresh: ChromeWatch = { observer: new ResizeObserver(() => {
        if (fresh.frame !== 0) return;
        fresh.frame = requestAnimationFrame(() => {
          fresh.frame = 0;
          const canvas = canvasRef.current;
          const insets = panelInsetsRef.current;
          if (!canvas || !insets) return;
          if (view3dRef.current) {
            const box = canvas.getBoundingClientRect();
            const measured = measureCanvasInsets(canvas, { x: box.x, y: box.y, width: box.width, height: box.height });
            if (measured.left === insets.left && measured.right === insets.right) return;
            panelInsetsRef.current = { ...insets, left: measured.left, right: measured.right };
          } else {
            panelInsetsRef.current = { ...insets, nameObstacles: measureNameObstacles(canvas, { left: true, right: true }) };
          }
          lastActiveMsRef.current = performance.now();
        });
      }), watched: new Set(), frame: 0 };
      watch = chromeWatchRef.current = fresh;
    }
    const present = new Set(canvasElement.ownerDocument.querySelectorAll(NAME_CHROME_SELECTOR));
    for (const domElement of watch.watched) if (!present.has(domElement)) watch.observer.unobserve(domElement);
    for (const domElement of present) if (!watch.watched.has(domElement)) watch.observer.observe(domElement);
    watch.watched = present;
  }, [canvasRef, lastActiveMsRef, panelInsetsRef, view3dRef]);

  useEffect(() => () => {
    const watch = chromeWatchRef.current;
    if (!watch) return;
    watch.observer.disconnect();
    cancelAnimationFrame(watch.frame);
  }, []);

  /**
   * Tokens for a camera target with only the left and right safe insets replaced by measured values:
   * the CSS tokens are static while panel geometry depends on state. Top and bottom stay tokens
   * (layout promises also read by label culling). Takes the larger of token and measurement.
   */
  const cameraTokens = useCallback(<T extends { safeInsetLeft: number; safeInsetRight: number; }>(tokens: T): T => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return tokens;
    const box = canvasElement.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return tokens;
    const canvasRect = { x: box.x, y: box.y, width: box.width, height: box.height };
    const panels = collectCanvasObstacles(canvasElement, canvasRect);
    const measured = measureCanvasInsets(canvasElement, canvasRect, panels);
    /*
     * The draw reads this ref instead of walking the panels' elements per frame, so it is written where the camera moves
     * (a selection reframes, a resize), which is when a panel opens or closes. In 3D no name reads the chrome boxes.
     */
    const flat = !view3dRef.current;
    panelInsetsRef.current = { left: measured.left, right: measured.right, nameObstacles: flat ? measureNameObstacles(canvasElement, { left: true, right: true }, panels) : [] };
    watchChrome(canvasElement);
    return {
      ...tokens,
      safeInsetLeft: Math.max(tokens.safeInsetLeft, measured.left),
      safeInsetRight: Math.max(tokens.safeInsetRight, measured.right),
      // What the chrome really covers — a panel, the folded INDEX tab, the utility
      // rail's column — so a narrow window may shrink the reservation without
      // sliding the graph under it (`clampFitInsets`).
      obstacleInsetLeft: Math.max(measured.left, measureEdgeFitObstacle(canvasElement, "left")?.reach ?? 0),
      obstacleInsetRight: Math.max(measured.right, measureEdgeFitObstacle(canvasElement, "right")?.reach ?? 0),
    };
  }, [canvasRef, panelInsetsRef, view3dRef, watchChrome]);

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
    ): DomeFitTarget | null => {
      const bounds = domeWorldBounds(model, yaw, pitch);
      if (bounds === null) return null;
      const canvasElement = canvasRef.current;
      let left = tokens.safeInsetLeft;
      let right = tokens.safeInsetRight;
      let edges: { left: EdgeFitObstacle | null; right: EdgeFitObstacle | null } = { left: null, right: null };
      if (canvasElement) {
        const box = canvasElement.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          const measured = measureCanvasInsets(canvasElement, { x: box.x, y: box.y, width: box.width, height: box.height });
          left = measured.left;
          right = measured.right;
          edges = { left: measureEdgeFitObstacle(canvasElement, "left"), right: measureEdgeFitObstacle(canvasElement, "right") };
        }
      }
      const panels = {
        left,
        right,
        top: tokens.domeFitInsetTop,
        bottom: Math.max(tokens.domeFitInsetBottom, canvasElement ? measureBottomFitObstacle(canvasElement) : 0),
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
      let used = panels;
      if (chromed.left !== panels.left || chromed.right !== panels.right) {
        const centred = computeDomeFitCameraTarget(bounds, width, height, chromed, DOME_NODE_FIT_ALLOWANCE_PX, tokens);
        const costsNothing = centred.tscale >= target.tscale * (1 - 1e-6);
        const covered = [
          edges.left && { left: 0, right: edges.left.reach, top: edges.left.top, bottom: edges.left.bottom },
          edges.right && { left: width - edges.right.reach, right: width, top: edges.right.top, bottom: edges.right.bottom },
        ].some((rect) => rect && domeReachesRect(model, yaw, pitch, target, width, height, rect, DOME_NODE_FIT_ALLOWANCE_PX));
        if (costsNothing || covered) {
          target = centred;
          used = chromed;
        }
      }
      /*
       * Strata's tier names stand beside their rims in the free map between the chrome (`tier-names.ts`), the chrome's columns
       * excluded whether or not the drawing uses them, so the frame reads this measured box. No column is reserved: a name with
       * no clear place beside its rim goes unnamed.
       */
      domeFitInsetsRef.current = chromed;
      if (model.arrangement !== "coupling") return target;
      // Neural fits the pose it is asked for; turning from it then zooms out only as far as each yaw needs.
      const free = domeFitFreeHalfSize(width, height, used, DOME_NODE_FIT_ALLOWANCE_PX, tokens);
      return {
        ...target,
        turn: domeTurnReach(model, yaw, pitch, free) ?? undefined,
        freeArea: { centreX: (used.left - used.right) / 2, centreY: (used.top - used.bottom) / 2, ...free },
      };
    },
    [canvasRef, domeFitInsetsRef],
  );

  /**
   * Begins a cubic ease-in-out transition from the live camera to `target` (duration proportional to distance), driven by the rAF
   * loop via `easeCameraKeyframe`; under reduced motion it clears any tween so the physics-step snap owns the jump. A selection
   * replacing a running one leaves at the speed that one had. Its identity is stable (refs only), so listing it in deps never re-fires.
   */
  const beginCameraTween = useCallback((target: CameraTarget, durationOverrideMs?: number, ease?: CameraTweenEase, altitude: CameraTweenAltitude = "follows-camera") => {
    if (reducedMotionRef.current) {
      cameraTweenRef.current = null;
      return;
    }
    const cam = cameraRef.current;
    const start: CameraKeyframe = { x: cam.x.value, y: cam.y.value, scale: cam.scale.value };
    const tgt: CameraKeyframe = { x: target.tx, y: target.ty, scale: target.tscale };
    const startMs = performance.now();
    const running = cameraTweenRef.current;
    const startSpeed = ease === "spring" && running?.ease === "spring" ? selectionTweenSpeed(running, startMs - running.startMs) : undefined;
    cameraTweenRef.current = { start, target: tgt, startMs, durationMs: durationOverrideMs ?? (ease === "spring" ? selectionTweenDurationMs(start, tgt) : cameraTransitionDurationMs(start, tgt)), ease, altitude, startSpeed };
  }, [cameraRef, cameraTweenRef, reducedMotionRef]);
  return { cameraTokens, domeFitTarget, beginCameraTween };
}
