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
  args: UseTopologyLoopArgs;
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

/** Own preview, trail, lens, and appearance inputs consumed by drawing. */
export function useTopologyPresentationState({
  args,
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

  const annotationRef = useRef({ captions: args.relationCaptions, questions: args.reviewQuestionIds });

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

  // Appearance-preference props mirrored into refs so the frame loop can read
  // them without re-subscribing; an effect below refreshes each on change.
  const glyphStyleRef = useRef<"fill" | "line">(glyphSet === "line" ? "line" : "fill");

  const canvasBackgroundRef = useRef<CanvasBackground>(canvasBackground);

  /** Footprint preference and ink, mirrored because the frame loop reads them every frame. */
  const footprintPrefRef = useRef<FootprintPreference | null>(footprint ?? null);

  const footprintInkRef = useRef<FootprintInk>([232, 196, 122]);

  const footprintStepColorRef = useRef<string>("#e8c47a");

  /**
   * The moment one more step joined the trail — only that mark gets a short
   * arrival motion. Comparing length is enough: the trail only ever grows at
   * the end.
   */
  const footprintTrailLenRef = useRef(0);

  const footprintAppearAtRef = useRef(0);

  /**
   * Ambient sleep delay as a ref rather than a value, because closing over the
   * value would make it a dependency of the loop effect and restart the whole
   * rAF loop whenever the prop changes.
   */
  const ambientSleepDelayRef = useRef<number | undefined>(ambientSleepDelayMs);

  /** Footprint trail prop mirror — the rAF closure builds the recency rank from it each frame. */
  const visitedTrailRef = useRef<readonly string[]>(visitedTrail);

  /**
   * Keep-set for the trail lens, updated in place (clear + add) only when
   * `visitedTrail` changes, so a 60 fps loop never allocates a fresh Set per
   * frame. The lens adds zero per-frame allocation.
   */
  const visitedTrailSetRef = useRef<Set<string>>(new Set(visitedTrail));

  /**
   * The lens state that was last **drawn**. The idle gate compares it against
   * the live ref and counts "the lens just changed" as activity — the lens is a
   * ref rather than React state, so no effect can wake the loop and the frame
   * gate has to own waking instead.
   */
  const drawnTrailLensRef = useRef(false);

  /** Trail lens / brushing prop-ref mirrors, so the rAF closure reads the latest without deps (same idiom as `tourAnchorRef`). */
  const trailLensPropRef = useRef<RefObject<boolean> | null>(trailLensActiveRef ?? null);

  const trailBrushPropRef = useRef<RefObject<string | null> | null>(trailHoverNodeIdRef ?? null);

  const panelHoverPropRef = useRef<RefObject<string | null> | null>(panelHoverNodeIdRef ?? null);

  /** W6 agent visibility — mirrors `agentFocusNodeId` prop into a ref for the rAF closure, same pattern as `focusedSlugRef`. */
  const agentFocusNodeIdRef = useRef<string | null>(agentFocusNodeId);

  /** Guided tour — `tourAnchorNodeId` prop mirror, same pattern. */
  const tourAnchorNodeIdRef = useRef<string | null>(tourAnchorNodeId);

  /** Spotlight — prop mirror plus its on/off exponential ramp (0..1, stepped in the frame body). */
  const spotlightIdsRef = useRef<ReadonlySet<string> | null>(spotlightIds);

  const mapLensKindRef = useRef<TopologyMapLensKind>(mapLensKind);

  const pathEdgeIdsRef = useRef<ReadonlySet<string> | null>(pathEdgeIds);

  const spotlightRampRef = useRef(0);

  const spotlightDashOffsetRef = useRef(0);

  /**
   * Trail lens strength 0..1, on the **same** exponential ramp as the spotlight
   * so no new easing is introduced. Closing the popover keeps handing the lens
   * set down until this reaches 0, so the trail ink dies out on the ramp rather
   * than cutting.
   */
  const trailLensRampRef = useRef(0);

  /**
   * When the trail lens last opened (`performance.now()`), or 0 while it is closed.
   *
   * The lens ramp alone cannot stage the walk: it is one exponential approach for the whole
   * lens, so every star would light at once. This is the clock the ignition sweep runs off —
   * stars come up in the order they were walked, which is the order the person made them.
   */
  const trailLensOpenedAtRef = useRef(0);

  /** Mirror the tier-change callback into a ref for the rAF closure, and
   * track the last emitted tier so the callback fires only on transitions. */
  const onZoomTierChangeRef = useRef<typeof onZoomTierChange>(onZoomTierChange);

  const onDrawnCountChangeRef = useRef<typeof onDrawnCountChange>(onDrawnCountChange);

  /** The last count reported, so the callback fires on change rather than every frame. */
  const drawnNodeCountRef = useRef(-1);

  const lastZoomTierRef = useRef<ZoomTier | null>(null);

  /** Tier gate config mirror, shared by the rAF closure and the pointer handlers. */
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
