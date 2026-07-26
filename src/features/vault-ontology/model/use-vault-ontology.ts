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
  // 같은 폴더를 다시 읽는 중(저장 직후·탭 복귀)에는 방금까지의 내용을 계속
  // 보여준다 — 재독해는 "데이터 없음" 이 아니다. 이 구분이 없을 때 저장 한 번에
  // 화면이 빈 상태로 깜빡였고, 그 프레임에 언마운트된 인라인 행의 "저장했어요"
  // 확인이 사용자에게 한 번도 안 보였다(2026-07-26 실측). 폴더를 **바꾸는**
  // 중이면 false 이므로 남의 폴더 그래프가 그려지지 않는다.
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
