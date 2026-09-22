"use client";

import { useEffect } from "react";

import { DEPTH_DOT_LAYERS, buildDepthDotPattern, buildGridPattern } from "../render/grid";
import {
  buildDustPoints,
  buildRealmCosmosPoints,
  computeStarDustCount,
  type DustPoint,
} from "../render/starfield";
import {
  refreshIndexDependentTokens,
  type OntologyMapTokens,
} from "../tokens/read-map-tokens";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";

type SourceRef<T> = { current: T; };

export type ViewportReframeMotion =
  | "tracking"
  | "finalize-tracking"
  | "settled";

export interface TopologyViewportLifecycleSources {
  elements: {
    canvasRef: SourceRef<HTMLCanvasElement | null>;
    containerRef: SourceRef<HTMLDivElement | null>;
    canvasRectRef: SourceRef<{ left: number; top: number; } | null>;
  };
  viewport: {
    viewportRef: SourceRef<{ width: number; height: number; dpr: number; }>;
    pendingViewportRef: SourceRef<{
      width: number;
      height: number;
      dpr: number;
    } | null>;
    viewportRebuildPendingRef: SourceRef<boolean>;
    viewportCameraTrackedRef: SourceRef<boolean>;
    hasInitializedRef: SourceRef<boolean>;
  };
  layers: {
    gridCanvasRef: SourceRef<HTMLCanvasElement | null>;
    gridPatternRef: SourceRef<CanvasPattern | null>;
    depthDotCanvasRef: SourceRef<HTMLCanvasElement[]>;
    depthDotPatternsRef: SourceRef<(CanvasPattern | null)[]>;
    dustPointsRef: SourceRef<DustPoint[]>;
    cosmosPointsRef: SourceRef<DustPoint[]>;
  };
  frameBridge: {
    commitViewportSizeRef: SourceRef<(() => boolean) | null>;
    rebuildViewportLayersRef: SourceRef<(() => void) | null>;
    reframeViewportRef: SourceRef<
      ((motion: ViewportReframeMotion) => boolean) | null
    >;
  };
  trySnapInitialCamera: (tokens: OntologyMapTokens) => void;
  rescueCameraIfEverythingOffscreen: (tokens: OntologyMapTokens) => void;
}

export function useTopologyViewportLifecycle({
  elements,
  viewport,
  layers,
  frameBridge,
  trySnapInitialCamera,
  rescueCameraIfEverythingOffscreen,
}: TopologyViewportLifecycleSources): void {
  const { canvasRef, containerRef, canvasRectRef } = elements;
  const {
    viewportRef,
    pendingViewportRef,
    viewportRebuildPendingRef,
    viewportCameraTrackedRef,
    hasInitializedRef,
  } = viewport;
  const {
    gridCanvasRef,
    gridPatternRef,
    depthDotCanvasRef,
    depthDotPatternsRef,
    dustPointsRef,
    cosmosPointsRef,
  } = layers;
  const {
    commitViewportSizeRef,
    rebuildViewportLayersRef,
    reframeViewportRef,
  } = frameBridge;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    /**
     * Record the size only. **Do not change the canvas backing size here.**
     *
     * `canvas.width = n` clears the bitmap, and a ResizeObserver callback runs
     * **after** rAF and **before** paint within a browser frame. Resizing here
     * makes that frame's order `draw → clear → paint`, so **an empty canvas
     * reaches the screen**. A docking panel's width transition fires the
     * observer every frame, so for the whole transition (measured
     * 183–200 ms) the map showed 0 nodes, 0 edges, 0 grid. Committing inside
     * rAF makes the order `clear → draw → paint`, and the same resize never
     * blanks a frame.
     */
    const measure = () => {
      const rect = container.getBoundingClientRect();
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      pendingViewportRef.current = { width: rect.width, height: rect.height, dpr };
      // Keep the cached pointer rect fresh whenever layout changes (see
      // `canvasRectRef` in `topology-pointer-handlers.ts`).
      canvasRectRef.current = { left: rect.left, top: rect.top };
    };

    /** The cheap half, called from inside a frame: backing size and viewport facts only. */
    const commitViewportSize = () => {
      // The top and bottom lanes follow the viewport height; read them before
      // the fit and the label cull consume the size that just changed.
      refreshIndexDependentTokens();
      const pending = pendingViewportRef.current;
      if (!pending) return false;
      pendingViewportRef.current = null;
      const backingWidth = Math.max(1, Math.round(pending.width * pending.dpr));
      const backingHeight = Math.max(1, Math.round(pending.height * pending.dpr));
      const sizeChanged = canvas.width !== backingWidth || canvas.height !== backingHeight;
      // **An unchanged CSS size does not rebuild the viewport layers.**
      // Everything `rebuildViewportLayers` produces (star dust, grid, depth
      // dots) is in CSS pixels and stays valid across a dpr change. Without
      // this distinction, grabbing and releasing a drag rebuilds the star dust
      // twice, and the fix for lag becomes new lag.
      const cssSizeChanged =
        viewportRef.current.width !== pending.width || viewportRef.current.height !== pending.height;
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      viewportRef.current = pending;
      if (cssSizeChanged) {
        viewportRebuildPendingRef.current = true;
        // Move dock width and camera on the same clock. Creating the first target
        // after settling appears as two actions: 「Panel Move → Brief Pause → Map Move」.
        // This path does not recreate stardust/grids, only cheaply updates the camera target.
        if (
          hasInitializedRef.current &&
          reframeViewportRef.current?.("tracking")
        ) {
          viewportCameraTrackedRef.current = true;
        }
      }
      return sizeChanged;
    };

    /**
     * The expensive half: rebuild the viewport-dependent layers and rescue the
     * camera. Runs **once, after the size settles** (`VIEWPORT_SETTLE_FRAMES`).
     * During a transition the previous point cloud keeps being drawn —
     * momentarily misplaced star dust beats a blank screen, and refitting the
     * camera every frame makes it jump twice at the end of the transition.
     */
    const rebuildViewportLayers = () => {
      const { width, height } = viewportRef.current;
      if (width <= 0 || height <= 0) return;

      const tokens = readOntologyMapTokensOrNull();
      if (!tokens) return;

      if (!gridCanvasRef.current) gridCanvasRef.current = document.createElement("canvas");
      if (!gridPatternRef.current) {
        gridPatternRef.current = buildGridPattern(gridCanvasRef.current, {
          minorColor: tokens.gridMinor,
          majorColor: tokens.gridMajor,
          baseColor: tokens.canvasBgNear,
        });
      }
      // The three depth-dot layers are static tiles, built once per viewport rebuild.
      if (depthDotCanvasRef.current.length === 0) {
        depthDotCanvasRef.current = DEPTH_DOT_LAYERS.map(() => document.createElement("canvas"));
      }
      {
        const rootStyle = getComputedStyle(document.documentElement);
        const rgb = rootStyle.getPropertyValue("--canvas-bg-particle-rgb").trim() || "150, 165, 220";
        depthDotPatternsRef.current = DEPTH_DOT_LAYERS.map((layer, i) =>
          buildDepthDotPattern(depthDotCanvasRef.current[i], layer, `rgba(${rgb}, ${0.055 * layer.alphaScale})`),
        );
      }
      dustPointsRef.current = buildDustPoints(width, height, computeStarDustCount(width, height, tokens.dustAreaPerPoint), tokens.dustParallaxMin, tokens.dustParallaxMax);
      // Cosmos dots are twice the density of the dust (two layers), counted off
      // the same areaPerPoint token and doubled.
      cosmosPointsRef.current = buildRealmCosmosPoints(
        width,
        height,
        computeStarDustCount(width, height, tokens.dustAreaPerPoint) * 2,
      );
      // Initial mount has `trySnapInitialCamera` set the camera immediately. Only
      // resize with an existing camera realigns the current semantic state to the new width.
      const hadCameraBeforeResize = hasInitializedRef.current;
      trySnapInitialCamera(tokens);
      const reframeMotion: ViewportReframeMotion = viewportCameraTrackedRef.current
        ? "finalize-tracking"
        : "settled";
      const reframed =
        hadCameraBeforeResize && reframeViewportRef.current?.(reframeMotion);
      viewportCameraTrackedRef.current = false;
      // Even if the camera was intentionally preserved like a user pan/zoom, if all
      // nodes have clearly vanished after resize (an obvious failure state), the existing
      // safety net acts as the final rescue.
      if (!reframed) rescueCameraIfEverythingOffscreen(tokens);
    };

    commitViewportSizeRef.current = commitViewportSize;
    rebuildViewportLayersRef.current = rebuildViewportLayers;

    // Commit immediately on mount: `trySnapInitialCamera` needs the viewport
    // facts before the first frame in order to decide the first camera.
    measure();
    commitViewportSize();
    rebuildViewportLayers();
    viewportRebuildPendingRef.current = false;

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.removeEventListener("resize", measure);
        commitViewportSizeRef.current = null;
        rebuildViewportLayersRef.current = null;
      };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);

    // `ResizeObserver` only sees **size** changes. Moving the window to another
    // monitor leaves the CSS size intact and changes `devicePixelRatio` alone,
    // which leaves the canvas backing size at the old DPR and misaligns
    // everything drawn. So DPR is watched separately.
    // `matchMedia(resolution)` fires once when the current DPR is left behind,
    // so it is re-armed with a fresh query each time.
    let dprQuery: MediaQueryList | null = null;
    const onDprChange = () => {
      measure();
      watchDpr();
    };
    const watchDpr = () => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
      dprQuery?.removeEventListener?.("change", onDprChange);
      const dpr = window.devicePixelRatio || 1;
      dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
      dprQuery.addEventListener?.("change", onDprChange);
    };
    watchDpr();

    return () => {
      observer.disconnect();
      dprQuery?.removeEventListener?.("change", onDprChange);
      commitViewportSizeRef.current = null;
      rebuildViewportLayersRef.current = null;
    };
  }, [
    canvasRectRef,
    canvasRef,
    commitViewportSizeRef,
    containerRef,
    cosmosPointsRef,
    depthDotCanvasRef,
    depthDotPatternsRef,
    dustPointsRef,
    gridCanvasRef,
    gridPatternRef,
    hasInitializedRef,
    pendingViewportRef,
    rebuildViewportLayersRef,
    reframeViewportRef,
    rescueCameraIfEverythingOffscreen,
    trySnapInitialCamera,
    viewportCameraTrackedRef,
    viewportRebuildPendingRef,
    viewportRef,
  ]);
}
