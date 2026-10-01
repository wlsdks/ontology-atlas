"use client";
import { useEffect, useEffectEvent, type RefObject } from "react";
import type { CameraAxes } from "../engine/camera";
import { createLightFrameStage } from "../light/light-frame-stage";
import { projectDomeEdgeControl } from '../model/dome-edge';
import { createCameraFrameStage } from "./topology-camera-frame-stage";
import { createClusterFrameStage } from "./topology-cluster-frame-stage";
import { createDomeFrameStage } from "./topology-dome-frame-stage";
import { createFrameGate, FRAME_ASLEEP, FRAME_NOT_READY } from "./topology-frame-gate";
import { createPresentationFrameStage } from "./topology-presentation-frame-stage";
import { createRealmFrameStage } from "./topology-realm-frame-stage";
import { createRevealFrameStage } from "./topology-reveal-frame-stage";
import { type WorldEdge } from "./topology-world";
import { createWorldMotionFrameStage } from "./topology-world-motion-frame-stage";

interface Configuration {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  projection: Pick<Parameters<typeof createPresentationFrameStage>[0], "domeRuntimeRef" | "reducedMotionRef" | "neuralRampRef"> & { cameraRef: RefObject<CameraAxes>; };
  recovery: Pick<Parameters<typeof createFrameGate>[0], "lastActiveMsRef" | "viewportRebuildPendingRef"> & {
    wakeFrameLoopRef: RefObject<() => void>;
  };
  domeFrameStage: Parameters<typeof createDomeFrameStage>[0];
  worldMotionFrameStage: Parameters<typeof createWorldMotionFrameStage>[0];
  cameraFrameStage: Parameters<typeof createCameraFrameStage>[0];
  clusterFrameStage: Parameters<typeof createClusterFrameStage>[0];
  realmFrameStage: Parameters<typeof createRealmFrameStage>[0];
  revealFrameStage: Parameters<typeof createRevealFrameStage>[0];
  frameGate: Omit<Parameters<typeof createFrameGate>[0], "lightActiveRef">;
  presentationFrameStage: Omit<Parameters<typeof createPresentationFrameStage>[0], "ctx" | "domeEdgeControlForFrame">;
}

const frameRequests = new Set<() => void>();

export function requestOntologyMapFrame(): void {
  for (const requestFrame of frameRequests) requestFrame();
}

export function useTopologyFrameLoop(configuration: Configuration) {
  const getConfiguration = useEffectEvent(() => configuration);
  const { beginCameraTween, cameraTokens, domeFitTarget } = configuration.domeFrameStage;
  const { endGrowthReplay } = configuration.frameGate;
  useEffect(() => {
    getConfiguration().recovery.wakeFrameLoopRef.current();
  });
  useEffect(() => {
    const configuration = getConfiguration();
    const { canvasRef, projection, recovery } = configuration;
    const { domeRuntimeRef, cameraRef, reducedMotionRef, neuralRampRef } = projection;
    const { lastActiveMsRef, viewportRebuildPendingRef, wakeFrameLoopRef } = recovery;
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let handle = 0;
    let cancelled = false;
    const requestFrame = () => {
      if (handle === 0 && !cancelled) handle = requestAnimationFrame(frame);
    };

    const lightActiveRef = { current: false };
    const runFrameGate = createFrameGate({ ...configuration.frameGate, lightActiveRef });

    const runPresentationFrameStage = createPresentationFrameStage({ ...configuration.presentationFrameStage, ctx, domeEdgeControlForFrame });
    const light = createLightFrameStage({ canvasRef, refs: configuration.presentationFrameStage, lightActiveRef, requestFrame });

    const frame = (now: number) => {
      handle = 0;
      if (cancelled) return;
      const frameState = runFrameGate(now);
      if (frameState === FRAME_ASLEEP) return;
      if (frameState === FRAME_NOT_READY) {
        requestFrame();
        return;
      }
      const { tokens, world, width, height, dpr, dt } = frameState;

      if (!runDomeFrameStage(now, dt, tokens, world, width, height)) {
        requestFrame();
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
      light.prepare(now, tokens, world, camera, width, height, focusedNodeId, trailLensActive, frameClusteredIds);
      runPresentationFrameStage(frameChips, frameClusteredIds, realmTierKinds, now, dt, tokens, trailLensActive, camera, width, height, dpr, world, farT, zoomRatio, focusedNodeId, hoveredNodeId, panelEmphasisNodeId, realmWarding, realmDepthById, realmDepthParallax, realmDustParallax, realmOutsideReturnAlphaById);
      light.render();

      requestFrame();
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
    };
    const onContextRestored = () => {
      viewportRebuildPendingRef.current = true;
      lastActiveMsRef.current = performance.now();
    };
    canvas.addEventListener("contextlost", onContextLost);
    canvas.addEventListener("contextrestored", onContextRestored);

    wakeFrameLoopRef.current = requestFrame;
    frameRequests.add(requestFrame);
    requestFrame();
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
      frameRequests.delete(requestFrame);
      if (wakeFrameLoopRef.current === requestFrame) wakeFrameLoopRef.current = () => {};
      canvas.removeEventListener("contextlost", onContextLost);
      canvas.removeEventListener("contextrestored", onContextRestored);
      light.dispose();
    };

  }, [beginCameraTween, cameraTokens, domeFitTarget, endGrowthReplay]);
}
