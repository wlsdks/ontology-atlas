'use client';

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { firstReadableSlug } from './first-readable-slug';
import {
  filterDocsByCollection,
  resolveDocsVaultCollection,
  resolveInitialDocsCollection,
  shouldDeferDocsVaultDefaultSelection,
  type DocsVaultDocCollection,
  type DocsVaultCollection,
} from '../lib/docs-vault-collection';
import { replaceDocsVaultUrlState, settleDocsVaultAddress } from '../lib/url-state';
import type { VaultManifest } from '@/entities/docs-vault';
import { scheduleStateSync } from '../lib/persistence';

export function useCollectionSelection({
  manifest,
  scopedDocs,
  scopedDocSlugs,
  documentScope,
  docCollection,
  setDocCollection,
  initialCollection,
  selectedDoc,
  selectedSlug,
  setSelectedSlug,
  setActiveTag,
  pinnedSlugs,
  recentSlugs,
  collectionDocs,
  collectionDocSlugs,
  collectionPinnedSlugs,
  collectionRecentSlugs,
  openDocTabsHydrated,
  pendingRestoredActiveSlug,
  outOfScopeQuerySlug,
  normalizedQuerySlug,
  vaultScopeSettled,
  routePathname,
  replaceUrlState,
}: {
  manifest: VaultManifest;
  scopedDocs: VaultManifest['docs'];
  scopedDocSlugs: ReadonlySet<string>;
  documentScope: 'all' | 'ontology';
  docCollection: DocsVaultCollection;
  setDocCollection: Dispatch<SetStateAction<DocsVaultCollection>>;
  initialCollection: DocsVaultDocCollection;
  selectedDoc: VaultManifest['docs'][number] | null;
  selectedSlug: string | null;
  setSelectedSlug: Dispatch<SetStateAction<string | null>>;
  setActiveTag: Dispatch<SetStateAction<string | null>>;
  pinnedSlugs: string[];
  recentSlugs: string[];
  collectionDocs: VaultManifest['docs'];
  collectionDocSlugs: ReadonlySet<string>;
  collectionPinnedSlugs: string[];
  collectionRecentSlugs: string[];
  openDocTabsHydrated: boolean;
  pendingRestoredActiveSlug: string | null;
  outOfScopeQuerySlug: string | null;
  normalizedQuerySlug: string | null;
  vaultScopeSettled: boolean;
  routePathname: string;
  replaceUrlState: typeof replaceDocsVaultUrlState;
}) {
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
  }, [docCollection, documentScope, initialCollection, manifest.docs, setDocCollection]);

  useEffect(() => {
    if (documentScope === 'ontology') return;
    if (!selectedDoc) return;
    // Picking a document never narrows the "all documents" view.
    if (docCollection === 'all') return;
    const nextCollection = resolveDocsVaultCollection(selectedDoc);
    if (nextCollection !== docCollection) {
      scheduleStateSync(() => setDocCollection(nextCollection));
    }
  }, [docCollection, documentScope, selectedDoc, setDocCollection]);

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
    [documentScope, manifest.docs, pickDefaultDocForCollection, replaceUrlState, selectedSlug, setActiveTag, setDocCollection, setSelectedSlug],
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
  return { handleCollectionChange };
}
