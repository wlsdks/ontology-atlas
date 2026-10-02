'use client';

import { useMemo } from 'react';
import { useLocalVault } from '@/entities/vault-session';
import {
  deriveOntologyFromVault,
  type VaultOntologyDerivation,
} from '@/entities/docs-vault';

/** Nodes and edges derived live from the local vault's frontmatter; empty plus a warning unless loaded. */
export function useVaultOntology(): VaultOntologyDerivation {
  const vault = useLocalVault();
  // A same-folder re-read keeps the last graph, or every save blanks the screen; false while
  // switching folders, so another folder's graph is never drawn.
  const usable = vault.status === 'loaded' || vault.isReloadingSameVault;
  return useMemo<VaultOntologyDerivation>(() => {
    if (!usable || !vault.manifest) {
      return {
        nodes: [],
        edges: [],
        sourceConceptCount: 0,
        sourceKindCounts: {},
        warnings: ['로컬 폴더가 열려 있지 않아 개념을 읽을 수 없습니다.'],
      };
    }
    return deriveOntologyFromVault(vault.manifest);
  }, [usable, vault.manifest]);
}
