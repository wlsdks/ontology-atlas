"use client";
import type { GlyphSet } from "@/shared/lib/appearance-preferences";
import type { OntologyMapProps } from "./OntologyMap";

import type { CanvasBackground, FootprintPreference } from "@/shared/lib/appearance-preferences";
import type { FootprintInk } from "@/shared/lib/footprint-glyph";
import {
  useEffect,
  useRef,
  type RefObject
} from "react";
import type { TopologyMapLensKind } from "../model/path-lens";
import { type TierRevealConfig, type ZoomTier } from "../model/tier-visibility";
import type { UseTopologyLoopArgs } from "./topology-loop-contract";

interface Dependencies {
  relationCaptions: UseTopologyLoopArgs["relationCaptions"];
  reviewQuestionIds: UseTopologyLoopArgs["reviewQuestionIds"];
  previewEdge: NonNullable<OntologyMapProps["previewEdge"]> | null;
  glyphSet: GlyphSet;
  canvasBackground: CanvasBackground;
  footprint: FootprintPreference | null;
  ambientSleepDelayMs: number | undefined;
  visitedTrail: readonly string[];
  trailLensActiveRef: RefObject<boolean> | undefined;
  trailHoverNodeIdRef: RefObject<string | null> | undefined;
  panelHoverNodeIdRef: RefObject<string | null> | undefined;
  agentFocusNodeId: string | null;
  tourAnchorNodeId: string | null;
  spotlightIds: ReadonlySet<string> | null;
  mapLensKind: TopologyMapLensKind;
  pathEdgeIds: ReadonlySet<string> | null;
  onZoomTierChange: ((tier: ZoomTier) => void) | undefined;
  onDrawnCountChange: ((drawn: number) => void) | undefined;
  tierReveal: TierRevealConfig;
}

export function useTopologyPresentationState({
  relationCaptions,
  reviewQuestionIds,
  previewEdge,
  glyphSet,
  canvasBackground,
  footprint,
  ambientSleepDelayMs,
  visitedTrail,
  trailLensActiveRef,
  trailHoverNodeIdRef,
  panelHoverNodeIdRef,
  agentFocusNodeId,
  tourAnchorNodeId,
  spotlightIds,
  mapLensKind,
  pathEdgeIds,
  onZoomTierChange,
  onDrawnCountChange,
  tierReveal,
}: Dependencies) {

  const annotationRef = useRef({ captions: relationCaptions, questions: reviewQuestionIds });

  const previewEdgePropRef = useRef(previewEdge);

  const previewEdgeHeldRef = useRef(previewEdge);

  const previewSignatureRef = useRef<string | null>(null);

  const previewAlphaRef = useRef(previewEdge ? 1 : 0);

  const previewCommitRef = useRef(previewEdge?.phase === "committing" ? 1 : 0);

  const previewTransitionRef = useRef<{
    start: number;
    duration: number;
    fromAlpha: number;
    toAlpha: number;
    fromCommit: number;
    toCommit: number;
  } | null>(null);

  useEffect(() => {
    previewEdgePropRef.current = previewEdge;
    if (previewEdge) previewEdgeHeldRef.current = previewEdge;
  }, [previewEdge]);

  const glyphStyleRef = useRef<"fill" | "line">(glyphSet === "line" ? "line" : "fill");

  const canvasBackgroundRef = useRef<CanvasBackground>(canvasBackground);

  const footprintPrefRef = useRef<FootprintPreference | null>(footprint ?? null);

  const footprintInkRef = useRef<FootprintInk>([232, 196, 122]);

  const footprintStepColorRef = useRef<string>("#e8c47a");

  const footprintTrailLenRef = useRef(0);

  const footprintAppearAtRef = useRef(0);

  const ambientSleepDelayRef = useRef<number | undefined>(ambientSleepDelayMs);

  const visitedTrailRef = useRef<readonly string[]>(visitedTrail);

  const visitedTrailSetRef = useRef<Set<string>>(new Set(visitedTrail));

  const drawnTrailLensRef = useRef(false);

  const trailLensPropRef = useRef<RefObject<boolean> | null>(trailLensActiveRef ?? null);

  const trailBrushPropRef = useRef<RefObject<string | null> | null>(trailHoverNodeIdRef ?? null);

  const panelHoverPropRef = useRef<RefObject<string | null> | null>(panelHoverNodeIdRef ?? null);

  const agentFocusNodeIdRef = useRef<string | null>(agentFocusNodeId);

  const tourAnchorNodeIdRef = useRef<string | null>(tourAnchorNodeId);

  const spotlightIdsRef = useRef<ReadonlySet<string> | null>(spotlightIds);

  const mapLensKindRef = useRef<TopologyMapLensKind>(mapLensKind);

  const pathEdgeIdsRef = useRef<ReadonlySet<string> | null>(pathEdgeIds);

  const spotlightRampRef = useRef(0);

  const spotlightDashOffsetRef = useRef(0);

  const trailLensRampRef = useRef(0);

  const trailLensOpenedAtRef = useRef(0);

  const onZoomTierChangeRef = useRef<typeof onZoomTierChange>(onZoomTierChange);

  const onDrawnCountChangeRef = useRef<typeof onDrawnCountChange>(onDrawnCountChange);

  const drawnNodeCountRef = useRef(-1);

  const lastZoomTierRef = useRef<ZoomTier | null>(null);

  const tierRevealRef = useRef<TierRevealConfig>(tierReveal);
  return {
    annotationRef, previewEdgePropRef, previewEdgeHeldRef, previewSignatureRef,
    previewAlphaRef, previewCommitRef, previewTransitionRef, glyphStyleRef, canvasBackgroundRef,
    footprintPrefRef, footprintInkRef, footprintStepColorRef, footprintTrailLenRef, footprintAppearAtRef,
    ambientSleepDelayRef, visitedTrailRef, visitedTrailSetRef, drawnTrailLensRef, trailLensPropRef,
    trailBrushPropRef, panelHoverPropRef, agentFocusNodeIdRef, tourAnchorNodeIdRef, spotlightIdsRef,
    mapLensKindRef, pathEdgeIdsRef, spotlightRampRef, spotlightDashOffsetRef, trailLensRampRef,
    trailLensOpenedAtRef, onZoomTierChangeRef, onDrawnCountChangeRef, drawnNodeCountRef, lastZoomTierRef,
    tierRevealRef,
  };
}
