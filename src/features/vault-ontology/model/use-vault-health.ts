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

/**
 * The manifest the health verdict and its siblings are computed from — one mode
 * selection, so two readings of the same vault can never disagree about which vault
 * they read. `null` means there is nothing to read yet.
 */
function useHealthManifest(): VaultManifest | null {
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
      return sampleSource === 'storefront' ? storefrontManifest : staticManifest;
    }
    if (localManifestUsable && vault.manifest) return vault.manifest;
    return null;
  }, [mode, sampleSource, localManifestUsable, vault.manifest]);
}

/**
 * The documents the health verdict was computed from.
 *
 * Exposed because a repair the board offers must change **the same folder the verdict measured**.
 * Reading the manifest a second way (through `useLocalVault` directly, say) would let a batch
 * repair run against a folder the verdict never looked at — the "two canonical stores" mistake,
 * one hook apart. Callers get the documents read-only and decide nothing about mode here.
 */
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

/**
 * **The names this vault was asked for and does not hold.**
 *
 * `computeVaultHealth` already walks these references and stops at
 * `summary.unresolvedEdges`, a number. The insights board needs the names behind that
 * number, so the same manifest is read again through `unmatchedGraphAsks`. Both readings
 * take the same mode selection, which is the whole reason `useHealthManifest` exists —
 * a count and a list that disagree about which vault they describe is the defect this
 * file's header already records once.
 */
export interface VaultUnmatchedAsks {
  asks: readonly UnmatchedGraphAsk[];
  /**
   * Has a manifest actually been read? Without this, an empty list is indistinguishable
   * from an unread folder, and the screen shows "every name resolves" — the most
   * reassuring sentence it has — at the one moment it cannot know that.
   */
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
