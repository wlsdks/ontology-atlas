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
import { scheduleStateSync } from "../persistence";

export interface UseOpenDocTabsArgs {
  sourceKey: string;
  validSlugs: ReadonlySet<string>;
  visibleSlugs?: ReadonlySet<string>;
}

export interface UseOpenDocTabsResult {
  tabs: DocTab[];
  hydrated: boolean;
  restoredActiveSlug: string | null;
  rememberActiveSlug: (slug: string) => void;
  openTab: (slug: string, title: string) => void;
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
