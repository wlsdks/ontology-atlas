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
 * The React hook wiring `doc-tabs.ts`'s pure logic to `DocsVaultPage` state — the component
 * consumes only this hook, and localStorage plus effect timing are encapsulated here.
 *
 * Wiring contract: this hook never decides the active tab itself (the source of truth is the URL
 * `?slug=` → `selectedSlug` state). The caller observes `selectedSlug` changes and calls
 * `openTab`, and the tab strip's `×` calls `closeTab`.
 */

export interface UseOpenDocTabsArgs {
  /** The per-vault separation key — reuses `useDocsVaultPersistence`'s `recentKey`
   *  ('server' | `local:<handle.name>`). No second convention is invented. */
  sourceKey: string;
  /** The slugs that actually exist in the current vault — tabs for deleted documents are pruned quietly. */
  validSlugs: ReadonlySet<string>;
}

export interface UseOpenDocTabsResult {
  tabs: DocTab[];
  /** True only after the stored tabs for the current sourceKey have been read. */
  hydrated: boolean;
  /** The previously active document, for the caller to restore once when there is no URL deeplink. */
  restoredActiveSlug: string | null;
  /** Only an explicit user document selection is remembered under the separate active key. */
  rememberActiveSlug: (slug: string) => void;
  /** Already open → activate (and refresh the title); otherwise add a new tab (with LRU). */
  openTab: (slug: string, title: string) => void;
  /** Closes a tab and returns, synchronously, the slug to activate next (or null on the last
   *  tab) — the caller uses it to move the URL and `selectedSlug`. */
  closeTab: (slug: string, activeSlug: string | null) => string | null;
}

export function useOpenDocTabs({
  sourceKey,
  validSlugs,
}: UseOpenDocTabsArgs): UseOpenDocTabsResult {
  const [tabs, setTabs] = useState<DocTab[]>([]);
  const [hydratedSourceKey, setHydratedSourceKey] = useState<string | null>(null);
  const [storedActive, setStoredActive] = useState<{
    sourceKey: string;
    slug: string | null;
  } | null>(null);
  // A ref so `storeDocTabs` can read the sourceKey as of "now" without recreating openTab and
  // closeTab on every sourceKey change.
  const sourceKeyRef = useRef(sourceKey);

  // When the sourceKey (the vault) changes, the tab set is replaced wholesale with that vault's,
  // so sample tabs never leak into a local vault or vice versa.
  //
  // The storage read happens inside the updater because React runs a setState updater at the
  // "next render", not at the call. Reading the value and passing it in would miss — and
  // overwrite — what an openTab updater queued earlier in the same batch had written.
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

  // Every time the vault's real slug list changes (a document renamed or deleted, or the vault's
  // first load), tabs for vanished documents are pruned. Guarded so a loading state where
  // `validSlugs` is still empty does not hastily clear everything.
  useEffect(() => {
    if (validSlugs.size === 0) return;
    setTabs((prev) => {
      const next = pruneMissingDocTabs(prev, validSlugs);
      if (next !== prev) storeDocTabs(sourceKeyRef.current, next);
      return next;
    });
  }, [validSlugs]);

  // The merge base is always **storage**, never in-memory state. At mount the caller's
  // document-selection effect can run before hydration, leaving a window where `prev` is an empty
  // array, and right after a vault switch `prev` holds the *previous* vault's tabs, which would
  // leak into the new one. Making storage the source of truth removes both races — the owner's
  // contract is "the tabs are still there after restarting the app". The cost is one localStorage
  // read when opening a document.
  const openTab = useCallback((slug: string, title: string) => {
    setTabs(() => {
      const key = sourceKeyRef.current;
      const next = openOrActivateDocTab(readStoredDocTabs(key), { slug, title });
      storeDocTabs(key, next);
      return next;
    });
  }, []);

  // `closeTab` must return the next activation target **synchronously** so the caller can call
  // `handleSelect` inside the same event handler. The base is storage, as in openTab — a
  // synchronous read keeps the return-timing contract while removing the state dependency, so the
  // callback stays stable.
  const closeTab = useCallback(
    (slug: string, activeSlug: string | null): string | null => {
      const key = sourceKeyRef.current;
      const result = closeDocTab(readStoredDocTabs(key), slug, activeSlug);
      setTabs(result.tabs);
      storeDocTabs(key, result.tabs);
      return result.nextActiveSlug;
    },
    [],
  );

  const rememberActiveSlug = useCallback((slug: string) => {
    const key = sourceKeyRef.current;
    storeActiveDocSlug(key, slug);
    setStoredActive({ sourceKey: key, slug });
  }, []);

  const hydrated = hydratedSourceKey === sourceKey;
  const restoredActiveSlug = hydrated
    ? resolveRestoredActiveDocSlug({
        tabs,
        validSlugs,
        querySlug: null,
        storedActiveSlug:
          storedActive?.sourceKey === sourceKey ? storedActive.slug : null,
      })
    : null;

  return {
    tabs,
    hydrated,
    restoredActiveSlug,
    rememberActiveSlug,
    openTab,
    closeTab,
  };
}
