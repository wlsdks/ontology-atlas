'use client';

import { useEffect, useState } from 'react';
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
  const { routePathname } = address;
  const { vaultSlugs, scopedDocSlugs, normalizedQuerySlug, docsBySlug } = vault;
  const { recentKey } = src;
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
  return {
    openDocTabs,
    openDocTabsHydrated,
    rememberActiveSlug,
    closeDocTabInWorkingSet,
    pendingRestoredActiveSlug,
  };
}
