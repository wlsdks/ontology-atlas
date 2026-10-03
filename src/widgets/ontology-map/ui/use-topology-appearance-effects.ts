"use client";

import type { CanvasBackground, ExpandPreference, FootprintPreference } from "@/shared/lib/appearance-preferences";
import {
  FOOTPRINT_TONE_FALLBACK,
  FOOTPRINT_TONE_TOKEN
} from "@/shared/lib/appearance-preferences";
import type { FootprintInk } from "@/shared/lib/footprint-glyph";
import { NAVIGATION_INTENT_EVENT, NAVIGATION_YIELD_MS } from "@/shared/lib/navigation-intent";
import {
  useEffect,
  type RefObject
} from "react";
import { type TierRevealConfig } from "../model/tier-visibility";
import { createAnimatedBackground, type AnimatedBackground } from "../render/animated-background";
import type { UseTopologyLoopArgs } from "./topology-loop-contract";
import { requestOntologyMapFrame } from "./use-topology-frame-loop";

interface Dependencies {
  expandPrefRef: RefObject<ExpandPreference>;
  expand: ExpandPreference;
  canvasBackgroundRef: RefObject<CanvasBackground>;
  canvasBackground: CanvasBackground;
  animatedBgRef: RefObject<AnimatedBackground | null>;
  footprintPrefRef: RefObject<FootprintPreference | null>;
  footprint: FootprintPreference | null;
  footprintInkRef: RefObject<FootprintInk>;
  footprintStepColorRef: RefObject<string>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  bgPointerRef: RefObject<{ x: number; y: number; } | null>;
  navYieldUntilRef: RefObject<number>;
  hoveredNodeIdRef: RefObject<string | null>;
  lastActiveMsRef: RefObject<number>;
  ambientSleepDelayRef: RefObject<number | undefined>;
  ambientSleepDelayMs: number | undefined;
  tierRevealRef: RefObject<TierRevealConfig>;
  tierReveal: TierRevealConfig;
  selectedEdgeRef: RefObject<{ sourceId: string; targetId: string; relationType?: string; } | null>;
  selectedEdge: { sourceId: string; targetId: string; relationType?: string; } | null;
  annotationRef: RefObject<{ captions: ReadonlyMap<string, string> | null | undefined; questions: ReadonlySet<string> | null | undefined; }>;
  relationCaptions: UseTopologyLoopArgs["relationCaptions"];
  reviewQuestionIds: UseTopologyLoopArgs["reviewQuestionIds"];
}

export function useTopologyAppearanceEffects({
  expandPrefRef,
  expand,
  canvasBackgroundRef,
  canvasBackground,
  animatedBgRef,
  footprintPrefRef,
  footprint,
  footprintInkRef,
  footprintStepColorRef,
  canvasRef,
  bgPointerRef,
  navYieldUntilRef,
  hoveredNodeIdRef,
  lastActiveMsRef,
  ambientSleepDelayRef,
  ambientSleepDelayMs,
  tierRevealRef,
  tierReveal,
  selectedEdgeRef,
  selectedEdge,
  annotationRef,
  relationCaptions,
  reviewQuestionIds,
}: Dependencies) {

  useEffect(() => {
    expandPrefRef.current = expand;
  }, [expand, expandPrefRef]);

  useEffect(() => {
    canvasBackgroundRef.current = canvasBackground;
    animatedBgRef.current?.dispose();
    if (canvasBackground !== "web") {
      animatedBgRef.current = null;
      return;
    }
    const rootStyle = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string): string => {
      const raw = rootStyle.getPropertyValue(name).trim();
      return raw === "" ? fallback : raw;
    };
    const inkMax = Number(read("--canvas-bg-ink-max", "0.08"));
    animatedBgRef.current = createAnimatedBackground("web", {
      inkMax: Number.isFinite(inkMax) ? inkMax : 0.08,
      particleRgb: read("--canvas-bg-particle-rgb", "150, 165, 220"),
    });
    return () => {
      animatedBgRef.current?.dispose();
      animatedBgRef.current = null;
    };
  }, [animatedBgRef, canvasBackground, canvasBackgroundRef]);

  useEffect(() => {
    footprintPrefRef.current = footprint;
    if (!footprint) return;
    const rootStyle = getComputedStyle(document.documentElement);
    const hex = rootStyle.getPropertyValue(FOOTPRINT_TONE_TOKEN[footprint.tone]).trim();
    const parsed = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (parsed) {
      const n = parseInt(parsed[1], 16);
      footprintInkRef.current = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      footprintStepColorRef.current = hex.startsWith("#") ? hex : `#${parsed[1]}`;
    } else {
      const [r, g, bl] = FOOTPRINT_TONE_FALLBACK[footprint.tone];
      footprintInkRef.current = [r, g, bl];
      footprintStepColorRef.current = `rgb(${r}, ${g}, ${bl})`;
    }
  }, [footprint, footprintInkRef, footprintPrefRef, footprintStepColorRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      bgPointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      navYieldUntilRef.current = 0;
    };
    const onLeave = () => {
      bgPointerRef.current = null;
      requestOntologyMapFrame();
      if (hoveredNodeIdRef.current !== null) {
        hoveredNodeIdRef.current = null;
        lastActiveMsRef.current = performance.now();
      }
    };
    canvas.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [bgPointerRef, canvasRef, hoveredNodeIdRef, lastActiveMsRef, navYieldUntilRef]);

  useEffect(() => {
    const onIntent = () => {
      navYieldUntilRef.current = performance.now() + NAVIGATION_YIELD_MS;
    };
    window.addEventListener(NAVIGATION_INTENT_EVENT, onIntent);
    return () => window.removeEventListener(NAVIGATION_INTENT_EVENT, onIntent);
  }, [navYieldUntilRef]);

  useEffect(() => {
    ambientSleepDelayRef.current = ambientSleepDelayMs;
  }, [ambientSleepDelayMs, ambientSleepDelayRef]);

  useEffect(() => {
    tierRevealRef.current = tierReveal;
  }, [tierReveal, tierRevealRef]);

  useEffect(() => {
    selectedEdgeRef.current = selectedEdge;
    lastActiveMsRef.current = performance.now();
  }, [lastActiveMsRef, selectedEdge, selectedEdgeRef]);

  useEffect(() => {
    annotationRef.current = { captions: relationCaptions, questions: reviewQuestionIds };
    lastActiveMsRef.current = performance.now();
  }, [annotationRef, relationCaptions, reviewQuestionIds, lastActiveMsRef]);

}
