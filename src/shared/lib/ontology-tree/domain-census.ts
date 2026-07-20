import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { isContainmentRelation } from "./relations";

/**
 * 도메인(및 프로젝트) 크기의 단일 진실원 — Guardian I-1.
 *
 * 같은 도메인이 캔버스 칩 86 · INDEX 트리 96 · /projects 카드 106 으로
 * 세 표면 세 숫자였다. 원인:
 * - 캔버스: containment 서브트리의 **element 만** 센 subtreeWeight.
 * - INDEX/인사이트: `buildOntologyTree` 워크 — 트리는 노드마다 부모를
 *   하나만 배정하므로 다중 부모 노드가 유실된다.
 * - /projects: 그래프 BFS (containment 도달 가능 전체) — 유일하게 완전.
 *
 * 규칙: "이 도메인/프로젝트에 속한 개념 수" 를 말하는 표면은 전부 이
 * BFS 를 쓴다. containment(`contains`/`belongs_to`)를 parent→child 로
 * 정규화해 도달 가능한 capability/element 를 kind 별로 센다. 사이클
 * 안전(visited), 노드별 유일 집계(중복 경로 이중 가산 없음).
 */
export interface DomainCensusRow {
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
  /** `collectCapabilityIds` 옵션일 때만 — 도달한 capability 노드 id 들. */
  capabilityIds?: string[];
}

const DEFAULT_TARGET_KINDS: readonly string[] = ["domain", "project"];

export interface DomainCensusOptions {
  /** P-1 — 프로젝트 상세처럼 카운트 외에 멤버 목록(상위 역량 랭킹용)이 필요한 표면. */
  collectCapabilityIds?: boolean;
}

export function computeDomainCensusRows(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  targetKinds: readonly string[] = DEFAULT_TARGET_KINDS,
  options: DomainCensusOptions = {},
): DomainCensusRow[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();

  for (const edge of edges) {
    if (!isContainmentRelation(edge.type)) continue;
    const [parent, child] = edge.type === "belongs_to" ? [edge.to, edge.from] : [edge.from, edge.to];
    if (!nodeById.has(parent) || !nodeById.has(child)) continue;
    const arr = childrenOf.get(parent);
    if (arr) arr.push(child);
    else childrenOf.set(parent, [child]);
  }

  const targets = new Set(targetKinds);
  const rows: DomainCensusRow[] = [];

  for (const node of nodes) {
    if (!targets.has(node.kind)) continue;

    let capabilityCount = 0;
    let elementCount = 0;
    const capabilityIds: string[] | null = options.collectCapabilityIds ? [] : null;
    const visited = new Set<string>([node.id]);
    const queue: string[] = [node.id];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      const children = childrenOf.get(current);
      if (!children) continue;
      for (const child of children) {
        if (visited.has(child)) continue;
        visited.add(child);
        queue.push(child);
        const childNode = nodeById.get(child);
        if (childNode?.kind === "capability") {
          capabilityCount += 1;
          capabilityIds?.push(child);
        } else if (childNode?.kind === "element") elementCount += 1;
      }
    }

    rows.push({
      id: node.id,
      title: node.title,
      capabilityCount,
      elementCount,
      total: capabilityCount + elementCount,
      ...(capabilityIds ? { capabilityIds } : {}),
    });
  }

  return rows.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
}

/** 표면에서 O(1) 조회용 — id → row. */
export function domainCensusById(rows: readonly DomainCensusRow[]): ReadonlyMap<string, DomainCensusRow> {
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * P-2 — "이 노드 집합에 속한 문서 수". document 노드는 containment BFS
 * (contains/belongs_to)로는 projectIds 가 절대 안 채워진다 — vault 관례상
 * `relates:` 로만 개념과 이어지기 때문. 그래서 소속 판정된 멤버와 어떤
 * edge 로든 이어진 document 를 센다 (containment 보다 1 hop 넓힘). 프로젝트
 * 카드(/projects)와 상세가 같은 규칙을 써야 "문서 0 vs 3" 모순이 안 난다.
 */
export function countConnectedDocuments(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  memberIds: ReadonlySet<string>,
): number {
  let count = 0;
  for (const node of nodes) {
    if (node.kind !== "document") continue;
    if (memberIds.has(node.id)) {
      count += 1;
      continue;
    }
    const connected = edges.some(
      (edge) =>
        (edge.from === node.id && memberIds.has(edge.to)) ||
        (edge.to === node.id && memberIds.has(edge.from)),
    );
    if (connected) count += 1;
  }
  return count;
}
