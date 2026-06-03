'use client';

import { useMemo } from 'react';
import { useLocalVault } from '@/features/docs-vault-local';
import {
  deriveOntologyFromVault,
  type VaultOntologyDerivation,
} from '@/entities/docs-vault';

/**
 * 활성 로컬 vault 의 frontmatter 에서 derive 한 ontology 노드/엣지를 라이브로 노출.
 *
 * vault 가 활성화 ('loaded') 되어 있어야 실제 derivation 을 반환. 그 외에는
 * 빈 결과 + warning 한 줄. mission v2: frontmatter 자체가 진실원이라 별도
 * promote / 승격 단계 없이 그대로 ontology 그래프로 surface.
 */
export function useVaultOntology(): VaultOntologyDerivation {
  const vault = useLocalVault();
  return useMemo<VaultOntologyDerivation>(() => {
    if (vault.status !== 'loaded' || !vault.manifest) {
      return {
        nodes: [],
        edges: [],
        warnings: ['로컬 문서함이 열려 있지 않아 개념을 읽을 수 없습니다.'],
      };
    }
    return deriveOntologyFromVault(vault.manifest);
  }, [vault.status, vault.manifest]);
}
