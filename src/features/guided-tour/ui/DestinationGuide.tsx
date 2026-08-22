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
  /** The current screen's destination. The map (`map`) and other routes are `null` —
   *  the map owns its own eight-step journey. */
  destination: DestinationTourId | null;
}

const NO_STEPS = Object.freeze([]) as readonly never[];

/** Retry interval and cap while waiting for a blocking surface to withdraw (≈30 seconds). */
const RETRY_MS = 1500;
const MAX_AUTO_START_ATTEMPTS = 20;

/**
 * First-visit guidance for docs, workshop, insights, projects, and history.
 *
 * Reuses **the same tour mechanism** the map used (card, scrim, cutout, progress
 * dots, skip) with only the per-destination step array swapped in. It lives in the
 * shell and remounts via `key` when the destination changes (resetting tour
 * state), so no card from the previous screen survives a navigation.
 *
 * Do-not-disturb contract: "seen" is recorded per destination
 * (`guided-tour:<id>:v1`), and with a record present it never auto-opens again.
 * Replaying it is a row in the settings menu.
 */
export function DestinationGuide({ destination }: DestinationGuideProps) {
  const steps = useMemo(
    () => (destination ? DESTINATION_TOURS[destination] : NO_STEPS),
    [destination],
  );
  const storageKey = destinationTourStatusKey(destination ?? "none");

  // Destination guides use DOM (testid) anchors only — canvas node anchors are map-only.
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

  // First-visit auto-start, at the same rhythm as the map (HomePage): open after
  // layout settles, and if at that moment a modal or blocking surface is up, or
  // document focus is elsewhere (a background tab load), do not stack — look again
  // shortly.
  //
  // The retry cap is longer than the map's because the workshop is a screen where
  // **the user's decision** (the entry choice) stands first on arrival. The wait for
  // a blocking surface to withdraw is a person's deliberation time rather than a
  // loading delay, so an 8-second cap would leave the workshop alone unguided.
  //
  // That waiting window (700ms + 1.5s × 20 ≈ 30s) was itself the site of a defect —
  // the map received a guard on 2026-07-26 that cancels the firing outright if the
  // user makes a substantive interaction first
  // (`watchGuidedTourAutoStartCancel`), but the five destination screens did not,
  // so a 1/2 card appeared belatedly over someone who had already opened a document
  // and started reading. To someone who began exploring on their own, "this is the
  // docs surface" is interference rather than guidance — the same situation the map
  // judged a defect and fixed, so the same guard is reused verbatim (zero new mechanisms).
  //
  // Cancelling blocks no path: no record is written, so the next visit brings the
  // chance again, and Settings › screen guidance › replay opens the same tour at any time.
  useEffect(() => {
    if (!destination) return undefined;
    if (readGuidedTourStatus(storageKey) !== null) return undefined;
  // The same global switch as the map — all six guides turn off in one place.
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

  // Close on Escape — a surface covering the screen must withdraw on Escape. The map's
  // own Escape ladder already includes the tour, so this is bound only here (avoiding a
  // double reaction). Closing is treated as 'skip' — it does not auto-open again.
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
  // Pressing a blocked spot withdraws the guidance — giving someone who arrived with a
  // mouse the same door as Escape. A second press goes where they were headed.
  return <GuidedTourOverlay tour={tour} onBlockedInteraction={skip} />;
}
