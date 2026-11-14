'use client';

import { useMemo } from 'react';
import { useDataSourceMode, useSampleSource, useLocalVault } from '@/entities/vault-session';
import { resolveStaticVaultSource, type VaultManifest } from '@/entities/docs-vault';
import { computeVaultHealth, type VaultHealthResult } from '@/entities/knowledge-graph';

/**
 * Browser twin of the CLI `health`: same rule outcomes from raw frontmatter, with
 * `useOntologyInsight`'s mode selection.
 */
// The manifest only through the resolver (tests/contract/vault-data/static-vault-source.contract.test.ts).
const staticManifest = resolveStaticVaultSource('dogfood').manifest;
const storefrontManifest = resolveStaticVaultSource('storefront').manifest;

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
  const [sampleSource] = useSampleSource();
  const vault = useLocalVault();
  // A same-folder refresh keeps its manifest, or ACP would recommend bootstrap after a write;
  // the flag is false while switching folders, so another vault's health never leaks.
  const localManifestUsable = vault.status === 'loaded' || vault.isReloadingSameVault;

  return useMemo(() => {
    if (mode === 'static') {
      return sampleSource === 'storefront' ? storefrontManifest : staticManifest;
    }
    if (localManifestUsable && vault.manifest) return vault.manifest;
    return null;
  }, [mode, sampleSource, localManifestUsable, vault.manifest]);
}

export function useVaultHealth(): VaultHealthResult {
  const manifest = useHealthManifest();
  return useMemo(
    () => (manifest ? manifestHealth(manifest) : computeVaultHealth([])),
    [manifest],
  );
}
