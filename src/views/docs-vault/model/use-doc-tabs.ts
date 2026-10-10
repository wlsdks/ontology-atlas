'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import { scheduleStateSync } from '../lib/persistence';
import { settleDocsVaultAddress } from '../lib/url-state';
import { useOpenDocTabs } from '../lib/use-open-doc-tabs';
import type { useDocsVaultAddress } from './use-docs-vault-url';
import type { useDocsVaultSource } from './use-docs-vault-source';
import type { useVaultManifest } from './use-vault-manifest';

export function useDocTabs({
  address,
  vault,
  src,
  selectedSlug,
  setSelectedSlug,
}: {
  address: ReturnType<typeof useDocsVaultAddress>;
  vault: ReturnType<typeof useVaultManifest>;
  src: ReturnType<typeof useDocsVaultSource>;
  selectedSlug: string | null;
  setSelectedSlug: (slug: string | null) => void;
}) {
  const { routePathname, replaceUrlState } = address;
  const { vaultSlugs, scopedDocSlugs, normalizedQuerySlug, docsBySlug, staticVault } = vault;
  const { recentKey, source, vaultScopeSettled } = src;
  const locale = useLocale();
  // `sourceKey` reuses `recentKey`; selectedSlug and the URL stay the active source of truth.
  const {
    tabs: openDocTabs,
    hydrated: openDocTabsHydrated,
    restoredActiveSlug,
    rememberActiveSlug,
    openTab: openDocTab,
    closeTab: closeDocTabInWorkingSet,
  } = useOpenDocTabs({
    sourceKey: recentKey,
    validSlugs: vaultSlugs,
    visibleSlugs: scopedDocSlugs,
  });
  // Restore the last active tab once per vault, only after hydration, so the default README
  // does not open first and overwrite `lastActivatedAt`.
  const [restoredDocTabsSourceKey, setRestoredDocTabsSourceKey] =
    useState<string | null>(null);
  const pendingRestoredActiveSlug =
    openDocTabsHydrated &&
    restoredDocTabsSourceKey !== recentKey &&
    !normalizedQuerySlug
      ? restoredActiveSlug
      : null;
  useEffect(() => {
    if (!openDocTabsHydrated || restoredDocTabsSourceKey === recentKey) {
      return;
    }
    const restoredSlug = normalizedQuerySlug ? null : restoredActiveSlug;
    if (restoredSlug) settleDocsVaultAddress(routePathname, restoredSlug);
    scheduleStateSync(() => {
      setRestoredDocTabsSourceKey(recentKey);
      if (restoredSlug) setSelectedSlug(restoredSlug);
    });
  }, [
    openDocTabsHydrated,
    normalizedQuerySlug,
    recentKey,
    restoredActiveSlug,
    restoredDocTabsSourceKey,
    routePathname,
    setSelectedSlug,
  ]);
  // Every path that changes `selectedSlug` converges here, so opening a tab needs no call-site code.
  useEffect(() => {
    if (!openDocTabsHydrated) return;
    if (
      pendingRestoredActiveSlug &&
      selectedSlug !== pendingRestoredActiveSlug
    ) {
      return;
    }
    if (!selectedSlug) return;
    if (!scopedDocSlugs.has(selectedSlug)) return;
    const doc = docsBySlug.get(selectedSlug);
    if (!doc) return;
    openDocTab(selectedSlug, resolveLocaleDisplayName(doc.frontmatter, locale, doc.title));
  }, [
    selectedSlug,
    scopedDocSlugs,
    docsBySlug,
    locale,
    openDocTab,
    openDocTabsHydrated,
    pendingRestoredActiveSlug,
  ]);

  /**
   * Said once, then gone: the unresolved slug is removed from the address after it is captured,
   * so the same verdict does not reappear on every visit.
   */
  const [missingQuerySlug, setMissingQuerySlug] = useState<string | null>(null);
  /**
   * Slugs the app itself just renamed or deleted are not "missing"; `useSearchParams` still
   * holds the old slug after a `history.replaceState`.
   */
  const appTouchedSlugsRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!normalizedQuerySlug || docsBySlug.size === 0) return;
    const touched = appTouchedSlugsRef.current;
    if (touched.size > 0 && !touched.has(normalizedQuerySlug)) {
      appTouchedSlugsRef.current = new Set();
    } else if (touched.has(normalizedQuerySlug)) {
      return;
    }
    if (docsBySlug.has(normalizedQuerySlug)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sticky: `prev ?? slug`
      setMissingQuerySlug((prev) => (prev === normalizedQuerySlug ? null : prev));
      return;
    }
    // Before the vault loads and boot settles the scope, the answer is "not known yet".
    if (!vaultScopeSettled) return;
    setMissingQuerySlug((prev) => prev ?? normalizedQuerySlug);
  }, [normalizedQuerySlug, docsBySlug, vaultScopeSettled]);

  /**
   * `?slug=` means something only inside one vault, so a vault switch clears it. It is not
   * the `recentKey`, which collapses both samples into `'server'` and hides a sample switch.
   */
  const vaultScope = source === 'local' ? recentKey : `sample:${staticVault.source}`;
  /**
   * A scope change before settling is boot, not a vault switch; clearing then would delete
   * a deeplink someone just handed over.
   */
  const vaultScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!vaultScopeSettled) return;
    const previous = vaultScopeRef.current;
    vaultScopeRef.current = vaultScope;
    if (previous === null || previous === vaultScope) return;
    setMissingQuerySlug(null);
    replaceUrlState({ slug: null });
  }, [vaultScope, vaultScopeSettled, replaceUrlState]);
  return {
    openDocTabs,
    openDocTabsHydrated,
    rememberActiveSlug,
    closeDocTabInWorkingSet,
    pendingRestoredActiveSlug,
    missingQuerySlug,
    vaultScope,
    appTouchedSlugsRef,
  };
}
