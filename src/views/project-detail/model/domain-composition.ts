import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDegreeCentrality, computeDomainCensusRows } from "@/shared/lib/ontology-tree";

/**
 * 프로젝트 상세 "도메인 구성" 한 **행** 분량 데이터.
 *
 * `capabilities` 는 이 도메인에 (직접이든 nested 든) 속한 capability **전부**를
 * degree(연결도) 내림차순으로 담는다 — 순서가 삽입 순서가 아니라 "그래프에서
 * 가장 많이 참조/연결된 것이 먼저" 라는 뜻이 되도록.
 *
 * ## 왜 상위 2개 + 「N개 더」가 아니라 전부인가 (2026-08-12, B안)
 *
 * 종전 카드는 상위 2개만 그리고 나머지를 「역량 N개 더」라는 발줄로 셌다. 그
 * 줄은 **갈 곳이 없는 수**였다 — 누를 수도, 펼칠 수도 없어서 그 N 개를 보려면
 * 지도로 떠나야 했다. 행이 그 자리에서 펼쳐지면 목록이 전부 보이므로 그 발줄
 * 자체가 사라지고, 「상위 2」라는 기준(연결 많은 순 — 화면에는 적혀 있지도
 * 않았다)을 사용자에게 설명할 필요도 없어진다.
 */
export interface DomainCompositionRow {
  /** ontology 노드 id (예: `domain:views`) — topology focus deep-link 에 그대로 사용. */
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
  /** degree 내림차순 · 동률은 제목 오름차순. 표시용 짧은 제목(`display`) 우선. */
  capabilities: string[];
}

export interface ProjectDomainComposition {
  domains: DomainCompositionRow[];
  maxTotal: number;
}

/**
 * 프로젝트에 속한 domain 노드들의 구성 행. P-1 (UX 라운드): 카운트가
 * `nearestDomainId`(노드당 도메인 1개 배정 롤업)라 지도 INDEX·인사이트·
 * /projects 의 단일 진실원 BFS(`computeDomainCensusRows`)와 4면 불일치했다
 * — 이제 같은 BFS 를 쓰고, 이 모듈은 역량 랭킹(degree)과 행 shape 만 소유한다.
 */
export function buildProjectDomainComposition(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  projectSlug: string,
): ProjectDomainComposition {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const degrees = computeDegreeCentrality(nodes, edges);

  const projectDomainIds = new Set(
    nodes
      .filter((node) => node.kind === "domain" && node.projectIds.includes(projectSlug))
      .map((domain) => domain.id),
  );

  const rows = computeDomainCensusRows(nodes, edges, ["domain"], { collectCapabilityIds: true });

  const composed: DomainCompositionRow[] = rows
    .filter((row) => projectDomainIds.has(row.id))
    .map((row) => {
      const capabilities = (row.capabilityIds ?? [])
        .map((id) => nodeById.get(id))
        .filter((node): node is KnowledgeGraphNode => node !== undefined)
        .sort((a, b) => {
          const degreeDiff = (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0);
          if (degreeDiff !== 0) return degreeDiff;
          return a.title.localeCompare(b.title);
        });
      return {
        id: row.id,
        title: row.title,
        capabilityCount: row.capabilityCount,
        elementCount: row.elementCount,
        total: row.total,
        // 과제 ⑩ — 역량 이름도 표시용 짧은 제목.
        capabilities: capabilities.map((cap) => cap.display ?? cap.title),
      };
    });

  composed.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
  const maxTotal = composed.reduce((max, row) => Math.max(max, row.total), 0);

  return { domains: composed, maxTotal };
}
