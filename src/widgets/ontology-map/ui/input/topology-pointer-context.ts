import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { DEFAULT_MAP_NAVIGATION_SPEED } from "@/shared/lib/preferences/appearance-preferences";
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
    onHoverEdge,
    onHoverCluster,
  } = refs;

  const noteUserCameraGesture = () => {
    if (userDrivenCameraRef) userDrivenCameraRef.current = true;
    if (cameraGestureRevisionRef) cameraGestureRevisionRef.current += 1;
  };

  const scaleWithinZoomBounds = (tokens: OntologyMapTokens, scale: number): number => {
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    const max = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax, worldRef.current?.dialScaleMax ?? undefined);
    const min = computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin);
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
  };

  return {
    ...refs,
    navigationSpeedRef, zoomEaseRef,
    noteUserCameraGesture, scaleWithinZoomBounds, currentRect,
    clearEdgeHover, clearClusterHover, releaseCameraForZoom,
  };
}
