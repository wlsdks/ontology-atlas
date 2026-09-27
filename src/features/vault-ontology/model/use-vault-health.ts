'use client';

import { useMemo } from 'react';
import { useDataSourceMode, useSampleSource, useLocalVault } from '@/entities/vault-session';
import { resolveStaticVaultSource, type VaultManifest } from '@/entities/docs-vault';
import {
  computeVaultHealth,
  unmatchedGraphAsks,
  type UnmatchedGraphAsk,
  type VaultHealthResult,
} from '@/entities/knowledge-graph';

/**
 * Browser twin of the CLI `health` verdict: reads the same rule outcomes from raw frontmatter
 * (`computeVaultHealth`) with `useOntologyInsight`'s mode selection, so it agrees with the CLI.
 */
// The manifest only through the resolver (tests/contract/static-vault-source.contract.test.ts).
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

/** The documents the verdict measured, so a repair changes the same folder. */
export function useVaultHealthDocs(): readonly VaultManifest['docs'][number][] {
  const manifest = useHealthManifest();
  return useMemo(() => manifest?.docs ?? [], [manifest]);
}

export function useVaultHealth(): VaultHealthResult {
  const manifest = useHealthManifest();
  return useMemo(
    () => (manifest ? manifestHealth(manifest) : computeVaultHealth([])),
    [manifest],
  );
}

/** Names this vault was asked for and does not hold, from the same manifest as the count. */
export interface VaultUnmatchedAsks {
  asks: readonly UnmatchedGraphAsk[];
  /** Whether a manifest was read, so an empty list is not mistaken for "every name resolves". */
  manifestRead: boolean;
}

const EMPTY_ASKS: VaultUnmatchedAsks = { asks: [], manifestRead: false };
const unmatchedCache = new WeakMap<VaultManifest, VaultUnmatchedAsks>();

export function useVaultUnmatchedAsks(): VaultUnmatchedAsks {
  const manifest = useHealthManifest();
  return useMemo(() => {
    if (!manifest) return EMPTY_ASKS;
    const cached = unmatchedCache.get(manifest);
    if (cached) return cached;
    const computed: VaultUnmatchedAsks = {
      asks: unmatchedGraphAsks(manifest.docs),
      manifestRead: true,
    };
    unmatchedCache.set(manifest, computed);
    return computed;
  }, [manifest]);
}
