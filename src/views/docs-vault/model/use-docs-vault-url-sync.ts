'use client';

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import type { VaultManifest } from '@/entities/docs-vault';
import { usePrevious } from '@/shared/lib/use-previous';
import type { DocsTreeGroup, DocsTreeSort } from '@/widgets/docs-vault';
import { shouldShowSampleWelcomeNote } from '../lib/docs-vault-collection';
import {
  scheduleStateSync,
  type DocsVaultSource as Source,
  type DocsVaultView,
} from '../lib/persistence';
import type { replaceDocsVaultUrlState } from '../lib/url-state';

export function useDocsVaultUrlSync({
  searchParams,
  queryView,
  queryTreeSort,
  queryTreeGroup,
  view,
  setView,
  treeSort,
  setTreeSort,
  treeGroup,
  setTreeGroup,
  replaceUrlState,
  setAdvancedOpen,
  documentScope,
  legacyEntry,
  manifest,
  normalizedQuerySlug,
  scopedDocSlugs,
  selectedSlug,
  setSelectedSlug,
  vaultScopeSettled,
  legacyRedirectToLibrary,
  generalDocsHref,
  legacyLibraryRedirectHref,
  source,
  sampleWelcomeDismissed,
}: {
  searchParams: ReturnType<typeof useSearchParams>;
  queryView: DocsVaultView;
  queryTreeSort: DocsTreeSort;
  queryTreeGroup: DocsTreeGroup;
  view: DocsVaultView;
  setView: Dispatch<SetStateAction<DocsVaultView>>;
  treeSort: DocsTreeSort;
  setTreeSort: Dispatch<SetStateAction<DocsTreeSort>>;
  treeGroup: DocsTreeGroup;
  setTreeGroup: Dispatch<SetStateAction<DocsTreeGroup>>;
  replaceUrlState: typeof replaceDocsVaultUrlState;
  setAdvancedOpen: (open: boolean) => void;
  documentScope: 'all' | 'ontology';
  legacyEntry: boolean;
  manifest: VaultManifest;
  normalizedQuerySlug: string | null;
  scopedDocSlugs: ReadonlySet<string>;
  selectedSlug: string | null;
  setSelectedSlug: Dispatch<SetStateAction<string | null>>;
  vaultScopeSettled: boolean;
  legacyRedirectToLibrary: boolean;
  generalDocsHref: (slug: string) => string;
  legacyLibraryRedirectHref: () => string;
  source: Source;
  sampleWelcomeDismissed: boolean;
}) {
  const router = useRouter();
  // Once on mount, backfill from localStorage when the URL carries no value.
  const initialPrefsAppliedRef = useRef(false);
  useEffect(() => {
    if (initialPrefsAppliedRef.current) return;
    initialPrefsAppliedRef.current = true;
    scheduleStateSync(() => {
      if (!searchParams?.has('view')) setView(queryView);
    });
  }, [searchParams, queryView, setView]);

  // URL to state only; user actions push state to the URL themselves.
  const outOfScopeQuerySlug =
    documentScope === 'ontology' &&
    !legacyEntry &&
    normalizedQuerySlug &&
    manifest.docs.some((doc) => doc.slug === normalizedQuerySlug) &&
    !scopedDocSlugs.has(normalizedQuerySlug)
      ? normalizedQuerySlug
      : null;
  useEffect(() => {
    if (!vaultScopeSettled || !outOfScopeQuerySlug) return;
    router.replace(generalDocsHref(outOfScopeQuerySlug), { scroll: false });
  }, [generalDocsHref, outOfScopeQuerySlug, router, vaultScopeSettled]);
  useEffect(() => {
    if (!vaultScopeSettled || !legacyRedirectToLibrary) return;
    router.replace(legacyLibraryRedirectHref(), { scroll: false });
  }, [legacyLibraryRedirectHref, legacyRedirectToLibrary, router, vaultScopeSettled]);
  const showSampleWelcomeNote = shouldShowSampleWelcomeNote({
    source,
    normalizedQuerySlug: normalizedQuerySlug ?? selectedSlug,
    dismissed: sampleWelcomeDismissed,
  });
  const prevQuerySlug = usePrevious(normalizedQuerySlug);
  useEffect(() => {
    if (outOfScopeQuerySlug) return;
    if (prevQuerySlug !== normalizedQuerySlug && normalizedQuerySlug !== selectedSlug) {
      scheduleStateSync(() => setSelectedSlug(normalizedQuerySlug));
    }
  }, [normalizedQuerySlug, outOfScopeQuerySlug, prevQuerySlug, selectedSlug, setSelectedSlug]);
  const prevQueryView = usePrevious(queryView);
  useEffect(() => {
    if (prevQueryView !== queryView && queryView !== view) {
      scheduleStateSync(() => setView(queryView));
    }
  }, [prevQueryView, queryView, view, setView]);
  // Order also changes through back, shared links and agent URLs.
  const prevQueryTreeSort = usePrevious(queryTreeSort);
  useEffect(() => {
    if (prevQueryTreeSort !== queryTreeSort && queryTreeSort !== treeSort) {
      scheduleStateSync(() => setTreeSort(queryTreeSort));
    }
  }, [prevQueryTreeSort, queryTreeSort, treeSort, setTreeSort]);
  const prevQueryTreeGroup = usePrevious(queryTreeGroup);
  useEffect(() => {
    if (prevQueryTreeGroup !== queryTreeGroup && queryTreeGroup !== treeGroup) {
      scheduleStateSync(() => setTreeGroup(queryTreeGroup));
    }
  }, [prevQueryTreeGroup, queryTreeGroup, treeGroup, setTreeGroup]);

  const handleViewChange = useCallback(
    (next: DocsVaultView) => {
      setView(next);
      replaceUrlState({ view: next });
      setAdvancedOpen(false);
    },
    [replaceUrlState, setAdvancedOpen, setView],
  );

  const handleTreeSortChange = useCallback(
    (next: DocsTreeSort) => {
      setTreeSort(next);
      replaceUrlState({ sort: next });
    },
    [replaceUrlState, setTreeSort],
  );

  const handleTreeGroupChange = useCallback(
    (next: DocsTreeGroup) => {
      setTreeGroup(next);
      replaceUrlState({ group: next });
    },
    [replaceUrlState, setTreeGroup],
  );
  return {
    outOfScopeQuerySlug,
    showSampleWelcomeNote,
    handleViewChange,
    handleTreeSortChange,
    handleTreeGroupChange,
  };
}
