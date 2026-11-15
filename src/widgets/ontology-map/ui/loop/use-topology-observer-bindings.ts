"use client";

import type { GlyphSet } from "@/shared/lib/preferences/appearance-preferences";
import {
  useEffect,
  type RefObject
} from "react";
import type { TopologyMapLensKind } from "../../model/visibility/path-lens";
import { type TierNameAnchor } from "../../model/dome-view/tier-names";
import { type ZoomTier } from "../../model/visibility/tier-visibility";
import type { HoverAvoidRect } from "../input/topology-pointer-types";

interface Dependencies {
    onGrowthReplayingChangeRef: RefObject<((running: boolean) => void) | undefined>;
  onGrowthReplayingChange: ((running: boolean) => void) | undefined;
  onZoomTierChangeRef: RefObject<((tier: ZoomTier) => void) | undefined>;
  onZoomTierChange: ((tier: ZoomTier) => void) | undefined;
  onDrawnCountChangeRef: RefObject<((drawn: number) => void) | undefined>;
  onDrawnCountChange: ((drawn: number) => void) | undefined;
  onDomeTierAnchorsChangeRef: RefObject<((anchors: readonly TierNameAnchor[] | null) => void) | undefined>;
  onDomeTierAnchorsChange: ((anchors: readonly TierNameAnchor[] | null) => void) | undefined;
  onHoverEdgeRef: RefObject<((edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null; } | null, position: { x: number; y: number; avoid: readonly HoverAvoidRect[]; } | null) => void) | undefined>;
  onHoverEdge: ((edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null; } | null, position: { x: number; y: number; avoid: readonly HoverAvoidRect[]; } | null) => void) | undefined;
  onEnterRealmRef: RefObject<((slug: string) => void) | undefined>;
  onEnterRealm: ((slug: string) => void) | undefined;
  realmEnterButtonElRef: RefObject<HTMLButtonElement | null>;
  realmEnterButtonRef: RefObject<HTMLButtonElement | null> | undefined;
  trailLensPropRef: RefObject<RefObject<boolean> | null>;
  trailLensActiveRef: RefObject<boolean> | undefined;
  trailBrushPropRef: RefObject<RefObject<string | null> | null>;
  trailHoverNodeIdRef: RefObject<string | null> | undefined;
  panelHoverPropRef: RefObject<RefObject<string | null> | null>;
  panelHoverNodeIdRef: RefObject<string | null> | undefined;
  focusedSlugRef: RefObject<string | null>;
  focusedSlug: string | null;
  hoveredNodeIdRef: RefObject<string | null>;
  hoveredEdgeRef: RefObject<{ sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null; } | null>;
  lastActiveMsRef: RefObject<number>;
  agentFocusNodeIdRef: RefObject<string | null>;
  agentFocusNodeId: string | null;
  spotlightIdsRef: RefObject<ReadonlySet<string> | null>;
  spotlightIds: ReadonlySet<string> | null;
  mapLensKindRef: RefObject<TopologyMapLensKind>;
  mapLensKind: TopologyMapLensKind;
  pathEdgeIdsRef: RefObject<ReadonlySet<string> | null>;
  pathEdgeIds: ReadonlySet<string> | null;
  glyphStyleRef: RefObject<"fill" | "line">;
  glyphSet: GlyphSet;
}

/** Refresh observer callbacks, DOM anchors, focus, and lens inputs before mode transitions. */
export function useTopologyObserverBindings({ onGrowthReplayingChangeRef,
  onGrowthReplayingChange,
  onZoomTierChangeRef,
  onZoomTierChange,
  onDrawnCountChangeRef,
  onDrawnCountChange,
  onDomeTierAnchorsChangeRef,
  onDomeTierAnchorsChange,
  onHoverEdgeRef,
  onHoverEdge,
  onEnterRealmRef,
  onEnterRealm,
  realmEnterButtonElRef,
  realmEnterButtonRef,
  trailLensPropRef,
  trailLensActiveRef,
  trailBrushPropRef,
  trailHoverNodeIdRef,
  panelHoverPropRef,
  panelHoverNodeIdRef,
  focusedSlugRef,
  focusedSlug,
  hoveredNodeIdRef,
  hoveredEdgeRef,
  lastActiveMsRef,
  agentFocusNodeIdRef,
  agentFocusNodeId,
  spotlightIdsRef,
  spotlightIds,
  mapLensKindRef,
  mapLensKind,
  pathEdgeIdsRef,
  pathEdgeIds,
  glyphStyleRef,
  glyphSet,
}: Dependencies) {
  // but their deterministic atmosphere still needs an entry epoch.
  useEffect(() => {
    }, []);

  useEffect(() => {
    onGrowthReplayingChangeRef.current = onGrowthReplayingChange;
  });

  useEffect(() => {
    onZoomTierChangeRef.current = onZoomTierChange;
    onDrawnCountChangeRef.current = onDrawnCountChange;
    onDomeTierAnchorsChangeRef.current = onDomeTierAnchorsChange;
  }, [onZoomTierChange, onDrawnCountChange, onDomeTierAnchorsChange, onZoomTierChangeRef, onDrawnCountChangeRef, onDomeTierAnchorsChangeRef]);

  useEffect(() => {
    onHoverEdgeRef.current = onHoverEdge;
  }, [onHoverEdge, onHoverEdgeRef]);

  useEffect(() => {
    onEnterRealmRef.current = onEnterRealm;
  });

  useEffect(() => {
    realmEnterButtonElRef.current = realmEnterButtonRef?.current ?? null;
  });

  useEffect(() => {
    trailLensPropRef.current = trailLensActiveRef ?? null;
    trailBrushPropRef.current = trailHoverNodeIdRef ?? null;
    panelHoverPropRef.current = panelHoverNodeIdRef ?? null;
  });

  useEffect(() => {
    focusedSlugRef.current = focusedSlug;
    /*
     * The hover ref is cleared on every focus transition: pointermove returns early while focused, so a
     * stale id would block ambient sleep and revive as a hover ring after deselect.
     */
    hoveredNodeIdRef.current = null;
    if (hoveredEdgeRef.current !== null) {
      hoveredEdgeRef.current = null;
      onHoverEdgeRef.current?.(null, null);
    }
    // Select and deselect are static state transitions, so force one more draw
    // even while idle skipping (symmetric with the selectedEdge effect).
    // Without this wake on deselect, the retained colorFocus fade freezes in
    // the idle gate and the ring stays at full opacity. Keying off the
    // focusedSlug → null transition guarantees the fade regardless of where the
    // event came from (empty-canvas click, Escape, the panel's close button).
    lastActiveMsRef.current = performance.now();
  }, [focusedSlug, focusedSlugRef, hoveredEdgeRef, hoveredNodeIdRef, lastActiveMsRef, onHoverEdgeRef]);

  useEffect(() => {
    agentFocusNodeIdRef.current = agentFocusNodeId;
  }, [agentFocusNodeId, agentFocusNodeIdRef]);

  useEffect(() => {
    spotlightIdsRef.current = spotlightIds;
  }, [spotlightIds, spotlightIdsRef]);

  useEffect(() => {
    mapLensKindRef.current = mapLensKind;
    pathEdgeIdsRef.current = pathEdgeIds;
  }, [mapLensKind, mapLensKindRef, pathEdgeIds, pathEdgeIdsRef]);

  // Phase 5 #21 — Apply new render style from the next frame when icon set changes.
  useEffect(() => {
    glyphStyleRef.current = glyphSet === "line" ? "line" : "fill";
  }, [glyphSet, glyphStyleRef]);

}
