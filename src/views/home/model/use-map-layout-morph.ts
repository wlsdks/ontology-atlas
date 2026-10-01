"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { disarmMapLayoutMorph, isMapLayoutMorphArmed, type MapLayoutView } from "@/shared/lib/map-layout-morph-store";
import { chooseLayoutSwitch, installMapLayoutMorphProbe, type MapLayoutMorphJob } from "@/widgets/ontology-map";

type MapSurfaceView = "map" | "territories" | "hex";

const surfaceOf = (view: MapLayoutView): MapSurfaceView => (view === "territories" || view === "hex" ? view : "map");

interface MorphTransition {
  id: number;
  job: MapLayoutMorphJob;
  phase: "travel" | "handoff";
  drawn: boolean;
}

export interface MapLayoutMorph {
  surface: MapSurfaceView | null;
  arrivedByMorph: boolean;
  overlay: {
    id: number;
    job: MapLayoutMorphJob;
    holding: boolean;
    onTravelEnd: () => void;
    onDone: () => void;
  } | null;
  onIncomingDrawn: () => void;
}

export function useMapLayoutMorph({
  view,
  reducedMotion,
  conceptCount,
  vaultKey,
  parentOf,
  targetFor,
  frameRef,
}: {
  view: MapLayoutView;
  reducedMotion: boolean;
  conceptCount: number;
  vaultKey: string;
  parentOf: () => ReadonlyMap<string, string>;
  targetFor: (view: MapLayoutView) => MapLayoutMorphJob["target"];
  frameRef: RefObject<HTMLElement | null>;
}): MapLayoutMorph {
  const [shown, setShown] = useState(view);
  const [shownVault, setShownVault] = useState(vaultKey);
  const [transition, setTransition] = useState<MorphTransition | null>(null);

  if (shownVault !== vaultKey) {
    setShownVault(vaultKey);
    setShown(view);
    if (transition) setTransition(null);
  } else if (shown !== view) {
    setShown(view);
    const fromOverlay = transition?.phase === "travel";
    const kind = chooseLayoutSwitch({ from: shown, to: view, armed: isMapLayoutMorphArmed(), reducedMotion, conceptCount, fromOverlay });
    const swapsSurface = fromOverlay || surfaceOf(shown) !== surfaceOf(view);
    if (kind === "ghost" || kind === "fade") {
      const job: MapLayoutMorphJob = {
        mode: kind,
        reducedMotion,
        parentOf,
        target: kind === "ghost" ? targetFor(view) : null,
        source: swapsSurface ? null : () => frameRef.current?.querySelector("canvas") ?? null,
      };
      setTransition((prev) => ({
        id: (prev?.id ?? 0) + 1,
        job,
        phase: kind === "ghost" ? "travel" : "handoff",
        drawn: !swapsSurface,
      }));
    } else if (transition) {
      setTransition(null);
    }
  }

  useEffect(() => {
    installMapLayoutMorphProbe();
    return disarmMapLayoutMorph;
  }, []);

  const id = transition?.id ?? 0;
  const onTravelEnd = useCallback(() => {
    setTransition((t) => (t && t.id === id && t.phase === "travel" ? { ...t, phase: "handoff" } : t));
  }, [id]);
  const onDone = useCallback(() => {
    setTransition((t) => (t && t.id === id ? null : t));
  }, [id]);
  const onIncomingDrawn = useCallback(() => {
    setTransition((t) => (t && t.phase === "handoff" && !t.drawn ? { ...t, drawn: true } : t));
  }, []);

  return {
    surface: transition?.phase === "travel" ? null : surfaceOf(view),
    arrivedByMorph: transition !== null,
    overlay: transition ? { id: transition.id, job: transition.job, holding: !transition.drawn, onTravelEnd, onDone } : null,
    onIncomingDrawn,
  };
}
