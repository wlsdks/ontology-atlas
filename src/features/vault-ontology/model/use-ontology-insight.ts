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

function derivationToInsight(
  d: VaultOntologyDerivation,
): KnowledgeProjectInsight {
  const nodes: KnowledgeGraphNode[] = d.nodes.map((stub) => ({
    id: stub.id,
    title: stub.title,
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
    projectIds: [],
    evidenceIds: [],
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
      const isContains = e.type === 'contains' || e.type === 'belongs_to';
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

  return { nodes, edges };
}

const STATIC_INSIGHT: { insight: KnowledgeProjectInsight; error: null } = {
  insight: derivationToInsight(STATIC_DERIVATION),
  error: null,
};

/**
 * Mode-aware ontology insight 어댑터. 2 모드:
 *
 * - **local** → `useVaultOntology` 결과를 `KnowledgeProjectInsight` shape 로
 *   변환. 사용자 디스크의 frontmatter 가 진실원.
 * - **static** → 빌드타임 dogfood 매니페스트 derivation. JSON import 라
 *   module-load 에 1 회 derive (메모이즈).
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
