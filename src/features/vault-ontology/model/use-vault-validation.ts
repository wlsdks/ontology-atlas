'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/entities/vault-session';
import { useStaticVaultSource } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import type { VaultManifest } from '@/entities/docs-vault';
import {
  summarizeVaultValidation,
  type VaultValidationSummary,
} from '@/shared/lib/vault-document/validate-vault-document';

/** The settings sheet's `summarizeVaultValidation`, with `useVaultHealth`'s mode selection, so both screens agree. */
const summaryCache = new WeakMap<VaultManifest, VaultValidationSummary>();
function manifestValidation(manifest: VaultManifest): VaultValidationSummary {
  const cached = summaryCache.get(manifest);
  if (cached) return cached;
  const result = summarizeVaultValidation(
    manifest.docs.map((doc) => ({
      slug: doc.slug,
      frontmatter: doc.frontmatter ?? {},
      // Parser diagnostics ride along, so an unreadable frontmatter line counts as broken.
      diagnostics: doc.diagnostics,
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
  const { manifest: staticManifest } = useStaticVaultSource();
  const vault = useLocalVault();

  return useMemo(() => {
    if (mode === 'static') return manifestValidation(staticManifest);
    if (vault.status === 'loaded' && vault.manifest) {
      return manifestValidation(vault.manifest);
    }
    return EMPTY_SUMMARY;
  }, [mode, staticManifest, vault.status, vault.manifest]);
}
