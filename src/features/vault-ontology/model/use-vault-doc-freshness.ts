'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { vaultManifest as staticVaultManifestRaw, type VaultManifest } from '@/entities/docs-vault';

const staticVaultManifest = staticVaultManifestRaw as VaultManifest;

export function manifestToFreshnessIndex(manifest: VaultManifest): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of manifest.docs) {
    map.set(doc.slug, doc.updatedAt);
  }
  return map;
}

const STATIC_FRESHNESS_INDEX = manifestToFreshnessIndex(staticVaultManifest);
const EMPTY_FRESHNESS_INDEX: Map<string, string> = new Map();

/**
 * `/ontology/insights` 탭3(신선도)의 진실원 — vault 문서 slug → 실제
 * `updatedAt` (local 모드는 `file.lastModified`, static/dogfood 모드는
 * 빌드타임 값). `KnowledgeGraphNode.lastApprovedAt` 은 R10b 이후 모든 노드에
 * 동일한 sentinel(epoch 0) 이라 신선도 신호로 쓸 수 없다 — 이 hook 은 그
 * 대신 vault manifest 문서 레벨의 실제 날짜를 노출한다.
 *
 * 노드 → 날짜 매핑은 호출자가 `node.evidenceIds[0]` (= `derivationToInsight`
 * 이 채우는 sourceSlug) 를 키로 이 Map 을 조회 — mode-aware 어댑터 패턴은
 * `use-ontology-insight.ts` 와 동일.
 */
export function useVaultDocFreshnessIndex(): ReadonlyMap<string, string> {
  const mode = useDataSourceMode();
  const vault = useLocalVault();

  return useMemo(() => {
    if (mode === 'static') return STATIC_FRESHNESS_INDEX;
    if (vault.status !== 'loaded' || !vault.manifest) return EMPTY_FRESHNESS_INDEX;
    return manifestToFreshnessIndex(vault.manifest);
  }, [mode, vault.status, vault.manifest]);
}
