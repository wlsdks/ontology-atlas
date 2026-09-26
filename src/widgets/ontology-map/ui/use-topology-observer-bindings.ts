"use client";

import type { GlyphSet } from "@/shared/lib/appearance-preferences";
import {
  useEffect,
  type RefObject
} from "react";
import type { TopologyMapLensKind } from "../model/path-lens";
import { type TierNameAnchor } from "../model/tier-names";
import { type ZoomTier } from "../model/tier-visibility";
import type { HoverAvoidRect } from "./topology-pointer-handlers";

interface Dependencies {
  galaxy: boolean;
  galaxyEnteredAtRef: RefObject<number>;
  galaxyAtmosphereSeedRef: RefObject<number>;
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
  tourAnchorElRef: RefObject<HTMLDivElement | null>;
  tourAnchorRef: RefObject<HTMLDivElement | null> | undefined;
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
  tourAnchorNodeIdRef: RefObject<string | null>;
  tourAnchorNodeId: string | null;
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
export function useTopologyObserverBindings({
  galaxy,
  galaxyEnteredAtRef,
  galaxyAtmosphereSeedRef,
  onGrowthReplayingChangeRef,
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
  tourAnchorElRef,
  tourAnchorRef,
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
  tourAnchorNodeIdRef,
  tourAnchorNodeId,
  spotlightIdsRef,
  spotlightIds,
  mapLensKindRef,
  mapLensKind,
  pathEdgeIdsRef,
  pathEdgeIds,
  glyphStyleRef,
  glyphSet,
}: Dependencies) {

  // Initial Galaxy mounts do not pass through the mode-toggle branch below,
  // but their deterministic atmosphere still needs an entry epoch.
  useEffect(() => {
    if (galaxy && galaxyEnteredAtRef.current === 0) {
      galaxyEnteredAtRef.current = performance.now();
      galaxyAtmosphereSeedRef.current = Math.random();
    }
  }, [galaxy, galaxyAtmosphereSeedRef, galaxyEnteredAtRef]);

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
    tourAnchorElRef.current = tourAnchorRef?.current ?? null;
  });

  useEffect(() => {
    trailLensPropRef.current = trailLensActiveRef ?? null;
    trailBrushPropRef.current = trailHoverNodeIdRef ?? null;
    panelHoverPropRef.current = panelHoverNodeIdRef ?? null;
  });

  useEffect(() => {
    focusedSlugRef.current = focusedSlug;
    /*
     * The hover ref is cleared on every focus transition (bug sweep
     * 2026-09-01). The pointermove handler early-returns while a node is
     * focused, so the id captured at click time froze in this ref: the idle
     * gate read it as "interaction in progress" every frame and the ambient
     * sleep never engaged — a full-frame 60fps repaint for as long as the
     * mouse rested over the canvas (~130ms/s at 2k nodes). And deselecting via
     * Escape or the panel close without moving the mouse let the frame
     * resolver revive the stale id as a live hover ring on the
     * previously-clicked node. A fresh pointermove after deselect re-derives
     * the real hover.
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
    tourAnchorNodeIdRef.current = tourAnchorNodeId;
  }, [tourAnchorNodeId, tourAnchorNodeIdRef]);

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
