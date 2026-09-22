"use client";

import {
  useRef
} from "react";
import { type AnimatedBackground } from "../render/animated-background";
import type { DustPoint } from "../render/starfield";

/** Own the canvas, measured viewport, and viewport-dependent drawing buffers. */
export function useTopologySurfaceState() {

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const viewportRef = useRef({ width: 0, height: 0, dpr: 1 });

  /**
   * The latest size **measured** by the ResizeObserver. Committing it (swapping
   * the canvas backing size) does not happen here — an rAF frame picks it up.
   * Why: see the resize effect below.
   */
  const pendingViewportRef = useRef<{ width: number; height: number; dpr: number; } | null>(null);

  /** Do the viewport-dependent layers need rebuilding (once, after the size settles). */
  const viewportRebuildPendingRef = useRef(false);

  /** The backing-resolution scale in force right now — changes only when an interaction starts or ends. */
  const appliedDprScaleRef = useRef<number | null>(null);

  /** Consecutive frames with no new size — compared against `VIEWPORT_SETTLE_FRAMES`. */
  const viewportSettleFramesRef = useRef(0);

  const commitViewportSizeRef = useRef<(() => boolean) | null>(null);

  const rebuildViewportLayersRef = useRef<(() => void) | null>(null);

  const dustPointsRef = useRef<DustPoint[]>([]);

  /** Cosmos dots inside the warding ring while a realm is active — built once per viewport, refreshed on resize. */
  const cosmosPointsRef = useRef<DustPoint[]>([]);

  const gridPatternRef = useRef<CanvasPattern | null>(null);

  /**
   * Particle state plus offscreen buffer for the animated backgrounds (flow,
   * proximity web, gravity). A variant change rebuilds it outright: a particle
   * means something different in each variant, so reusing state makes the first
   * seconds look wrong.
   */
  const animatedBgRef = useRef<AnimatedBackground | null>(null);

  /** Cursor position in canvas-screen coords, or null when off-canvas — which quietens the background. */
  const bgPointerRef = useRef<{ x: number; y: number; } | null>(null);

  /** Patterns for the three depth-dot layers — static, built once on mount and on resize. */
  const depthDotPatternsRef = useRef<(CanvasPattern | null)[]>([]);

  const depthDotCanvasRef = useRef<HTMLCanvasElement[]>([]);
  return {
    canvasRef, containerRef, gridCanvasRef, viewportRef, pendingViewportRef, viewportRebuildPendingRef,
    appliedDprScaleRef, viewportSettleFramesRef, commitViewportSizeRef, rebuildViewportLayersRef,
    dustPointsRef, cosmosPointsRef, gridPatternRef, animatedBgRef, bgPointerRef, depthDotPatternsRef,
    depthDotCanvasRef,
  };
}
