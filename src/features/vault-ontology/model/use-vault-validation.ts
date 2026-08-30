'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/entities/vault-session';
import { useSampleSource } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import { resolveStaticVaultSource, type VaultManifest } from '@/entities/docs-vault';
import {
  summarizeVaultValidation,
  type VaultValidationSummary,
} from '@/shared/lib/validate-vault-document';

/**
 * A mode-aware frontmatter validation summary — the hook that lets the insights screen read
 * the same `summarizeVaultValidation` the settings sheet already used.
 *
 * Why it was needed (2026-08-04): the to-do tab's readiness meter looked only at relation
 * quality, so a folder with five validation errors still showed a 0px risk segment — while
 * the settings sheet in the same app said "5 are blocking" at that very moment. When two
 * screens call one folder by different numbers, neither is believed. So rather than
 * duplicating the calculation it calls **the same function**.
 *
 * Mode selection follows the same rule as `useVaultHealth` — the numbers match the screen
 * only if the vault being checked is the vault being drawn.
 */
const staticManifest = resolveStaticVaultSource('dogfood').manifest;
const storefrontManifest = resolveStaticVaultSource('storefront').manifest;

const summaryCache = new WeakMap<VaultManifest, VaultValidationSummary>();
function manifestValidation(manifest: VaultManifest): VaultValidationSummary {
  const cached = summaryCache.get(manifest);
  if (cached) return cached;
  const result = summarizeVaultValidation(
    manifest.docs.map((doc) => ({
      slug: doc.slug,
      frontmatter: doc.frontmatter ?? {},
    })),
  );
  summaryCache.set(manifest, result);
  return result;
}

const EMPTY_SUMMARY: VaultValidationSummary = {
  ok: true,
  total: 0,
  errorCount: 0,
  warningCount: 0,
  issuesBySlug: [],
};

export function useVaultValidationSummary(): VaultValidationSummary {
  const mode = useDataSourceMode();
  const [sampleSource] = useSampleSource();
  const vault = useLocalVault();

  return useMemo(() => {
    if (mode === 'static') {
      return manifestValidation(
        sampleSource === 'storefront' ? storefrontManifest : staticManifest,
      );
    }
    if (vault.status === 'loaded' && vault.manifest) {
      return manifestValidation(vault.manifest);
    }
    return EMPTY_SUMMARY;
  }, [mode, sampleSource, vault.status, vault.manifest]);
}
