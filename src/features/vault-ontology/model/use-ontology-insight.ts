'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import {
  useKnowledgePublicInsight,
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
  return { nodes, edges, meta: null };
}

const STATIC_INSIGHT: { insight: KnowledgeProjectInsight; error: null } = {
  insight: derivationToInsight(STATIC_DERIVATION),
  error: null,
};

/**
 * Mode-aware ontology insight 구독.
 *
 * mission v2 진실원 우선순위 — `vault picked (local) > 빌드타임 dogfood
 * (static) > Firestore (cloud)`. PR #33 이 projects 측에 적용한 정책을 ontology
 * insight 에도 확장: 사용자가 vault 안 골랐고 비인증 (static) 이어도
 * oh-my-ontology 자체 ontology 가 즉시 보임.
 *
 * - `local` → `useVaultOntology` 결과를 `KnowledgeProjectInsight` shape 로 변환
 *   (sourceSlug 는 sentinel 값으로 채움 — 검수 chain 의 시작점은 vault 그 자체).
 * - `static` → 빌드타임 dogfood 매니페스트 derivation. JSON import 라 module-load
 *   에 1 회 derive (메모이즈) — 첫 paint 부터 즉시 노드/엣지 표시.
 * - `cloud` → 기존 `useKnowledgePublicInsight` 그대로.
 */
export function useOntologyInsight(
  accountId: string | null,
): { insight: KnowledgeProjectInsight | null; error: Error | null } {
  const mode = useDataSourceMode();
  const cloud = useKnowledgePublicInsight(accountId);
  const vault = useVaultOntology();

  return useMemo(() => {
    if (mode === 'static') return STATIC_INSIGHT;
    if (mode !== 'local') return cloud;
    return {
      insight: derivationToInsight(vault),
      error: null,
    };
  }, [mode, cloud, vault]);
}
