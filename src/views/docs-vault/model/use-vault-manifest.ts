'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStaticVaultSource, type useLocalVault } from '@/entities/vault-session';
import {
  deriveOntologyFromVault,
  loadStaticVaultHeadings,
  resolveStaticVaultSource,
  type StaticVaultHeadings,
  type VaultManifest,
} from '@/entities/docs-vault';
import {
  isAuthorableOntologyDocument,
  resolveDocsVaultSlugAlias,
} from '../lib/docs-vault-collection';

export function useVaultManifest({
  isLocalSourceLoaded,
  localVault,
  staticSampleOverride,
  querySlug,
  legacyEntry,
  documentScope,
}: {
  isLocalSourceLoaded: boolean;
  localVault: ReturnType<typeof useLocalVault>;
  staticSampleOverride: 'dogfood' | null;
  querySlug: string | null;
  legacyEntry: boolean;
  documentScope: 'all' | 'ontology';
}) {
  // The static fallback follows the sample the user chose, matching the map.
  const preferredStaticVault = useStaticVaultSource();
  const staticVault = staticSampleOverride
    ? resolveStaticVaultSource(staticSampleOverride)
    : preferredStaticVault;
  const manifest: VaultManifest =
    isLocalSourceLoaded && localVault.manifest
      ? localVault.manifest
      : staticVault.manifest;
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

  // Bundled headings live in a lazily loaded chunk (`entities/docs-vault/lib/static-headings.ts`);
  // use the map only for the vault currently drawn.
  const [staticHeadingsBundle, setStaticHeadingsBundle] = useState<{
    source: string;
    map: StaticVaultHeadings;
  } | null>(null);
  useEffect(() => {
    if (isLocalSourceLoaded) return undefined;
    let cancelled = false;
    loadStaticVaultHeadings(staticVault.source)
      .then((map) => {
        if (!cancelled) setStaticHeadingsBundle({ source: staticVault.source, map });
      })
      .catch(() => {
        // The outline is supplementary; a load failure must not block the page.
      });
    return () => {
      cancelled = true;
    };
  }, [isLocalSourceLoaded, staticVault.source]);
  const staticHeadings =
    staticHeadingsBundle && staticHeadingsBundle.source === staticVault.source
      ? staticHeadingsBundle.map
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
    staticVault,
    manifest,
    normalizedQuerySlug,
    legacyDocumentMode,
    legacyRedirectToLibrary,
    scopedDocs,
    scopedDocSlugs,
    staticHeadings,
    ontologyDerivation,
    docsBySlug,
    vaultSlugs,
    refSlugResolver,
  };
}
