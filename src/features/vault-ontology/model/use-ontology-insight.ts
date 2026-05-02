'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import {
  type KnowledgeGraphNode,
  type KnowledgeGraphEdge,
  type KnowledgeProjectInsight,
} from '@/entities/knowledge-graph';
import {
  deriveOntologyFromVault,
  vaultManifest as staticVaultManifestRaw,
  type VaultManifest,
  type VaultOntologyDerivation,
} from '@/entities/docs-vault';
import { useVaultOntology } from './use-vault-ontology';

export const VAULT_SENTINEL_DATE = new Date(0);
const VAULT_SENTINEL_AUTHOR = 'vault-frontmatter';

/**
 * 한 노드의 \`lastApprovedAt\` 이 vault sentinel 값 (epoch 0 = 1970-01-01) 인지.
 *
 * vault / dogfood 모드 노드는 frontmatter 가 진실원이라 시간 정보를 갖지 않아
 * sentinel 로 채움. UI 가 sentinel 을 감지하면 timestamp / timeline 패널을 mode
 * 기반 hide / 변형 가능 (1970-01-01 같은 어색한 표시 회피).
 */
export function isVaultSentinelDate(d: Date | null | undefined): boolean {
  return d instanceof Date && d.getTime() === 0;
}

// 빌드타임 dogfood 매니페스트 — JSON import. mode === 'static' 일 때
// 진실원. local/cloud 와는 별 path.
const staticVaultManifest = staticVaultManifestRaw as VaultManifest;
const STATIC_DERIVATION: VaultOntologyDerivation =
  deriveOntologyFromVault(staticVaultManifest);

function derivationToInsight(
  d: VaultOntologyDerivation,
): KnowledgeProjectInsight {
  const nodes: KnowledgeGraphNode[] = d.nodes.map((stub) => ({
    id: stub.id,
    title: stub.title,
    kind: stub.kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: VAULT_SENTINEL_DATE,
    lastApprovedBy: VAULT_SENTINEL_AUTHOR,
    summary: stub.summary,
    source: 'manual',
  }));
  const edges: KnowledgeGraphEdge[] = d.edges.map((stub) => ({
    id: stub.id,
    from: stub.from,
    to: stub.to,
    type: stub.type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: VAULT_SENTINEL_DATE,
    lastApprovedBy: VAULT_SENTINEL_AUTHOR,
    source: 'manual',
  }));
  return { nodes, edges };
}

const STATIC_INSIGHT: { insight: KnowledgeProjectInsight; error: null } = {
  insight: derivationToInsight(STATIC_DERIVATION),
  error: null,
};

/**
 * Mode-aware ontology insight 어댑터.
 *
 * R10 (auth + cloud surface 영구 제거) 이후 2 모드:
 *
 * - **local** → `useVaultOntology` 결과를 `KnowledgeProjectInsight` shape 로
 *   변환. 사용자 디스크의 frontmatter 가 진실원.
 * - **static** → 빌드타임 dogfood 매니페스트 derivation. JSON import 라
 *   module-load 에 1 회 derive (메모이즈).
 *
 * 두 mode 다 firebase 의존 0.
 */
export function useOntologyInsight(): {
  insight: KnowledgeProjectInsight | null;
  error: Error | null;
} {
  const mode = useDataSourceMode();
  const vault = useVaultOntology();

  return useMemo(() => {
    if (mode === 'static') return STATIC_INSIGHT;
    return {
      insight: derivationToInsight(vault),
      error: null,
    };
  }, [mode, vault]);
}
