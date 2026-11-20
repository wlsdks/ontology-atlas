'use client';

import { useMemo } from 'react';
import { useDataSourceMode, useStaticVaultSource, useLocalVault } from '@/entities/vault-session';
import type { VaultManifest } from '@/entities/docs-vault';
import { computeVaultHealth, type VaultHealthResult } from '@/entities/knowledge-graph';

/**
 * Browser twin of the CLI `health`: same rule outcomes from raw frontmatter, with
 * `useOntologyInsight`'s mode selection.
 */
const staticHealthCache = new WeakMap<VaultManifest, VaultHealthResult>();
function manifestHealth(manifest: VaultManifest): VaultHealthResult {
  const cached = staticHealthCache.get(manifest);
  if (cached) return cached;
  const result = computeVaultHealth(manifest.docs);
  staticHealthCache.set(manifest, result);
  return result;
}

/** One mode selection for every health reading, so they never read different vaults. */
function useHealthManifest(): VaultManifest | null {
  const mode = useDataSourceMode();
  // The manifest only through the hook (tests/contract/vault-data/static-vault-source.contract.test.ts).
  const { manifest: staticManifest } = useStaticVaultSource();
  const vault = useLocalVault();
  // A same-folder refresh keeps its manifest, or ACP would recommend bootstrap after a write;
  // the flag is false while switching folders, so another vault's health never leaks.
  const localManifestUsable = vault.status === 'loaded' || vault.isReloadingSameVault;

  return useMemo(() => {
    if (mode === 'static') return staticManifest;
    if (localManifestUsable && vault.manifest) return vault.manifest;
    return null;
  }, [mode, staticManifest, localManifestUsable, vault.manifest]);
}

/** Null while `shown` is false: nothing renders the result, so the graph pass waits. */
export function useVaultHealth(shown: boolean): VaultHealthResult | null {
  const manifest = useHealthManifest();
  return useMemo(() => {
    if (!shown) return null;
    return manifest ? manifestHealth(manifest) : computeVaultHealth([]);
  }, [manifest, shown]);
}
