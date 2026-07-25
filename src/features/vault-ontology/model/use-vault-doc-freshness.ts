'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import type { VaultManifest } from '@/entities/docs-vault';

export function manifestToFreshnessIndex(manifest: VaultManifest): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of manifest.docs) {
    map.set(doc.slug, doc.updatedAt);
  }
  return map;
}

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
  // 번들 볼트가 둘(dogfood · storefront)이라 index 를 모듈 로드 시점에 못 굳힌다.
  // 대신 모듈 상수 매니페스트를 그대로 받으므로 참조가 안정적이고, 표본을
  // 바꿀 때만 memo 가 다시 돈다.
  const staticSource = useStaticVaultSource();

  return useMemo(() => {
    if (mode === 'static') return manifestToFreshnessIndex(staticSource.manifest);
    if (vault.status !== 'loaded' || !vault.manifest) return EMPTY_FRESHNESS_INDEX;
    return manifestToFreshnessIndex(vault.manifest);
  }, [mode, vault.status, vault.manifest, staticSource.manifest]);
}
