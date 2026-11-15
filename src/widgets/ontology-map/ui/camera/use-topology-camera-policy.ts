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
  measureCanvasInsets,
  measureEdgeFitObstacle,
  measureNameObstacles,
  type PanelInsets
} from "../../interaction/free-area";
import { CANVAS_SPRING_PAN_MS, cameraTransitionDurationMs, type CameraKeyframe, type CameraTween, type CameraTweenAltitude, type CameraTweenEase } from "../../model/camera/camera-easing";

interface Dependencies {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  panelInsetsRef: RefObject<PanelInsets | null>;
  reducedMotionRef: RefObject<boolean>;
  cameraTweenRef: RefObject<CameraTween | null>;
  cameraRef: RefObject<CameraAxes>;
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

/** Camera inset and tween policy shared by frame and navigation owners. */
export function useTopologyCameraPolicy({
  canvasRef,
  panelInsetsRef,
  reducedMotionRef,
  cameraTweenRef,
  cameraRef,
  lastActiveMsRef,
}: Dependencies) {
  const chromeWatchRef = useRef<ChromeWatch | null>(null);

  /*
   * The chrome can change size between camera moments: the detail panel grows when its content
   * arrives, the key wraps, INDEX folds while the agent dock is open. A size change re-measures
   * the name boxes once, in the next frame, and asks for that frame; at rest nothing runs.
   */
  const watchChrome = useCallback((canvasEl: HTMLCanvasElement) => {
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
          panelInsetsRef.current = { ...insets, nameObstacles: measureNameObstacles(canvas, { left: true, right: true }) };
          lastActiveMsRef.current = performance.now();
        });
      }), watched: new Set(), frame: 0 };
      watch = chromeWatchRef.current = fresh;
    }
    const present = new Set(canvasEl.ownerDocument.querySelectorAll(NAME_CHROME_SELECTOR));
    for (const el of watch.watched) if (!present.has(el)) watch.observer.unobserve(el);
    for (const el of present) if (!watch.watched.has(el)) watch.observer.observe(el);
    watch.watched = present;
  }, [canvasRef, lastActiveMsRef, panelInsetsRef]);

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
    const canvasEl = canvasRef.current;
    if (!canvasEl) return tokens;
    const box = canvasEl.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return tokens;
    const canvasRect = { x: box.x, y: box.y, width: box.width, height: box.height };
    const panels = collectCanvasObstacles(canvasEl, canvasRect);
    const measured = measureCanvasInsets(canvasEl, canvasRect, panels);
    /*
     * The same measurement the names need. The frame reads its tokens every
     * frame, and the panels come from an element walk, so the draw cannot take
     * it per frame — it reads this ref instead. Written here because the moments
     * that move the camera are the moments a panel opens or closes: a selection
     * reframes, and so does a resize.
     */
    panelInsetsRef.current = { left: measured.left, right: measured.right, nameObstacles: measureNameObstacles(canvasEl, { left: true, right: true }, panels) };
    watchChrome(canvasEl);
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
  }, [canvasRef, panelInsetsRef, watchChrome]);

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
  return { cameraTokens, beginCameraTween };
}
