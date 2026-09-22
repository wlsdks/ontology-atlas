"use client";
import { useEffect, useEffectEvent, type RefObject } from "react";
import type { CameraAxes } from "../engine/camera";
import { projectDomeEdgeControl } from '../model/dome-edge';
import { createCameraFrameStage } from "./topology-camera-frame-stage";
import { createClusterFrameStage } from "./topology-cluster-frame-stage";
import { createDomeFrameStage } from "./topology-dome-frame-stage";
import { createFrameGate } from "./topology-frame-gate";
import { createPresentationFrameStage } from "./topology-presentation-frame-stage";
import { createRealmFrameStage } from "./topology-realm-frame-stage";
import { createRevealFrameStage } from "./topology-reveal-frame-stage";
import { type WorldEdge } from "./topology-world";
import { createWorldMotionFrameStage } from "./topology-world-motion-frame-stage";

interface Configuration {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  projection: Pick<Parameters<typeof createPresentationFrameStage>[0], "domeRuntimeRef" | "reducedMotionRef" | "neuralRampRef"> & { cameraRef: RefObject<CameraAxes>; };
  recovery: Pick<Parameters<typeof createFrameGate>[0], "lastActiveMsRef" | "viewportRebuildPendingRef">;
  domeFrameStage: Parameters<typeof createDomeFrameStage>[0];
  worldMotionFrameStage: Parameters<typeof createWorldMotionFrameStage>[0];
  cameraFrameStage: Parameters<typeof createCameraFrameStage>[0];
  clusterFrameStage: Parameters<typeof createClusterFrameStage>[0];
  realmFrameStage: Parameters<typeof createRealmFrameStage>[0];
  revealFrameStage: Parameters<typeof createRevealFrameStage>[0];
  frameGate: Parameters<typeof createFrameGate>[0];
  presentationFrameStage: Omit<Parameters<typeof createPresentationFrameStage>[0], "ctx" | "domeEdgeControlForFrame">;
}

/** Configure stages once, then own scheduling, early yields, and context recovery.
 * Configuration consists solely of stable state refs and camera policy callbacks.
 * The effect event reads the mounted configuration without making render-created
 * grouping objects a reason to tear down and restart the animation loop.
 * The original four policy callback dependencies still restart it if replaced.
 */
export function useTopologyFrameLoop(configuration: Configuration) {
  const getConfiguration = useEffectEvent(() => configuration);
  const { beginCameraTween, cameraTokens, domeFitTarget } = configuration.domeFrameStage;
  const { endGrowthReplay } = configuration.frameGate;
  useEffect(() => {
    const configuration = getConfiguration();
    const { canvasRef, projection, recovery } = configuration;
    const { domeRuntimeRef, cameraRef, reducedMotionRef, neuralRampRef } = projection;
    const { lastActiveMsRef, viewportRebuildPendingRef } = recovery;
    const canvas = canvasRef.current;
    if (!canvas) return;
    /*
     * 3D meridian control point — the draw calls this **per edge**, so it is
     * created once in the effect body. Creating it inside the frame would be a
     * per-frame allocation; lifting it to a `useCallback` in the component body
     * would add another name to this effect's dependency list (hooks lint would
     * demand it) and tie the draw loop to that identity. Here matches its real
     * lifetime — the function reads only refs.
     */
    const domeEdgeControlForFrame = (edge: WorldEdge) => {
      const dome = domeRuntimeRef.current;
      return dome === null ? null : projectDomeEdgeControl(edge, dome.frame, dome.model.arrangement, cameraRef.current.scale.value, reducedMotionRef.current ? undefined : neuralRampRef.current);
    };
    const runDomeFrameStage = createDomeFrameStage(configuration.domeFrameStage);
    const runWorldMotionFrameStage = createWorldMotionFrameStage(configuration.worldMotionFrameStage);
    const runCameraFrameStage = createCameraFrameStage(configuration.cameraFrameStage);
    const runClusterFrameStage = createClusterFrameStage(configuration.clusterFrameStage);
    const runRealmFrameStage = createRealmFrameStage(configuration.realmFrameStage);
    const runRevealFrameStage = createRevealFrameStage(configuration.revealFrameStage);
    /**
     * **`alpha: false` — this map never needs to show what is behind it.**
     *
     * Per the WHATWG canvas spec this pins every pixel's alpha to 1.0, which
     * lets **the compositor skip blending against the page content behind the
     * canvas**. Blink sets `cc_layer_->SetContentsOpaque()` from it in
     * `html_canvas_element.cc`, and `cc/layers/layer.h` defines that as a hint
     * that blending may be omitted.
     *
     * ★ The win lands in **the composite stage, not JS frame time**, so it does
     * not appear in a `performance.mark` profile — without knowing that you
     * wrongly conclude "measured it, no difference".
     *
     * The preconditions hold here: one dark theme, background fully painted
     * every frame. Unpainted regions become black rather than transparent,
     * which is moot when everything is painted.
     *
     * ⚠️ **Main canvas only.** The offscreens in `render/grid.ts` and
     * `render/animated-background.ts` composite **on top of** this one and need
     * alpha; setting it there makes the background tiles occlude each other.
     */
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let handle = 0;
    let cancelled = false;

    const runFrameGate = createFrameGate(configuration.frameGate);

    const runPresentationFrameStage = createPresentationFrameStage({ ...configuration.presentationFrameStage, ctx, domeEdgeControlForFrame });

    const frame = (now: number) => {
      if (cancelled) return;
      const frameState = runFrameGate(now);
      if (!frameState) {
        handle = requestAnimationFrame(frame);
        return;
      }
      const { tokens, world, width, height, dpr, dt } = frameState;

      if (!runDomeFrameStage(now, dt, tokens, world, width, height)) {
        handle = requestAnimationFrame(frame);
        return;
      }
      runWorldMotionFrameStage(now, dt, tokens, world, width, height);
      const {
        focusedNodeId,
        trailLensActive,
        hoveredNodeId,
        panelEmphasisNodeId,
        camera,
        farT,
        zoomRatio,
      } = runCameraFrameStage(now, dt, tokens, world, width);
      const clusterFrame = runClusterFrameStage(now, tokens, world);
      const effectiveExpanded = clusterFrame.effectiveExpanded;
      let frameClusteredIds = clusterFrame.frameClusteredIds;
      let frameChips = clusterFrame.frameChips;
      const batchAppearVisible = clusterFrame.batchAppearVisible;
      const realmFrame = runRealmFrameStage(
        now,
        dt,
        tokens,
        world,
        camera,
        width,
        height,
        effectiveExpanded,
        frameClusteredIds,
        frameChips,
      );
      frameClusteredIds = realmFrame.frameClusteredIds;
      frameChips = realmFrame.frameChips;
      const {
        realmWarding,
        realmTierKinds,
        realmDustParallax,
        realmDepthById,
        realmDepthParallax,
        realmOutsideReturnAlphaById,
      } = realmFrame;
      runRevealFrameStage(
        now,
        dt,
        tokens,
        world,
        effectiveExpanded,
        frameClusteredIds,
        frameChips,
        batchAppearVisible,
      );
      runPresentationFrameStage(frameChips, frameClusteredIds, realmTierKinds, now, dt, tokens, trailLensActive, camera, width, height, dpr, world, farT, zoomRatio, focusedNodeId, hoveredNodeId, panelEmphasisNodeId, realmWarding, realmDepthById, realmDepthParallax, realmDustParallax, realmOutsideReturnAlphaById);

      handle = requestAnimationFrame(frame);
    };

    /**
     * ★ **If the GPU reclaims the canvas the map goes blank** — and nobody is
     * told.
     *
     * An accelerated canvas's backing store can be reclaimed by the browser (a
     * GPU process crash, a driver reset, memory pressure on a backgrounded
     * tab). `contextlost` fires and **drawing silently becomes a no-op** — no
     * exception, no console error. The rAF loop keeps running while the screen
     * stays empty, so the user sees "the map disappeared" and we see nothing at
     * all.
     *
     * The spec's contract is simple: `preventDefault()` on `contextlost` makes
     * the browser attempt recovery and fire `contextrestored`. The next frame
     * redraws everything, so all we have to do is **prevent, and wake** — this
     * loop is a full redraw every frame, so no restore procedure is needed.
     * (`developer.chrome.com/blog/canvas2d`: "receive a callback and redraw".)
     */
    const onContextLost = (event: Event) => {
      event.preventDefault(); // Without this the browser does not attempt recovery.
    };
    const onContextRestored = () => {
      // The idle gate may be skipping frames, so mark the moment after
      // recovery as activity to guarantee the next frame is drawn.
      lastActiveMsRef.current = performance.now();
      viewportRebuildPendingRef.current = true;
    };
    canvas.addEventListener("contextlost", onContextLost);
    canvas.addEventListener("contextrestored", onContextRestored);

    handle = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
      canvas.removeEventListener("contextlost", onContextLost);
      canvas.removeEventListener("contextrestored", onContextRestored);
    };

  }, [beginCameraTween, cameraTokens, domeFitTarget, endGrowthReplay]);
}
