'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from '@/i18n/navigation';
import { firstReadableSlug } from './first-readable-slug';
import { pushRecentDoc, type VaultRecentKey } from '@/widgets/docs-vault';
import { replaceDocsVaultUrlState } from '../lib/url-state';
import type { VaultManifest } from '@/entities/docs-vault';

export function useDocSelection({
  documentScope,
  scopedDocSlugs,
  generalDocsHref,
  rememberActiveSlug,
  closeDocTabInWorkingSet,
  setSelectedSlug,
  setHighlightQuery,
  setRecentSlugs,
  setSampleWelcomeDismissed,
  setSourceTreeOpen,
  recentKey,
  replaceUrlState,
  selectedSlug,
  collectionDocs,
  collectionDocSlugs,
}: {
  documentScope: 'all' | 'ontology';
  scopedDocSlugs: ReadonlySet<string>;
  generalDocsHref: (slug: string) => string;
  rememberActiveSlug: (slug: string) => void;
  closeDocTabInWorkingSet: (slug: string, activeSlug: string | null) => string | null;
  setSelectedSlug: Dispatch<SetStateAction<string | null>>;
  setHighlightQuery: Dispatch<SetStateAction<string | undefined>>;
  setRecentSlugs: Dispatch<SetStateAction<string[]>>;
  setSampleWelcomeDismissed: Dispatch<SetStateAction<boolean>>;
  setSourceTreeOpen: Dispatch<SetStateAction<boolean>>;
  recentKey: VaultRecentKey;
  replaceUrlState: typeof replaceDocsVaultUrlState;
  selectedSlug: string | null;
  collectionDocs: VaultManifest['docs'];
  collectionDocSlugs: ReadonlySet<string>;
}) {
  const router = useRouter();
  const handleSelect = useCallback(
    (slug: string, query?: string) => {
      if (documentScope === 'ontology' && !scopedDocSlugs.has(slug)) {
        router.push(generalDocsHref(slug), { scroll: false });
        return;
      }
      rememberActiveSlug(slug);
      setSelectedSlug(slug);
      setHighlightQuery(query);
      setRecentSlugs(pushRecentDoc(recentKey, slug));
      replaceUrlState({ slug });
      setSampleWelcomeDismissed(true);
    },
    [documentScope, generalDocsHref, recentKey, rememberActiveSlug, replaceUrlState, router, scopedDocSlugs, setRecentSlugs, setHighlightQuery, setSampleWelcomeDismissed, setSelectedSlug],
  );

  // Closing the active tab moves left first, then right; closing the last falls back like default selection.
  const handleCloseDocTab = useCallback(
    (slug: string) => {
      const nextActiveSlug = closeDocTabInWorkingSet(slug, selectedSlug);
      if (nextActiveSlug) {
        handleSelect(nextActiveSlug);
        return;
      }
      const fallbackSlug = collectionDocSlugs.has('README')
        ? 'README'
        : firstReadableSlug(collectionDocs);
      if (fallbackSlug) {
        handleSelect(fallbackSlug);
      } else {
        setSelectedSlug(null);
        replaceUrlState({ slug: null });
      }
    },
    [
      closeDocTabInWorkingSet,
      selectedSlug,
      handleSelect,
      collectionDocSlugs,
      collectionDocs,
      replaceUrlState,
      setSelectedSlug,
    ],
  );

  const handleSelectFromSidebar = useCallback(
    (slug: string) => {
      handleSelect(slug);
      setSourceTreeOpen(false);
    },
    [handleSelect, setSourceTreeOpen],
  );
  return { handleSelect, handleCloseDocTab, handleSelectFromSidebar };
}
