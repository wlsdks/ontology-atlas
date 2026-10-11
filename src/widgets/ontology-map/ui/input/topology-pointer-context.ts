import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { DEFAULT_MAP_NAVIGATION_SPEED } from "@/shared/lib/preferences/appearance-preferences";
import { commitDomeEntrySweep } from "../../model/dome-view/frame";
import type { DomeNodeFrame, DomeRuntime } from "../../model/dome-view/runtime";
import { computeEffectiveCameraScaleMax, computeEffectiveCameraScaleMin } from "../camera/topology-camera-math";
import type { PointerHandlerRefs } from "./topology-pointer-types";

export type PointerContext = ReturnType<typeof createPointerContext>;

/**
 * Resolves the optional refs once, so every gesture module shares one object per ref,
 * plus the camera and hover helpers that more than one gesture calls.
 */
export function createPointerContext(refs: PointerHandlerRefs) {
  const {
    navigationSpeedRef = { current: DEFAULT_MAP_NAVIGATION_SPEED },
    zoomEaseRef = { current: null },
    worldRef,
    cameraTweenRef,
    canvasRectRef,
    userDrivenCameraRef,
    cameraGestureRevisionRef,
    overviewScaleRef,
    hoveredEdgeRef,
    hoveredClusterIdRef,
    domeRuntimeRef,
    domeGripRef = { current: false },
    onHoverEdge,
    onHoverCluster,
  } = refs;

  const noteUserCameraGesture = () => {
    if (userDrivenCameraRef) userDrivenCameraRef.current = true;
    if (cameraGestureRevisionRef) cameraGestureRevisionRef.current += 1;
  };

  /**
   * 3D view — this frame's dome delivery map (only while the ramp is > 0). Hit
   * testing, candidate building and chip decisions all read this one thing — the map
   * the draw last rendered.
   */
  const domeFrameNow = (): ReadonlyMap<string, DomeNodeFrame> | null => {
    const runtime = domeRuntimeRef?.current ?? null;
    return runtime && runtime.frame.size > 0 && runtime.rampClock > 0 ? runtime.frame : null;
  };
  /** The branch condition for 3D orbit vs in-plane drag — the target is on and no realm is active. */
  const domeInteractive = (): DomeRuntime | null => {
    const runtime = domeRuntimeRef?.current ?? null;
    return runtime && runtime.active ? runtime : null;
  };
  /**
   * 3D — overrides the camera's minimum zoom. When the dome's fit zoom is below the
   * 2D anchor-based minimum, it drops that far (see the `DomeRuntime.fitScale` JSDoc:
   * without it the fit target is unreachable and the wheel anchor computes against a
   * fictional zoom). The wheel, the pinch and the spring must all see the same value
   * so their three clamps cannot diverge.
   */
  const effectiveScaleMinWithDome = (base: number): number => {
    const runtime = domeRuntimeRef?.current ?? null;
    const fit = runtime !== null && runtime.rampClock > 0 ? runtime.fitScale : null;
    return fit !== null ? Math.min(base, fit) : base;
  };

  const scaleWithinZoomBounds = (tokens: OntologyMapTokens, scale: number): number => {
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    const max = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax, worldRef.current?.dialScaleMax ?? undefined);
    const min = effectiveScaleMinWithDome(computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin));
    return Math.min(max, Math.max(min, scale));
  };

  /** Reuse the cached rect during a gesture; refresh lazily if we somehow don't have one yet. */
  const currentRect = (el: HTMLCanvasElement): { left: number; top: number } => {
    const cached = canvasRectRef.current;
    if (cached) return cached;
    const rect = el.getBoundingClientRect();
    const snapshot = { left: rect.left, top: rect.top };
    canvasRectRef.current = snapshot;
    return snapshot;
  };

  const clearEdgeHover = () => {
    if (hoveredEdgeRef && hoveredEdgeRef.current !== null) {
      hoveredEdgeRef.current = null;
      onHoverEdge?.(null, null);
    }
  };
  /** S2 part 5C — clear the cluster chip hover tooltip (on drag, cancel or toggle). */
  const clearClusterHover = () => {
    if (hoveredClusterIdRef && hoveredClusterIdRef.current !== null) {
      hoveredClusterIdRef.current = null;
      onHoverCluster?.(null);
    }
  };

  const releaseCameraForZoom = () => {
    clearEdgeHover();
    clearClusterHover();
    if (cameraTweenRef)
      cameraTweenRef.current = null;
    zoomEaseRef.current = null;
    const dome = domeInteractive();
    if (dome) {
      dome.spinArmed = false;
      commitDomeEntrySweep(dome);
      dome.poseTween = null;
    }
  };

  return {
    ...refs,
    navigationSpeedRef, zoomEaseRef, domeGripRef,
    noteUserCameraGesture, domeFrameNow, domeInteractive, scaleWithinZoomBounds, currentRect,
    clearEdgeHover, clearClusterHover, releaseCameraForZoom,
  };
}
