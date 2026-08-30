'use client';

import { useMemo } from 'react';
import { useDataSourceMode, useSampleSource, useLocalVault } from '@/entities/vault-session';
import { resolveStaticVaultSource, type VaultManifest } from '@/entities/docs-vault';
import {
  computeVaultHealth,
  type VaultHealthResult,
} from '@/entities/knowledge-graph';

/**
 * Mode-aware vault health verdict — the browser-side twin of
 * `node $ATLAS/cli/src/index.mjs health` (`query_ontology({operation:'health'})`). The
 * insights surface must agree with the CLI, so it reads the SAME rule outcomes
 * from the raw frontmatter (`computeVaultHealth`) instead of the auto-healed
 * derived graph. Mirrors the mode selection of `useOntologyInsight` so the
 * verdict is computed against whatever vault the rest of the page shows.
 */
// The manifest is only ever taken through the resolver — importing the JSON directly becomes
// a second entry point that can bypass the sample choice
// (tests/contract/static-vault-source.contract.test.ts).
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

export function useVaultHealth(): VaultHealthResult {
  const mode = useDataSourceMode();
  const [sampleSource] = useSampleSource();
  const vault = useLocalVault();
  // A refresh of the same folder keeps its previous manifest until the replacement is ready.
  // Treating that interval as an empty vault makes ACP recommend bootstrap again immediately after
  // a successful write. The flag is false while switching folders, so another vault's health can
  // never leak across the boundary.
  const localManifestUsable = vault.status === 'loaded' || vault.isReloadingSameVault;

  return useMemo(() => {
    if (mode === 'static') {
      return manifestHealth(sampleSource === 'storefront' ? storefrontManifest : staticManifest);
    }
    if (localManifestUsable && vault.manifest) {
      return manifestHealth(vault.manifest);
    }
    return computeVaultHealth([]);
  }, [mode, sampleSource, localManifestUsable, vault.manifest]);
}
