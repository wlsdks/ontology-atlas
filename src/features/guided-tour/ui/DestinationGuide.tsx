"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { canAutoStartGuidedTour } from "../model/auto-start-guard";
import { watchGuidedTourAutoStartCancel } from "../model/auto-start-interaction";
import { readGuideAutoStart } from "@/shared/lib/guide-auto-start";
import { useRegisterGuideReplay } from "../model/guide-replay-context";
import { resolveAnchorRect } from "../model/resolve-anchor-rect";
import {
  DESTINATION_TOURS,
  type DestinationTourId,
  type TourAnchor,
} from "../model/tour-steps";
import { destinationTourStatusKey, readGuidedTourStatus } from "../model/tour-storage";
import { useGuidedTour } from "../model/use-guided-tour";
import { GuidedTourOverlay } from "./GuidedTourOverlay";

export interface DestinationGuideProps {
  /** `null` for the map and other routes; the map owns its own journey. */
  destination: DestinationTourId | null;
}

const NO_STEPS = Object.freeze([]) as readonly never[];

/** Retry interval and cap while a blocking surface withdraws (≈30 seconds). */
const RETRY_MS = 1500;
const MAX_AUTO_START_ATTEMPTS = 20;

/**
 * First-visit guidance for docs, workshop, insights, projects and history, reusing the map's
 * tour mechanism with a per-destination step array. It remounts via `key` on navigation so no
 * card survives a screen change. "Seen" is recorded per destination (`guided-tour:<id>:v1`)
 * and never auto-opens again; replay is a settings row.
 */
export function DestinationGuide({ destination }: DestinationGuideProps) {
  const steps = useMemo(
    () => (destination ? DESTINATION_TOURS[destination] : NO_STEPS),
    [destination],
  );
  const storageKey = destinationTourStatusKey(destination ?? "none");

  // Destination guides use DOM (testid) anchors only; canvas node anchors are map-only.
  const canResolveAnchor = useCallback((anchor: TourAnchor) => {
    if (anchor === null) return true;
    if (anchor.type !== "testid") return false;
    return resolveAnchorRect(anchor.value) !== null;
  }, []);

  const tour = useGuidedTour({
    steps,
    hasSelection: false,
    canResolveAnchor,
    storageKey,
  });

  const start = tour.start;
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useRegisterGuideReplay(destination ? () => startRef.current() : null);

  // Opens after layout settles, and while a modal or blocking surface is up or focus is elsewhere
  // it looks again shortly. The cap (700ms + 1.5s × 20 ≈ 30s) is longer than the map's because
  // the workshop's entry choice is a person deliberating, not a loading delay. The map's
  // `watchGuidedTourAutoStartCancel` cancels the firing when the user acts first; no record is
  // written, so the next visit and Settings replay still reach it.
  useEffect(() => {
    if (!destination) return undefined;
    if (readGuidedTourStatus(storageKey) !== null) return undefined;
  // The same global switch as the map.
    if (!readGuideAutoStart()) return undefined;
    let timerId = 0;
    let attempts = 0;
    let fired = false;
    const tick = () => {
      if (fired) return;
      if (canAutoStartGuidedTour(document)) {
        fired = true;
        stopInteractionWatch();
        startRef.current();
        return;
      }
      attempts += 1;
      if (attempts < MAX_AUTO_START_ATTEMPTS) timerId = window.setTimeout(tick, RETRY_MS);
    };
    const stopInteractionWatch = watchGuidedTourAutoStartCancel(() => {
      fired = true;
      window.clearTimeout(timerId);
    });
    timerId = window.setTimeout(tick, 700);
    return () => {
      window.clearTimeout(timerId);
      stopInteractionWatch();
    };
  }, [destination, storageKey]);

  // A surface covering the screen withdraws on Escape. The map's Escape ladder already includes
  // the tour, so this binds only here; closing counts as 'skip'.
  const open = tour.open;
  const skip = tour.skip;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, skip]);

  if (!destination) return null;
  // Pressing a blocked spot withdraws the guidance, the mouse user's Escape; a second press
  // goes where they were headed.
  return <GuidedTourOverlay tour={tour} onBlockedInteraction={skip} />;
}
