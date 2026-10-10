'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useVaultSessionIdentityScope } from '@/entities/vault-session';
import type { VaultManifest } from '@/entities/docs-vault';
import { useDocsBodyIndex, pushRecentDoc } from '@/widgets/docs-vault';
import {
  buildTagIndexForDocs,
  filterDocsByCollection,
  firstReadableSlug,
  followMovedSlugs,
  resolveDocsVaultCollection,
  resolveInitialDocsCollection,
  shouldDeferDocsVaultDefaultSelection,
  type DocsVaultCollection,
  type DocsVaultDocCollection,
} from '../lib/docs-vault-collection';
import { scheduleStateSync } from '../lib/persistence';
import { settleDocsVaultAddress } from '../lib/url-state';
import type { useDocsVaultAddress } from './use-docs-vault-url';
import type { useDocsVaultSource } from './use-docs-vault-source';
import type { useDocTabs } from './use-doc-tabs';
import type { useVaultManifest } from './use-vault-manifest';

export function useDocCollection({
  address,
  vault,
  src,
  tabs,
  documentScope,
  initialCollection,
  selectedSlug,
  setSelectedSlug,
  setActiveTag,
  setSampleWelcomeDismissed,
  paletteOpen,
  getDocContent,
}: {
  address: ReturnType<typeof useDocsVaultAddress>;
  vault: ReturnType<typeof useVaultManifest>;
  src: ReturnType<typeof useDocsVaultSource>;
  tabs: ReturnType<typeof useDocTabs>;
  documentScope: 'all' | 'ontology';
  initialCollection: DocsVaultDocCollection;
  selectedSlug: string | null;
  setSelectedSlug: (slug: string | null) => void;
  setActiveTag: (tag: string | null) => void;
  setSampleWelcomeDismissed: (dismissed: boolean) => void;
  paletteOpen: boolean;
  getDocContent: ((slug: string) => Promise<string>) | undefined;
}) {
  const { routePathname, replaceUrlState, generalDocsHref } = address;
  const {
    manifest,
    scopedDocs,
    scopedDocSlugs,
    selectedDoc,
    outOfScopeQuerySlug,
    normalizedQuerySlug,
  } = vault;
  const { recentKey, recentSlugs, setRecentSlugs, pinnedSlugs, vaultScopeSettled } = src;
  const {
    openDocTabsHydrated,
    pendingRestoredActiveSlug,
    rememberActiveSlug,
    closeDocTabInWorkingSet,
  } = tabs;
  const router = useRouter();
  const vaultSessionScope = useVaultSessionIdentityScope();
  const [docCollection, setDocCollection] = useState<DocsVaultCollection>(initialCollection);
  const [highlightQuery, setHighlightQuery] = useState<string | undefined>(undefined);
  const [paletteOpened, setPaletteOpened] = useState(false);
  if (paletteOpen && !paletteOpened) setPaletteOpened(true);
  const collectionDocs = useMemo(
    () => documentScope === 'ontology'
      ? scopedDocs
      : filterDocsByCollection(manifest.docs, docCollection),
    [docCollection, documentScope, manifest.docs, scopedDocs],
  );
  const collectionTags = useMemo(
    () => buildTagIndexForDocs(collectionDocs),
    [collectionDocs],
  );
  const collectionTagCounts = useMemo(
    () =>
      Object.entries(collectionTags).map(([tag, slugs]) => ({
        tag,
        count: slugs.length,
      })),
    [collectionTags],
  );
  const collectionManifest = useMemo<VaultManifest>(
    () => ({
      ...manifest,
      docs: collectionDocs,
      tags: collectionTags,
    }),
    [collectionDocs, collectionTags, manifest],
  );
  const collectionDocSlugs = useMemo(
    () => new Set(collectionDocs.map((doc) => doc.slug)),
    [collectionDocs],
  );

  const collectionCounts = useMemo<Record<DocsVaultCollection, number>>(
    () => ({
      all: scopedDocs.length,
      guides: documentScope === 'ontology'
        ? 0
        : filterDocsByCollection(manifest.docs, 'guides').length,
      ontology: documentScope === 'ontology'
        ? scopedDocs.length
        : filterDocsByCollection(manifest.docs, 'ontology').length,
    }),
    [documentScope, manifest.docs, scopedDocs],
  );
  const collectionPinnedSlugs = useMemo(
    () => followMovedSlugs(pinnedSlugs, manifest.aliases).filter((slug) => collectionDocSlugs.has(slug)),
    [collectionDocSlugs, manifest.aliases, pinnedSlugs],
  );
  const collectionRecentSlugs = useMemo(
    () => followMovedSlugs(recentSlugs, manifest.aliases).filter((slug) => collectionDocSlugs.has(slug)),
    [collectionDocSlugs, manifest.aliases, recentSlugs],
  );
  // Palette full-text index from the first open, keyed by mtime.
  const { bodyIndex: docsBodyIndex, indexing: docsBodyIndexing } = useDocsBodyIndex({
    docs: collectionDocs,
    enabled: paletteOpened,
    scope: vaultSessionScope,
    getDocContent,
  });

  // Reinterpret the default collection once, when documents first land, so the first screen
  // is not empty; repeating it would undo a deliberately chosen empty collection.
  const initialCollectionResolvedRef = useRef(false);
  useEffect(() => {
    if (documentScope === 'ontology') return;
    if (initialCollectionResolvedRef.current) return;
    if (manifest.docs.length === 0) return;
    initialCollectionResolvedRef.current = true;
    const resolved = resolveInitialDocsCollection(manifest.docs, initialCollection);
    if (resolved !== docCollection) {
      scheduleStateSync(() => setDocCollection(resolved));
    }
  }, [docCollection, documentScope, initialCollection, manifest.docs]);

  useEffect(() => {
    if (documentScope === 'ontology') return;
    if (!selectedDoc) return;
    // Picking a document never narrows the "all documents" view.
    if (docCollection === 'all') return;
    const nextCollection = resolveDocsVaultCollection(selectedDoc);
    if (nextCollection !== docCollection) {
      scheduleStateSync(() => setDocCollection(nextCollection));
    }
  }, [docCollection, documentScope, selectedDoc]);

  const pickDefaultDocForCollection = useCallback(
    (collection: DocsVaultCollection): string | null => {
      const docs = documentScope === 'ontology'
        ? scopedDocs
        : filterDocsByCollection(manifest.docs, collection);
      const slugs = new Set(docs.map((doc) => doc.slug));
      const candidates = [
        ...pinnedSlugs,
        ...recentSlugs,
        collection !== 'ontology' ? 'README' : null,
        collection !== 'ontology' ? 'FEATURES' : null,
        collection !== 'ontology' ? 'PRODUCT-DIRECTION' : null,
        collection !== 'ontology' ? 'ARCHITECTURE' : null,
        firstReadableSlug(docs),
      ];
      return (
        candidates.find((slug): slug is string => typeof slug === 'string' && slugs.has(slug)) ??
        null
      );
    },
    [documentScope, manifest.docs, pinnedSlugs, recentSlugs, scopedDocs],
  );

  const handleCollectionChange = useCallback(
    (next: DocsVaultCollection) => {
      if (documentScope === 'ontology') return;
      setDocCollection(next);
      setActiveTag(null);
      const nextSlugs = new Set(
        filterDocsByCollection(manifest.docs, next).map((doc) => doc.slug),
      );
      if (selectedSlug && nextSlugs.has(selectedSlug)) return;

      const nextSlug = pickDefaultDocForCollection(next);
      setSelectedSlug(nextSlug);
      replaceUrlState({ slug: nextSlug });
    },
    [documentScope, manifest.docs, pickDefaultDocForCollection, replaceUrlState, selectedSlug, setActiveTag, setSelectedSlug],
  );

  useEffect(() => {
    if (!openDocTabsHydrated || pendingRestoredActiveSlug) return;
    if (outOfScopeQuerySlug) return;
    if (selectedSlug && scopedDocSlugs.has(selectedSlug)) return;
    if (
      shouldDeferDocsVaultDefaultSelection({
        normalizedQuerySlug,
        selectedSlug,
        selectionReady: vaultScopeSettled,
      })
    ) {
      return;
    }

    const candidates = [
      ...collectionPinnedSlugs,
      ...collectionRecentSlugs,
      'README',
      'FEATURES',
      'PRODUCT-DIRECTION',
      'ARCHITECTURE',
      firstReadableSlug(collectionDocs),
    ];
    const nextSlug = candidates.find(
      (slug): slug is string => typeof slug === 'string' && collectionDocSlugs.has(slug),
    );
    if (!nextSlug) return;

    settleDocsVaultAddress(routePathname, nextSlug);
    scheduleStateSync(() => setSelectedSlug(nextSlug));
  }, [collectionDocSlugs, collectionDocs, collectionPinnedSlugs, collectionRecentSlugs, normalizedQuerySlug, openDocTabsHydrated, outOfScopeQuerySlug, pendingRestoredActiveSlug, routePathname, scopedDocSlugs, selectedSlug, vaultScopeSettled, setSelectedSlug]);

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
    [documentScope, generalDocsHref, recentKey, rememberActiveSlug, replaceUrlState, router, scopedDocSlugs, setRecentSlugs, setSampleWelcomeDismissed, setSelectedSlug],
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
  return {
    docCollection,
    highlightQuery,
    collectionDocs,
    collectionTagCounts,
    collectionManifest,
    collectionDocSlugs,
    collectionCounts,
    collectionPinnedSlugs,
    collectionRecentSlugs,
    docsBodyIndex,
    docsBodyIndexing,
    handleCollectionChange,
    handleSelect,
    handleCloseDocTab,
  };
}
