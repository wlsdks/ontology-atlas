'use client';

import { useMemo } from 'react';

import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import { useVaultHealth } from '@/features/vault-ontology/model/use-vault-health';
import type { VaultManifest } from '@/entities/docs-vault';

import { chatSuggestions, type ChatSuggestion } from './chat-suggestions';

/**
 * 대화창이 보여 줄 추천 — **지금 보고 있는 그 볼트**에서 뽑는다.
 *
 * 판정 규칙은 `chat-suggestions.ts` 가 갖고(순수 함수라 테스트가 쉽다), 이
 * 훅은 재료만 모은다. 모드 분기는 `useVaultHealth` ·
 * `useVaultConceptFacts` · `useVaultDocFreshnessIndex` 가 이미 쓰는 것과 같은
 * 모양이다 — 사본을 새로 만드는 게 아니라 `useStaticVaultSource` 라는 같은
 * 출처를 쓴다.
 */

/**
 * 코드 근거가 없는 역량. `path:` 는 「이 역량이 어디에 구현돼 있나」 한 줄이고,
 * 비어 있으면 그 노드는 지도 위에만 있고 코드에는 없는 것이다.
 *
 * 역량만 본다 — 도메인은 원래 코드 자리를 갖지 않고(사업 영역이다), 원소는
 * 자기 자리가 곧 존재 이유라 비어 있는 경우가 거의 없다.
 */
function unevidencedCapabilities(manifest: VaultManifest | null): string[] {
  if (!manifest) return [];
  const out: string[] = [];
  for (const doc of manifest.docs) {
    const fm = doc.frontmatter as Record<string, unknown> | undefined;
    if (fm?.kind !== 'capability') continue;
    const path = fm.path;
    if (typeof path === 'string' && path.trim().length > 0) continue;
    out.push(doc.slug);
  }
  return out.sort();
}

export function useChatSuggestions(
  sourceState: 'loading' | 'unbound' | 'bound' | 'unavailable' | 'no-projects' = 'bound',
): ChatSuggestion[] {
  const health = useVaultHealth();
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const staticSource = useStaticVaultSource();

  // 매니페스트 유무로 고른다 — `status` 로 고르면 저장 직후 재독해 중에
  // 추천이 통째로 사라졌다가 돌아온다(`use-vault-concept-facts` 가 같은
  // 이유로 같은 판정을 쓴다).
  const manifest = mode === 'static' ? staticSource.manifest : (vault.manifest ?? null);

  return useMemo(
    () =>
      chatSuggestions({
        nodeCount: health.summary.nodes,
        islands: health.islands,
        missingContainment: health.missingContainment,
        unevidenced: unevidencedCapabilities(manifest),
        sourceState,
      }),
    [health, manifest, sourceState],
  );
}
