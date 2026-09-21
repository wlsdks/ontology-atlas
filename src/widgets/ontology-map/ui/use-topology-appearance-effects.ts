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
  args: UseTopologyLoopArgs;
}

/** Maintain appearance resources and native activity listeners after mode transitions. */
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
  args,
}: Dependencies) {

  // An expansion-preference change takes effect from the next frame. Swapping
  // the value needs no world rebuild; the layout effect below re-solves placement.
  useEffect(() => {
    expandPrefRef.current = expand;
  }, [expand, expandPrefRef]);

  /**
   * On a canvas-background change, **dispose** the particle engine for the dot
   * background and build a fresh one for any other variant. Keeping the engine
   * alive under "dot" would step an invisible buffer every frame.
   */
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

  /**
   * Resolve the footprint ink: read whichever of the two colour tokens the
   * preference names and expand it to RGB. The canvas cannot read CSS
   * variables, so this happens once per preference change rather than per frame.
   */
  useEffect(() => {
    footprintPrefRef.current = footprint;
    if (!footprint) return;
    const rootStyle = getComputedStyle(document.documentElement);
    // The shared map — `FOOTPRINT_TONE_TOKEN` is the only place a tone names its token, so
    // the settings preview and this loop cannot disagree about what a tone looks like.
    const hex = rootStyle.getPropertyValue(FOOTPRINT_TONE_TOKEN[footprint.tone]).trim();
    const parsed = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (parsed) {
      const n = parseInt(parsed[1], 16);
      footprintInkRef.current = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      footprintStepColorRef.current = hex.startsWith("#") ? hex : `#${parsed[1]}`;
    } else {
      // Token missing or in rgba() form — fall back to the default ink, which
      // beats footprints disappearing.
      const [r, g, bl] = FOOTPRINT_TONE_FALLBACK[footprint.tone];
      footprintInkRef.current = [r, g, bl];
      footprintStepColorRef.current = `rgb(${r}, ${g}, ${bl})`;
    }
  }, [footprint, footprintInkRef, footprintPrefRef, footprintStepColorRef]);

  /**
   * Cursor tracking for the animated backgrounds only. Takes the coordinates
   * from a native `passive` listener rather than extending the large pointer
   * handler factory — that one owns hit-testing, dragging and pinching, and
   * touching its contract for one background coordinate is not worth the cost.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      bgPointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // A hand moving over the map means the navigation was cancelled, or the
      // user decided to stay here.
      navYieldUntilRef.current = 0;
    };
    const onLeave = () => {
      bgPointerRef.current = null;
      /*
       * **Leaving the canvas also clears node hover** (measured 2026-08-19).
       *
       * Node hover (`hoveredNodeIdRef`) used to be released only by a
       * pointermove onto empty space *inside* the canvas, so leaving the window
       * with the cursor over a node — flicking out, releasing a drag at the
       * edge, Cmd-Tabbing away — left an emphasis on it forever. And because
       * `emphasisTarget` reads that ref, the idle gate **never closed again**:
       * 2D at 2,000 nodes burned 130 ms/s even 48 s after the last input, where
       * the same screen idles at 3 ms/s.
       *
       * Pushing the activity timestamp *after* clearing matters: without it the
       * gate closes right there and nobody draws the frame where the emphasis
       * is gone, freezing the ring lit (same reason as `focusFadeSettling`).
       */
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

  /**
   * **A screen being left is not worth drawing** (measured 2026-08-19).
   *
   * Time-to-new-screen after a rail tap depended on where you started. To the
   * docs screen under 4× throttling: 194 ms from 2D at 2,000 nodes, but
   * **529 ms from 3D at 2,000 with the dome auto-spinning, and 745 ms at
   * 3,000**. The new screen was not slow — the map kept fully repainting up to
   * the moment it left, competing for frame budget with the new screen's first
   * render.
   *
   * The signal is one shared-layer event (`shared/lib/navigation-intent.ts`);
   * the map knowing the nav rail, or the rail knowing the map's loop, would be
   * an FSD violation.
   *
   * **Recorded as a deadline, released on its own.** A cancelled navigation
   * cannot stop the map forever: it resumes when the cap passes, and one
   * pointer event over the canvas releases it sooner. Same discipline as
   * `idle-gate` being designed without wake wiring.
   */
  useEffect(() => {
    const onIntent = () => {
      navYieldUntilRef.current = performance.now() + NAVIGATION_YIELD_MS;
    };
    window.addEventListener(NAVIGATION_INTENT_EVENT, onIntent);
    return () => window.removeEventListener(NAVIGATION_INTENT_EVENT, onIntent);
  }, [navYieldUntilRef]);

  // Ambient sleep delay differs per surface (the gateway's is shorter).
  useEffect(() => {
    ambientSleepDelayRef.current = ambientSleepDelayMs;
  }, [ambientSleepDelayMs, ambientSleepDelayRef]);

  useEffect(() => {
    tierRevealRef.current = tierReveal;
  }, [tierReveal, tierRevealRef]);

  useEffect(() => {
    selectedEdgeRef.current = selectedEdge;
    // A selection change is a static state transition: draw once more even
    // while idle skipping.
    lastActiveMsRef.current = performance.now();
  }, [lastActiveMsRef, selectedEdge, selectedEdgeRef]);

  useEffect(() => {
    annotationRef.current = { captions: args.relationCaptions, questions: args.reviewQuestionIds };
    lastActiveMsRef.current = performance.now();
  }, [annotationRef, args.relationCaptions, args.reviewQuestionIds, lastActiveMsRef]);

}
