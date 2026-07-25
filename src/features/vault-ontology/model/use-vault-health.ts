'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useSampleSource } from '@/features/vault-sample-source';
import { useLocalVault } from '@/features/docs-vault-local';
import {
  vaultManifest as staticVaultManifestRaw,
  sampleStorefrontManifest as storefrontVaultManifestRaw,
  type VaultManifest,
} from '@/entities/docs-vault';
import {
  computeVaultHealth,
  type VaultHealthResult,
} from '@/entities/knowledge-graph/lib/vault-health';

/**
 * Mode-aware vault health verdict — the browser-side twin of
 * `ontology-atlas health` (`query_ontology({operation:'health'})`). C1: the
 * insights surface must agree with the CLI, so it reads the SAME rule outcomes
 * from the raw frontmatter (`computeVaultHealth`) instead of the auto-healed
 * derived graph. Mirrors the mode selection of `useOntologyInsight` so the
 * verdict is computed against whatever vault the rest of the page shows.
 */
const staticManifest = staticVaultManifestRaw as VaultManifest;
const storefrontManifest = storefrontVaultManifestRaw as VaultManifest;

const staticHealthCache = new WeakMap<VaultManifest, VaultHealthResult>();
function manifestHealth(manifest: VaultManifest): VaultHealthResult {
  const cached = staticHealthCache.get(manifest);
  if (cached) return cached;
  const result = computeVaultHealth(manifest.docs);
  staticHealthCache.set(manifest, result);
  return result;
}

export function useVaultHealth(): VaultHealthResult {
  const mode = useDataSourceMode();
  const [sampleSource] = useSampleSource();
  const vault = useLocalVault();

  return useMemo(() => {
    if (mode === 'static') {
      return manifestHealth(sampleSource === 'storefront' ? storefrontManifest : staticManifest);
    }
    if (vault.status === 'loaded' && vault.manifest) {
      return manifestHealth(vault.manifest);
    }
    return computeVaultHealth([]);
  }, [mode, sampleSource, vault.status, vault.manifest]);
}
