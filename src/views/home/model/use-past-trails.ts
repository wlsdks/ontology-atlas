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

// Debounce before writing the past trail, so every step does not hit the user's
// disk. Kept short on purpose: whatever we wait here is a window in which closing
// the window loses the last step (a flush on tab hide narrows it further).
const PAST_TRAIL_SAVE_DEBOUNCE_MS = 600;

export interface UsePastTrailsArgs {
  /** The open vault folder, or null while nothing is loaded (sample browsing). */
  vaultHandle: FileSystemDirectoryHandle | null;
  /** Whether a vault is loaded at all — decides if the read-only notice applies. */
  vaultLoaded: boolean;
  /** The collapsed session trail (last visit per node) the store persists. */
  footprintTrailEntries: readonly FootprintTrailEntry[];
  /** id → label/kind from the live map; stored walks are refined against it. */
  footprintNodeLookup: ReadonlyMap<string, { label: string; kind: string }>;
  /** Mount instant; day-resolution labels are pinned to it for the session. */
  mountNowMs: number;
  setFootprintTrail: (trail: string[]) => void;
  /** Visit-detection guard shared with the map selection effect. */
  lastVisitedNodeRef: RefObject<string | null>;
}

export interface UsePastTrailsResult {
  /** Rows for the trail chip; the walk in progress is excluded. */
  pastWalkRows: TopologyPastWalkRow[];
  /** Why nothing is being kept, or null when writes are possible. */
  pastTrailNotice: string | null;
  /** Discards the session trail and this session's already-written row. */
  clearFootprintTrail: () => void;
  handleDeletePastWalk: (walkId: string) => void;
  handleClearPastWalks: () => void;
  /**
   * Loads a stored walk as the session trail and returns its last step (the node
   * to ego-focus), or null when the walk cannot be replayed on the current map.
   */
  replayPastWalk: (walkId: string) => string | null;
}

/**
 * Past trails: the session trail dies on reload or window close while `?p=`
 * (where you are now) survives in the URL, so "where" was kept and "how you got
 * there" was the only thing lost. Past trails hold on to that walk; nothing
 * expires or idles it away. Clearing does the opposite and **discards without
 * keeping a copy** — for "clear" to be an honest name it has to remove this
 * session's already-written row too.
 *
 * It is stored as a **file inside the vault folder** (`past-trail-store.ts`): the
 * web and the installed app are different origins, so browser storage cannot carry
 * one past trail between them, and the only floor they share is the user's folder.
 *
 * With no vault open (sample browsing) nothing is written — there is no floor to
 * write to, and falling back to browser storage would recreate exactly that
 * web/app split. Sample browsing loses nothing by being volatile.
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
  // Write permission is **queried, never requested**. Confronting someone who came to
  // explore with "grant permission to keep a record" is friction. Sessions that
  // already have permission write quietly; the rest write nothing, and the past-trail
  // list says why.
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
  // This session's walk id; every write in this session overwrites that one row (one
  // session = one row). State rather than a ref because the list render reads it to
  // exclude the row currently being walked, so it must be readable during render.
  const [sessionWalkId, setSessionWalkId] = useState<string>(newPastWalkId);
  // Mirror so event handlers (tab hide) can read the latest values.
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
  // A different vault means a different node-id space: start a new walk and read that
  // vault's list.
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
  // **Overwrite in place while walking.** A file write is async, so one started as
  // the page dies never finishes — a design that fails at exactly the moment it must
  // work. Refreshing the same row on every step (after the debounce) means even a
  // force-quit leaves the last state already on disk.
  useEffect(() => {
    if (footprintTrailEntries.length < PAST_WALK_MIN_ENTRIES) return;
    const timer = window.setTimeout(flushPastTrail, PAST_TRAIL_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [footprintTrailEntries, flushPastTrail]);
  // At tab-hide the document is still alive and a write can complete, so the last
  // step still waiting out the debounce is flushed here.
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
    // Privacy valve: this session's already-written row is removed too.
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
  // Stored walks are refined against the live map so the row's text (title, count)
  // and the steps a replay actually loads are **the same thing**. A row that says 12
  // places and replays 9 is a quiet lie.
  const refinedPastWalks = useMemo(() => {
    const lookup = (id: string) => {
      const node = footprintNodeLookup.get(id);
      return node ? { title: node.label, kind: node.kind } : null;
    };
    return pastWalks.map((walk) => ({
      walk,
      entries: refinePastWalkEntries(walk.entries, lookup),
    }));
  }, [pastWalks, footprintNodeLookup]);
  /**
   * **Replays a past trail as the walk in progress.** The order is the contract:
   *
   * ① Flush the current walk first, including the last step still waiting out the
   *    debounce, so replaying costs nothing.
   * ② Switch to a new walk id. If the route is unchanged, `upsertPastWalk` skips
   *    re-storing it, so the original row keeps its own date and a new row appears only
   *    once walking on from here makes the route different.
   * ③ Load the refined steps as the session trail. The map's footprint rings are
   *    derived from that trail, so they re-stamp themselves with no render code
   *    touched.
   * ④ The caller ego-focuses the returned last step — "you are here" is the end of
   *    that trail.
   */
  const replayPastWalk = useCallback(
    (walkId: string): string | null => {
      const target = refinedPastWalks.find(({ walk }) => walk.id === walkId);
      if (!target || target.entries.length < PAST_WALK_MIN_ENTRIES) return null;
      flushPastTrail();
      setSessionWalkId(newPastWalkId());
      const ids = target.entries.map((entry) => entry.id);
      setFootprintTrail(ids);
      // Mark the last step as visited explicitly, so the visit-detection effect that
      // the caller's selection triggers does not disturb the trail just loaded. (It is
      // the same node either way, but stating it beats relying on that.)
      const last = ids[ids.length - 1];
      lastVisitedNodeRef.current = last;
      return last;
    },
    [refinedPastWalks, flushPastTrail, setFootprintTrail, lastVisitedNodeRef],
  );
  // Row text is finished here: the chip is pure chrome and holds no i18n or date
  // knowledge. Dates are **day resolution only** — showing hours and minutes would
  // make the list read as a behavioural timeline. The row currently being walked is
  // excluded, because the live trail above already shows it.
  const pastWalkRows = useMemo<TopologyPastWalkRow[]>(() => {
    // Reference instant is mount (`mountNowMs`): `Date.now()` during render violates
    // purity, and day-resolution labels do not go wrong by being pinned for a session
    // (only a window left open past midnight sees "today" change a day late).
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
        // Replaying needs enough surviving steps to still read as a walk (the same
        // threshold the chip uses): replaying a one-place walk makes the chip vanish
        // and takes the popover with it.
        const replayable = entries.length >= PAST_WALK_MIN_ENTRIES;
        // Names come from today's map; only unreplayable walks keep the names they
        // had, because there is no way to name something the map no longer has.
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
          // An unreplayable walk gets no label at all. Computing "replay 0 places"
          // when there is no button to attach it to only leaks that string onto some
          // other surface later.
          ariaLabel: replayable
            ? t("footprint.pastReplayAriaLabel", { date, count: entries.length })
            : null,
        };
      });
  }, [refinedPastWalks, sessionWalkId, activeLocale, mountNowMs, t]);
  // A read-only vault must not fail silently: the past-trail list says why nothing is
  // being kept.
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
