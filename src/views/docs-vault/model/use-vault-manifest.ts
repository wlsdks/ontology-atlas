'use client';

import { useMemo } from 'react';
import { useOpenFolderManifest } from '@/entities/vault-session';
import { deriveOntologyFromVault } from '@/entities/docs-vault';
import {
  isAuthorableOntologyDocument,
  resolveDocsVaultSlugAlias,
} from '../lib/docs-vault-collection';

export function useVaultManifest({
  querySlug,
  selectedSlug,
  legacyEntry,
  documentScope,
}: {
  querySlug: string | null;
  selectedSlug: string | null;
  legacyEntry: boolean;
  documentScope: 'all' | 'ontology';
}) {
  const manifest = useOpenFolderManifest();
  const normalizedQuerySlug = useMemo(
    () => resolveDocsVaultSlugAlias(querySlug, manifest.docs, manifest.aliases),
    [manifest.aliases, manifest.docs, querySlug],
  );
  const legacyTargetDoc = useMemo(
    () => legacyEntry && normalizedQuerySlug
      ? manifest.docs.find((doc) => doc.slug === normalizedQuerySlug) ?? null
      : null,
    [legacyEntry, manifest.docs, normalizedQuerySlug],
  );
  const legacyDocumentMode = Boolean(
    legacyTargetDoc && !isAuthorableOntologyDocument(legacyTargetDoc),
  );
  const legacyRedirectToLibrary = legacyEntry && !legacyDocumentMode;
  const scopedDocs = useMemo(
    () => legacyDocumentMode && legacyTargetDoc
      ? [legacyTargetDoc]
      : documentScope === 'ontology'
      ? manifest.docs.filter(isAuthorableOntologyDocument)
      : manifest.docs,
    [documentScope, legacyDocumentMode, legacyTargetDoc, manifest.docs],
  );
  const scopedDocSlugs = useMemo(
    () => new Set(scopedDocs.map((doc) => doc.slug)),
    [scopedDocs],
  );
  const outOfScopeQuerySlug =
    documentScope === 'ontology' &&
    !legacyEntry &&
    normalizedQuerySlug &&
    manifest.docs.some((doc) => doc.slug === normalizedQuerySlug) &&
    !scopedDocSlugs.has(normalizedQuerySlug)
      ? normalizedQuerySlug
      : null;

  const ontologyDerivation = useMemo(
    () => deriveOntologyFromVault(manifest),
    [manifest],
  );

  const docsBySlug = useMemo(() => {
    const map = new Map<string, (typeof manifest.docs)[number]>();
    for (const d of manifest.docs) map.set(d.slug, d);
    return map;
  }, [manifest]);
  const selectedDoc = selectedSlug && scopedDocSlugs.has(selectedSlug)
    ? (docsBySlug.get(selectedSlug) ?? null)
    : null;
  const vaultSlugs = useMemo(
    () => new Set(manifest.docs.map((d) => d.slug)),
    [manifest],
  );
  // Frontmatter references use a bare slug; resolve path form first, then the
  // frontmatter `slug`, then path tail. Unresolved references are not links.
  const refSlugResolver = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of manifest.docs) map.set(d.slug, d.slug);
    for (const d of manifest.docs) {
      const fmSlug =
        typeof d.frontmatter?.slug === "string" ? d.frontmatter.slug.trim() : "";
      if (fmSlug && !map.has(fmSlug)) map.set(fmSlug, d.slug);
    }
    for (const d of manifest.docs) {
      const tail = d.slug.split("/").pop() ?? "";
      if (tail && !map.has(tail)) map.set(tail, d.slug);
    }
    return map;
  }, [manifest]);
  return {
    manifest,
    normalizedQuerySlug,
    legacyDocumentMode,
    legacyRedirectToLibrary,
    scopedDocs,
    scopedDocSlugs,
    outOfScopeQuerySlug,
    selectedDoc,
    ontologyDerivation,
    docsBySlug,
    vaultSlugs,
    refSlugResolver,
  };
}
