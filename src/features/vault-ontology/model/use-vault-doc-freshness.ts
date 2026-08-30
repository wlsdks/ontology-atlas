'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import { useStaticVaultSource } from '@/entities/vault-session';
import type { VaultManifest } from '@/entities/docs-vault';

export function manifestToFreshnessIndex(manifest: VaultManifest): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of manifest.docs) {
    map.set(doc.slug, doc.updatedAt);
  }
  return map;
}

const EMPTY_FRESHNESS_INDEX: Map<string, string> = new Map();

/**
 * The source of truth for the freshness tab on `/ontology/insights` — vault doc slug → the
 * real `updatedAt` (`file.lastModified` in local mode, the build-time value in
 * static/dogfood mode). `KnowledgeGraphNode.lastApprovedAt` is the same sentinel (epoch 0)
 * on every node and cannot serve as a freshness signal, so this hook exposes the real
 * document-level dates from the vault manifest instead.
 *
 * The caller maps node → date by looking up this Map with `node.evidenceIds[0]` (the
 * sourceSlug `derivationToInsight` fills in). The mode-aware adapter pattern matches
 * `use-ontology-insight.ts`.
 */
export function useVaultDocFreshnessIndex(): ReadonlyMap<string, string> {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  // With two bundled vaults (dogfood and storefront) the index cannot be frozen at module
  // load. It receives the module-constant manifest instead, so the reference is stable and
  // the memo only re-runs when the sample changes.
  const staticSource = useStaticVaultSource();

  return useMemo(() => {
    if (mode === 'static') return manifestToFreshnessIndex(staticSource.manifest);
    if (vault.status !== 'loaded' || !vault.manifest) return EMPTY_FRESHNESS_INDEX;
    return manifestToFreshnessIndex(vault.manifest);
  }, [mode, vault.status, vault.manifest, staticSource.manifest]);
}
