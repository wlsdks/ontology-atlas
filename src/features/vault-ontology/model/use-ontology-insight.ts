'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useSampleSource } from '@/features/vault-sample-source';
import {
  type KnowledgeGraphNode,
  type KnowledgeGraphEdge,
  type KnowledgeProjectInsight,
  stripVaultSlugPrefix,
} from '@/entities/knowledge-graph';
import {
  deriveOntologyFromVault,
  resolveStaticVaultSource,
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

// 번들 샘플 볼트 — mode === 'static' 일 때 진실원. local 모드와는 별 path.
// 매니페스트는 리졸버를 통해서만 받는다: JSON 을 직접 import 하면 매니페스트와
// 본문이 서로 다른 볼트에서 오는 사고가 다시 열린다(단일 진입점 계약,
// tests/contract/static-vault-source.contract.test.ts).
// 둘 다 빌드타임 JSON 이라 module-load 1 회만 derive 하고 재사용한다.
const STATIC_DERIVATION: VaultOntologyDerivation = deriveOntologyFromVault(
  resolveStaticVaultSource('dogfood').manifest,
);
const STOREFRONT_DERIVATION: VaultOntologyDerivation = deriveOntologyFromVault(
  resolveStaticVaultSource('storefront').manifest,
);

export function derivationToInsight(
  d: VaultOntologyDerivation,
  /**
   * 어권별 표시 이름 해석 (소유자 지시 2026-07-24) — stub 이 수집해 둔
   * `display_<locale>` 중 화면 로케일과 일치하는 값을 display 로 승격.
   * 없으면 종전 display 그대로(하위호환). 매칭의 진실원은 여전히 title 이고,
   * 표시 이름은 검색 범위에 더해진다 — 그래서 원본 map 도 함께 실어 보낸다.
   */
  locale?: string,
  /**
   * 에이전트에게 건넬 이름을 만들 때 문서 slug 앞에서 뺄 조각
   * (`StaticVaultSource.agentSlugPrefix`). 로컬 볼트는 폴더가 곧 뿌리라
   * 넘기지 않는다.
   */
  options?: { agentSlugPrefix?: string },
): KnowledgeProjectInsight {
  const agentSlugPrefix = options?.agentSlugPrefix;
  const nodes: KnowledgeGraphNode[] = d.nodes.map((stub) => ({
    id: stub.id,
    title: stub.title,
    display: (locale && stub.displayLocales?.[locale]) || stub.display,
    // 화면 언어와 무관하게 어느 어권 이름으로도 검색되게 원본을 그대로 전달.
    displayLocales: stub.displayLocales,
    kind: stub.kind,
    projectIds: [],
    // canonical 노드는 sourceSlug = 자기 자신 doc.slug, 합성 노드 (참조만 받고
    // 자체 doc 이 없는 stub) 는 sourceSlug = 처음 참조한 doc.slug. 둘 다
    // 사용자가 "근거 문서" 로 점프하면 맥락이 잡히므로 그대로 첫번째
    // evidenceId 로 노출. 없으면 빈 배열.
    evidenceIds: stub.sourceSlug ? [stub.sourceSlug] : [],
    // 그 둘을 evidenceIds 만으로는 구분할 수 없어 "이 노드의 문서" 를 그리는
    // 표면이 남의 문서를 열어 왔다 — 구분 플래그를 그대로 넘긴다.
    hasOwnDocument: stub.hasOwnDocument,
    // 에이전트에게 보여줄 이름 — 문서 노드는 볼트 뿌리 기준 slug, 파생
    // 노드는 볼트가 적어 둔 참조 원문. 화면이 복사해 주는 MCP/CLI 호출은
    // 전부 이 값을 쓴다(`resolveNodeAgentTarget`).
    agentSlug:
      stub.hasOwnDocument && stub.sourceSlug
        ? stripVaultSlugPrefix(stub.sourceSlug, agentSlugPrefix)
        : null,
    ref: stub.ref,
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
        { agentSlugPrefix: resolveStaticVaultSource(source).agentSlugPrefix },
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
/**
 * 이 저장소 자신의 볼트(`docs/ontology`) 인사이트 — **출처가 고정**이다.
 *
 * `useOntologyInsight` 는 사용자가 고른 것(로컬 볼트 · 스토어프론트 샘플)을
 * 돌려주는 것이 맞다. 하지만 `/download` 관문의 무대는 캡션으로 "이 저장소의
 * docs/ontology · 96 개념" 이라고 **주장**한다 — 그 문장이 참이려면 그리는
 * 그래프도 그것이어야 한다. 세션의 샘플 선택을 따라가면 스토어프론트(7 노드)를
 * 그려 놓고 96 개념이라고 적는 일이 벌어진다(실측 2026-07-28).
 *
 * 같은 캐시(`sampleInsight`)를 쓰므로 파생 비용은 추가되지 않는다.
 */
export function useDogfoodInsight(): KnowledgeProjectInsight {
  const locale = useLocale();
  return useMemo(() => sampleInsight('dogfood', locale).insight, [locale]);
}

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
