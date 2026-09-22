"use client";

import {
  useEffect,
  type RefObject
} from "react";

interface Dependencies {
  panelEmphasisNodeIdRef: RefObject<string | null>;
  emphasizedNeighborSlug: string | null;
  visitedTrailRef: RefObject<readonly string[]>;
  visitedTrail: readonly string[];
  visitedTrailSetRef: RefObject<Set<string>>;
  lastActiveMsRef: RefObject<number>;
}

/** Refresh trail membership and panel emphasis after cluster expansion. */
export function useTopologyTrailInputs({
  panelEmphasisNodeIdRef,
  emphasizedNeighborSlug,
  visitedTrailRef,
  visitedTrail,
  visitedTrailSetRef,
  lastActiveMsRef,
}: Dependencies) {

  useEffect(() => {
    panelEmphasisNodeIdRef.current = emphasizedNeighborSlug;
  }, [emphasizedNeighborSlug, panelEmphasisNodeIdRef]);

  useEffect(() => {
    visitedTrailRef.current = visitedTrail;
    // The keep-set is updated in place; the frame loop only reads it.
    const keep = visitedTrailSetRef.current;
    keep.clear();
    for (const id of visitedTrail) keep.add(id);
    // Adding or clearing a footprint is a static state transition: draw once
    // more even while idle skipping, same wake contract as edge selection.
    lastActiveMsRef.current = performance.now();
  }, [lastActiveMsRef, visitedTrail, visitedTrailRef, visitedTrailSetRef]);

}
