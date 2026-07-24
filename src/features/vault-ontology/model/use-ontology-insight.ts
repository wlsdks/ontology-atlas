'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useSampleSource } from '@/features/vault-sample-source';
import {
  type KnowledgeGraphNode,
  type KnowledgeGraphEdge,
  type KnowledgeProjectInsight,
} from '@/entities/knowledge-graph';
import {
  deriveOntologyFromVault,
  vaultManifest as staticVaultManifestRaw,
  sampleStorefrontManifest as storefrontVaultManifestRaw,
  type VaultManifest,
  type VaultOntologyDerivation,
} from '@/entities/docs-vault';
import { isContainmentRelation } from '@/shared/lib/ontology-tree';
import { useVaultOntology } from './use-vault-ontology';

// vault / dogfood 모드 노드는 frontmatter 가 진실원이라 시간 정보를 갖지
// 않아 KnowledgeGraphNode.lastApprovedAt 에 sentinel 값 (epoch 0) 을 채워
// 넣는다. cycle 21 에서 isVaultSentinelDate 가드와 외부 export 는 호출자
// 0 으로 정리 — 필요해지면 재추가.
const VAULT_SENTINEL_DATE = new Date(0);
const VAULT_SENTINEL_AUTHOR = 'vault-frontmatter';

// 빌드타임 dogfood 매니페스트 — JSON import. mode === 'static' 일 때
// 진실원. local 모드와는 별 path.
const staticVaultManifest = staticVaultManifestRaw as VaultManifest;
const STATIC_DERIVATION: VaultOntologyDerivation =
  deriveOntologyFromVault(staticVaultManifest);

// P0 공감형 샘플 vault — "예시 비즈니스 보기" 선택 시 진실원(dogfood 와 같은
// 빌드타임 JSON import 라 module-load 1 회 derive + 메모이즈).
const storefrontVaultManifest = storefrontVaultManifestRaw as VaultManifest;
const STOREFRONT_DERIVATION: VaultOntologyDerivation =
  deriveOntologyFromVault(storefrontVaultManifest);

export function derivationToInsight(
  d: VaultOntologyDerivation,
  /**
   * 어권별 표시 이름 해석 (소유자 지시 2026-07-24) — stub 이 수집해 둔
   * `display_<locale>` 중 화면 로케일과 일치하는 값을 display 로 승격.
   * 없으면 종전 display 그대로(하위호환). 검색/매칭은 여전히 title.
   */
  locale?: string,
): KnowledgeProjectInsight {
  const nodes: KnowledgeGraphNode[] = d.nodes.map((stub) => ({
    id: stub.id,
    title: stub.title,
    display: (locale && stub.displayLocales?.[locale]) || stub.display,
    kind: stub.kind,
    projectIds: [],
    // canonical 노드는 sourceSlug = 자기 자신 doc.slug, 합성 노드 (참조만 받고
    // 자체 doc 이 없는 stub) 는 sourceSlug = 처음 참조한 doc.slug. 둘 다
    // 사용자가 "근거 문서" 로 점프하면 맥락이 잡히므로 그대로 첫번째
    // evidenceId 로 노출. 없으면 빈 배열.
    evidenceIds: stub.sourceSlug ? [stub.sourceSlug] : [],
    lastApprovedAt: VAULT_SENTINEL_DATE,
    lastApprovedBy: VAULT_SENTINEL_AUTHOR,
    summary: stub.summary,
  }));
  const edges: KnowledgeGraphEdge[] = d.edges.map((stub) => ({
    id: stub.id,
    from: stub.from,
    to: stub.to,
    type: stub.type,
    label: stub.label,
    projectIds: [],
    evidenceIds: stub.sourceSlug ? [stub.sourceSlug] : [],
    lastApprovedAt: VAULT_SENTINEL_DATE,
    lastApprovedBy: VAULT_SENTINEL_AUTHOR,
  }));

  // R+ projectIds 채우기 — vault frontmatter 에 `project:` 키가 없어도
  // contains 관계를 BFS 로 transitive closure 잡아 각 project 노드의 후손
  // 에 그 project slug 매달기. dogfood 처럼 single-project vault 에서
  // ProjectSelector 카드의 도메인/역량/요소 fact strip 이 빈 map 으로
  // 빠져 hide 되던 회귀 차단. UI fallback (PR #252) 도 유지 — 정확한 fix
  // 가 데이터 보강 끝나면 조건 false 가 되어 자동 skip.
  const projectNodes = nodes.filter((n) => n.kind === 'project');
  if (projectNodes.length > 0) {
    const containsAdj = new Map<string, string[]>();
    for (const e of edges) {
      const isContains = isContainmentRelation(e.type);
      if (!isContains) continue;
      // belongs_to 는 contains 의 역방향 — 일관되게 container → contained
      // 로 정규화.
      const [from, to] = e.type === 'contains' ? [e.from, e.to] : [e.to, e.from];
      const arr = containsAdj.get(from);
      if (arr) arr.push(to);
      else containsAdj.set(from, [to]);
    }
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    for (const p of projectNodes) {
      const projectSlug = p.id.replace(/^project:/, '');
      const visited = new Set<string>([p.id]);
      const queue: string[] = [p.id];
      // head pointer 로 dequeue O(1) — `Array.shift()` 는 O(n) 이라 큰 vault
      // 에서 O(n²) (depth.ts / reachability.ts 와 동일 패턴).
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        const children = containsAdj.get(cur);
        if (!children) continue;
        for (const c of children) {
          if (visited.has(c)) continue;
          visited.add(c);
          queue.push(c);
          const cnode = nodeById.get(c);
          if (cnode && !cnode.projectIds.includes(projectSlug)) {
            cnode.projectIds.push(projectSlug);
          }
        }
      }
    }
  }

  return {
    nodes,
    edges,
    sourceConceptCount: d.sourceConceptCount,
    sourceKindCounts: d.sourceKindCounts,
  };
}

// 로케일별 1회 계산 캐시 — 모듈-로드 단일 값이던 것을 locale 차원으로 확장
// (derive 는 여전히 1회, insight 매핑만 로케일별).
const staticInsightByLocale = new Map<string, { insight: KnowledgeProjectInsight; error: null }>();
function sampleInsight(
  source: 'dogfood' | 'storefront',
  locale: string,
): { insight: KnowledgeProjectInsight; error: null } {
  const key = `${source}:${locale}`;
  let cached = staticInsightByLocale.get(key);
  if (!cached) {
    cached = {
      insight: derivationToInsight(
        source === 'storefront' ? STOREFRONT_DERIVATION : STATIC_DERIVATION,
        locale,
      ),
      error: null,
    };
    staticInsightByLocale.set(key, cached);
  }
  return cached;
}

/**
 * Mode-aware ontology insight 어댑터. 2 모드:
 *
 * - **local** → `useVaultOntology` 결과를 `KnowledgeProjectInsight` shape 로
 *   변환. 사용자 디스크의 frontmatter 가 진실원.
 * - **static** → 빌드타임 내장 샘플 매니페스트 derivation. JSON import 라
 *   module-load 에 1 회 derive (메모이즈). `useSampleSource` 가 dogfood(기본)
 *   /storefront 둘 중 어느 샘플을 보여줄지 고른다 — local 모드에서는 이
 *   선택이 아예 읽히지 않는다(사용자 vault 가 항상 우선).
 */
export function useOntologyInsight(): {
  insight: KnowledgeProjectInsight | null;
  error: Error | null;
} {
  const mode = useDataSourceMode();
  const vault = useVaultOntology();
  const [sampleSource] = useSampleSource();
  const locale = useLocale();

  return useMemo(() => {
    if (mode === 'static') {
      return sampleInsight(sampleSource === 'storefront' ? 'storefront' : 'dogfood', locale);
    }
    return {
      insight: derivationToInsight(vault, locale),
      error: null,
    };
  }, [mode, vault, sampleSource, locale]);
}
