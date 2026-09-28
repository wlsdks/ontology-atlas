"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { verifyHandlePermission } from "@/entities/local-fs-handle";

import type { FootprintTrailEntry } from "../lib/footprint-trail";
import {
  describePastTrailDay,
  newPastWalkId,
  refinePastWalkEntries,
  PAST_WALK_MIN_ENTRIES,
  type PastWalk,
} from "../lib/past-trail-record";
import { createVaultFilePastTrailStore, type PastTrailStore } from "../lib/past-trail-store";
import type { TopologyPastWalkRow } from "../ui/TopologyTrailChip";
import { derivedHook } from "@/shared/lib/derived-hook";

// Short, since the wait is a window in which closing loses the last step (tab-hide flushes it).
const PAST_TRAIL_SAVE_DEBOUNCE_MS = 600;

export interface UsePastTrailsArgs {
  /** Null while sample browsing. */
  vaultHandle: FileSystemDirectoryHandle | null;
  /** Decides whether the read-only notice applies. */
  vaultLoaded: boolean;
  /** The collapsed session trail (last visit per node). */
  footprintTrailEntries: readonly FootprintTrailEntry[];
  /** Stored walks are refined against it. */
  footprintNodeLookup: ReadonlyMap<string, { label: string; kind: string }>;
  /** Day-resolution labels are pinned to it for the session. */
  mountNowMs: number;
  setFootprintTrail: (trail: string[]) => void;
  /** Shared with the map selection effect. */
  lastVisitedNodeRef: RefObject<string | null>;
}

export interface UsePastTrailsResult {
  /** Excludes the walk in progress. */
  pastWalkRows: TopologyPastWalkRow[];
  /** Null when writes are possible. */
  pastTrailNotice: string | null;
  /** Also removes this session's written row, so "clear" is honest. */
  clearFootprintTrail: () => void;
  handleDeletePastWalk: (walkId: string) => void;
  handleClearPastWalks: () => void;
  /** Returns the last step to ego-focus, or null when the walk cannot replay on the current map. */
  replayPastWalk: (walkId: string) => string | null;
}

// Refined so the row's title and count match what a replay loads.
function refinePastWalks(
  pastWalks: readonly PastWalk[],
  footprintNodeLookup: UsePastTrailsArgs["footprintNodeLookup"],
) {
  const lookup = (id: string) => {
    const node = footprintNodeLookup.get(id);
    return node ? { title: node.label, kind: node.kind } : null;
  };
  return pastWalks.map((walk) => ({
    walk,
    entries: refinePastWalkEntries(walk.entries, lookup),
  }));
}
const useRefinedPastWalks = derivedHook(refinePastWalks);

/**
 * Keeps the walk that `?p=` loses on reload, in a vault file so web and app (different origins)
 * share it. Nothing expires it; clearing discards without a copy. Sample browsing writes nothing,
 * since browser storage would recreate the web/app split.
 */
export function usePastTrails({
  vaultHandle,
  vaultLoaded,
  footprintTrailEntries,
  footprintNodeLookup,
  mountNowMs,
  setFootprintTrail,
  lastVisitedNodeRef,
}: UsePastTrailsArgs): UsePastTrailsResult {
  const t = useTranslations("topology");
  const activeLocale = useLocale();
  const pastTrailStore = useMemo<PastTrailStore | null>(
    () => (vaultHandle ? createVaultFilePastTrailStore(vaultHandle) : null),
    [vaultHandle],
  );
  const [pastWalks, setPastWalks] = useState<PastWalk[]>([]);
  // Queried, never requested: prompting an explorer is friction; the list says why nothing is
  // kept.
  const [pastTrailWritable, setPastTrailWritable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const granted = vaultHandle
        ? (await verifyHandlePermission(vaultHandle, "readwrite")) === "granted"
        : false;
      if (!cancelled) setPastTrailWritable(granted);
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultHandle]);
  // State, not a ref, because the list render reads it to exclude the row being walked.
  const [sessionWalkId, setSessionWalkId] = useState<string>(newPastWalkId);
  // Tab-hide handlers read the latest values here.
  const pastTrailSaveRef = useRef<{
    store: PastTrailStore | null;
    entries: readonly FootprintTrailEntry[];
  }>({ store: null, entries: [] });
  useEffect(() => {
    pastTrailSaveRef.current = {
      store: pastTrailWritable ? pastTrailStore : null,
      entries: footprintTrailEntries,
    };
  }, [pastTrailStore, pastTrailWritable, footprintTrailEntries]);
  const flushPastTrail = useCallback(() => {
    const { store, entries } = pastTrailSaveRef.current;
    if (!store || entries.length < PAST_WALK_MIN_ENTRIES) return;
    void store.save(sessionWalkId, entries).then(setPastWalks);
  }, [sessionWalkId]);
  // A different vault is a different node-id space.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const walks = pastTrailStore ? await pastTrailStore.list() : [];
      if (cancelled) return;
      setSessionWalkId(newPastWalkId());
      setPastWalks(walks);
    })();
    return () => {
      cancelled = true;
    };
  }, [pastTrailStore]);
  // Overwrites the row after each debounced step, because an async write started as the page dies
  // never finishes.
  useEffect(() => {
    if (footprintTrailEntries.length < PAST_WALK_MIN_ENTRIES) return;
    const timer = window.setTimeout(flushPastTrail, PAST_TRAIL_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [footprintTrailEntries, flushPastTrail]);
  // The document is still alive at tab-hide, so the pending step is flushed here.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushPastTrail();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [flushPastTrail]);
  const clearFootprintTrail = useCallback(() => {
    lastVisitedNodeRef.current = null;
    setFootprintTrail([]);
    // Privacy: this session's written row goes too.
    setSessionWalkId(newPastWalkId());
    const store = pastTrailSaveRef.current.store;
    if (store) void store.remove(sessionWalkId).then(setPastWalks);
  }, [sessionWalkId, setFootprintTrail, lastVisitedNodeRef]);
  const handleDeletePastWalk = useCallback(
    (walkId: string) => {
      if (!pastTrailStore) return;
      void pastTrailStore.remove(walkId).then(setPastWalks);
    },
    [pastTrailStore],
  );
  const handleClearPastWalks = useCallback(() => {
    if (!pastTrailStore) return;
    setSessionWalkId(newPastWalkId());
    void pastTrailStore.clear().then(setPastWalks);
  }, [pastTrailStore]);
  const refinedPastWalks = useRefinedPastWalks(pastWalks, footprintNodeLookup);
  /**
   * Order matters: flush the current walk; switch to a new id (an unchanged route keeps the
   * original row's date); load the refined steps as the session trail; the caller ego-focuses the
   * returned last step.
   */
  const replayPastWalk = useCallback(
    (walkId: string): string | null => {
      const target = refinedPastWalks.find(({ walk }) => walk.id === walkId);
      if (!target || target.entries.length < PAST_WALK_MIN_ENTRIES) return null;
      flushPastTrail();
      setSessionWalkId(newPastWalkId());
      const ids = target.entries.map((entry) => entry.id);
      setFootprintTrail(ids);
      // Marks the last step visited so the caller's selection effect does not disturb the loaded
      // trail.
      const last = ids[ids.length - 1];
      lastVisitedNodeRef.current = last;
      return last;
    },
    [refinedPastWalks, flushPastTrail, setFootprintTrail, lastVisitedNodeRef],
  );
  // Row text is finished here, since the chip holds no i18n or date knowledge. Day resolution
  // only;
  // the walk in progress is excluded.
  const pastWalkRows = useMemo<TopologyPastWalkRow[]>(() => {
    // `Date.now()` in render breaks purity; a session-pinned day label is late only past midnight.
    const now = mountNowMs;
    const dayFormat = new Intl.DateTimeFormat(activeLocale, { month: "long", day: "numeric" });
    const yearFormat = new Intl.DateTimeFormat(activeLocale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return refinedPastWalks
      .filter(({ walk }) => walk.id !== sessionWalkId)
      .map(({ walk, entries }) => {
        const day = describePastTrailDay(walk.endedAt, now);
        const date =
          day.kind === "today"
            ? t("footprint.pastDateToday")
            : day.kind === "yesterday"
              ? t("footprint.pastDateYesterday")
              : day.kind === "sameYear"
                ? dayFormat.format(day.at)
                : yearFormat.format(day.at);
        // The chip's threshold: a one-place replay would hide the chip and its popover.
        const replayable = entries.length >= PAST_WALK_MIN_ENTRIES;
        // Only unreplayable walks keep their stored names, since the map no longer has them.
        const shown = replayable ? entries : walk.entries;
        return {
          id: walk.id,
          routeLabel: t("footprint.pastRouteLabel", {
            first: shown[0].title,
            last: shown[shown.length - 1].title,
          }),
          metaLabel: replayable
            ? t("footprint.pastRowMeta", { date, count: entries.length })
            : t("footprint.pastDeadRowMeta"),
          replayable,
          // No button means no label, or the string leaks elsewhere.
          ariaLabel: replayable
            ? t("footprint.pastReplayAriaLabel", { date, count: entries.length })
            : null,
        };
      });
  }, [refinedPastWalks, sessionWalkId, activeLocale, mountNowMs, t]);
  const pastTrailNotice =
    vaultLoaded && !pastTrailWritable ? t("footprint.pastReadOnlyNotice") : null;
  return {
    pastWalkRows,
    pastTrailNotice,
    clearFootprintTrail,
    handleDeletePastWalk,
    handleClearPastWalks,
    replayPastWalk,
  };
}
