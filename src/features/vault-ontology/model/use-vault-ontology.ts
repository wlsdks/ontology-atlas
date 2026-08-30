'use client';

import { useMemo } from 'react';
import { useLocalVault } from '@/entities/vault-session';
import {
  deriveOntologyFromVault,
  type VaultOntologyDerivation,
} from '@/entities/docs-vault';

/**
 * Exposes the ontology nodes and edges derived from the active local vault's frontmatter,
 * live.
 *
 * A real derivation is returned only while the vault is 'loaded'; otherwise an empty result
 * plus one warning line. Frontmatter is the source of truth, so there is no promote or
 * approve step before it surfaces as the graph.
 */
export function useVaultOntology(): VaultOntologyDerivation {
  const vault = useLocalVault();
  // While the same folder is being re-read (right after a save, or on tab return), keep
  // showing what was there a moment ago — a re-read is not "no data". Without this
  // distinction the screen blanked and came back on every save, and the "saved" confirmation
  // on the inline row unmounted in that frame was never seen (measured 2026-07-26). It is
  // false while **switching** folders, so another folder's graph is never drawn.
  const usable = vault.status === 'loaded' || vault.isReloadingSameVault;
  return useMemo<VaultOntologyDerivation>(() => {
    if (!usable || !vault.manifest) {
      return {
        nodes: [],
        edges: [],
        sourceConceptCount: 0,
        sourceKindCounts: {},
        warnings: ['로컬 문서함이 열려 있지 않아 개념을 읽을 수 없습니다.'],
      };
    }
    return deriveOntologyFromVault(vault.manifest);
  }, [usable, vault.manifest]);
}
