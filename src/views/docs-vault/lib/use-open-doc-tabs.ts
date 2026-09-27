"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeDocTab,
  openOrActivateDocTab,
  pruneMissingDocTabs,
  readStoredActiveDocSlug,
  readStoredDocTabs,
  resolveRestoredActiveDocSlug,
  storeActiveDocSlug,
  storeDocTabs,
  type DocTab,
} from "./doc-tabs";
import { scheduleStateSync } from "./persistence";

/**
 * Wires `doc-tabs.ts` to `DocsVaultPage`. It never decides the active tab: the URL `?slug=`
 * does. The caller calls `openTab` on `selectedSlug` changes and the strip's `×` calls `closeTab`.
 */

export interface UseOpenDocTabsArgs {
  /** Reuses `useDocsVaultPersistence`'s `recentKey` ('server' | `local:<handle.name>`). */
  sourceKey: string;
  /** Tabs for slugs missing here are pruned quietly. */
  validSlugs: ReadonlySet<string>;
  /** Hidden tabs stay persisted for another reader. */
  visibleSlugs?: ReadonlySet<string>;
}

export interface UseOpenDocTabsResult {
  tabs: DocTab[];
  hydrated: boolean;
  /** Restored once by the caller when there is no URL deeplink. */
  restoredActiveSlug: string | null;
  /** Only an explicit user selection is remembered under the active key. */
  rememberActiveSlug: (slug: string) => void;
  /** Activates (and retitles) an open tab, otherwise adds one with LRU eviction. */
  openTab: (slug: string, title: string) => void;
  /** Returns the next slug to activate synchronously, or null for the last tab. */
  closeTab: (slug: string, activeSlug: string | null) => string | null;
}

export function useOpenDocTabs({
  sourceKey,
  validSlugs,
  visibleSlugs,
}: UseOpenDocTabsArgs): UseOpenDocTabsResult {
  const [tabs, setTabs] = useState<DocTab[]>([]);
  const [hydratedSourceKey, setHydratedSourceKey] = useState<string | null>(null);
  const [storedActive, setStoredActive] = useState<{
    sourceKey: string;
    slug: string | null;
  } | null>(null);
  // A ref keeps `openTab` and `closeTab` stable across sourceKey changes.
  const sourceKeyRef = useRef(sourceKey);

  // Replace the tab set wholesale on a vault change so tabs never leak between vaults. Read
  // storage inside the updater, or an `openTab` update queued in the same batch is overwritten.
  useEffect(() => {
    sourceKeyRef.current = sourceKey;
    scheduleStateSync(() => {
      setTabs(() => readStoredDocTabs(sourceKey));
      setStoredActive({
        sourceKey,
        slug: readStoredActiveDocSlug(sourceKey),
      });
      setHydratedSourceKey(sourceKey);
    });
  }, [sourceKey]);

  // Guarded so an empty `validSlugs` while loading does not clear everything.
  useEffect(() => {
    if (validSlugs.size === 0) return;
    setTabs((prev) => {
      const next = pruneMissingDocTabs(prev, validSlugs);
      if (next !== prev) storeDocTabs(sourceKeyRef.current, next);
      return next;
    });
  }, [validSlugs]);

  // Merge from storage, never from state: before hydration `prev` is empty, and right after a
  // vault switch it holds the previous vault's tabs.
  const openTab = useCallback((slug: string, title: string) => {
    setTabs(() => {
      const key = sourceKeyRef.current;
      const next = openOrActivateDocTab(readStoredDocTabs(key), { slug, title });
      storeDocTabs(key, next);
      return next;
    });
  }, []);

  // Returns synchronously so the caller can `handleSelect` in the same handler; reads storage
  // like `openTab`, so the callback stays stable.
  const closeTab = useCallback(
    (slug: string, activeSlug: string | null): string | null => {
      const key = sourceKeyRef.current;
      const storedTabs = readStoredDocTabs(key);
      const result = closeDocTab(storedTabs, slug, activeSlug);
      const visibleTabs = visibleSlugs
        ? storedTabs.filter((tab) => visibleSlugs.has(tab.slug))
        : storedTabs;
      const visibleResult = closeDocTab(visibleTabs, slug, activeSlug);
      setTabs(result.tabs);
      storeDocTabs(key, result.tabs);
      return visibleResult.nextActiveSlug;
    },
    [visibleSlugs],
  );

  const rememberActiveSlug = useCallback((slug: string) => {
    const key = sourceKeyRef.current;
    storeActiveDocSlug(key, slug);
    setStoredActive({ sourceKey: key, slug });
  }, []);

  const hydrated = hydratedSourceKey === sourceKey;
  const visibleTabs = visibleSlugs
    ? tabs.filter((tab) => visibleSlugs.has(tab.slug))
    : tabs;
  const restoredActiveSlug = hydrated
    ? resolveRestoredActiveDocSlug({
        tabs: visibleTabs,
        validSlugs: visibleSlugs ?? validSlugs,
        querySlug: null,
        storedActiveSlug:
          storedActive?.sourceKey === sourceKey ? storedActive.slug : null,
      })
    : null;

  return {
    tabs: visibleTabs,
    hydrated,
    restoredActiveSlug,
    rememberActiveSlug,
    openTab,
    closeTab,
  };
}
