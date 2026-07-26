'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import type { VaultManifest } from '@/entities/docs-vault';

/** 「할 일」 큐의 의미 공백 판정에 필요한 문서 사실만 — `MeaningGapRow` 의 입력. */
export interface VaultConceptFacts {
  hasDefinition: boolean;
  domainRef: string | null;
  mtime: number | null;
}

/**
 * 매니페스트 → 문서 slug 별 사실. 순수 함수라 테스트가 매니페스트 한 벌만
 * 만들면 된다.
 *
 * `hasDefinition` 은 `description` **또는** 본문 요약이다 — 파생
 * (`derive-ontology-from-vault`)이 노드 요약을 만들 때 쓰는 것과 같은 사다리라,
 * 지도 팝오버가 뜻을 보여주는데 큐가 "정의 없음" 이라고 말하는 모순이 없다.
 */
export function manifestToConceptFacts(
  manifest: VaultManifest,
): Map<string, VaultConceptFacts> {
  const facts = new Map<string, VaultConceptFacts>();
  for (const doc of manifest.docs) {
    const fm = doc.frontmatter ?? {};
    const description =
      typeof doc.description === 'string' && doc.description.trim()
        ? doc.description.trim()
        : typeof fm.description === 'string' && fm.description.trim()
          ? String(fm.description).trim()
          : '';
    const domainRaw = typeof fm.domain === 'string' ? fm.domain.trim() : '';
    facts.set(doc.slug, {
      hasDefinition: Boolean(description) || Boolean((doc.excerpt ?? '').trim()),
      domainRef: domainRaw || null,
      mtime: typeof doc.mtime === 'number' ? doc.mtime : null,
    });
  }
  return facts;
}

const EMPTY_FACTS: Map<string, VaultConceptFacts> = new Map();
const factsCache = new WeakMap<VaultManifest, Map<string, VaultConceptFacts>>();

function cachedFacts(manifest: VaultManifest): Map<string, VaultConceptFacts> {
  const cached = factsCache.get(manifest);
  if (cached) return cached;
  const built = manifestToConceptFacts(manifest);
  factsCache.set(manifest, built);
  return built;
}

/**
 * Mode-aware 어댑터 — `useVaultDocFreshnessIndex` / `useVaultHealth` 와 같은
 * 패턴. static 이면 지금 보고 있는 번들 샘플, local 이면 사용자 폴더.
 * 사용자 폴더가 항상 우선이라 여기서 분기 이상의 판단은 하지 않는다.
 */
export function useVaultConceptFacts(): ReadonlyMap<string, VaultConceptFacts> {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const staticSource = useStaticVaultSource();

  return useMemo(() => {
    if (mode === 'static') return cachedFacts(staticSource.manifest);
    // `status` 가 아니라 **매니페스트 유무**로 판정한다. 저장 직후·폴링 때마다
    // `load()` 가 status 를 'loading' 으로 돌리는데(매니페스트는 그대로 남는다),
    // 그 순간 빈 map 을 돌려주면 이 사실로 만든 행이 통째로 사라진다 — 사용자
    // 눈에는 "적던 칸이 없어졌다" 로 보인다(2026-07-26 실측). 재독해 중이라는
    // 것은 데이터가 없다는 뜻이 아니다. 쓰기 안전은 여기가 아니라
    // `expectedMtime` 가드가 지킨다.
    if (!vault.manifest) return EMPTY_FACTS;
    return cachedFacts(vault.manifest);
  }, [mode, vault.manifest, staticSource.manifest]);
}
