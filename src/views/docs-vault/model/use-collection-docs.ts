'use client';

import { useMemo } from 'react';
import {
  buildTagIndexForDocs,
  filterDocsByCollection,
  followMovedSlugs,
  type DocsVaultCollection,
} from '../lib/docs-vault-collection';
import type { VaultManifest } from '@/entities/docs-vault';

export function useCollectionDocs({
  manifest,
  scopedDocs,
  documentScope,
  docCollection,
  pinnedSlugs,
  recentSlugs,
}: {
  manifest: VaultManifest;
  scopedDocs: VaultManifest['docs'];
  documentScope: 'all' | 'ontology';
  docCollection: DocsVaultCollection;
  pinnedSlugs: string[];
  recentSlugs: string[];
}) {
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
  return {
    collectionDocs,
    collectionTags,
    collectionTagCounts,
    collectionManifest,
    collectionDocSlugs,
    collectionCounts,
    collectionPinnedSlugs,
    collectionRecentSlugs,
  };
}
