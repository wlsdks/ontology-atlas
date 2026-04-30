/**
 * Ontology tree builder (T-6a).
 *
 * KnowledgeGraphNode + KnowledgeGraphEdge → 트리 구조.
 *
 * 알고리즘:
 *   1. document 노드는 트리에서 제외 (근거 노드. orphans 에 들어가지도 않음).
 *   2. `contains` 엣지로 부모→자식 관계 구성.
 *      `belongs_to` 는 역방향이라 자식→부모로 해석해도 같은 결과.
 *   3. 부모가 없으면 root. (보통 `kind=project`)
 *   4. cycle 감지: 부모-체인을 따라 올라가다 자기 자신에 도달하면 cycle →
 *      해당 자식을 root 로 승격 + warning.
 *   5. 다중 부모: 한 자식이 두 개 이상의 contains 엣지의 to 가 되면, 첫
 *      번째만 살리고 나머지는 warning.
 *   6. 같은 노드가 트리에 두 번 등장하지 않게 — 한 번 visited 표시.
 *
 * 정렬:
 *   - root: kind 우선 (project > 그 외) → title.
 *   - children: kind (domain > capability > element) → title.
 *   - 결정론적 — 같은 입력에 같은 출력.
 */

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyTreeBuildResult, OntologyTreeNode } from "./types";

const KIND_SORT_ORDER: Record<string, number> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
  document: 4,
};

function compareNodes(a: KnowledgeGraphNode, b: KnowledgeGraphNode): number {
  const ka = KIND_SORT_ORDER[a.kind] ?? 99;
  const kb = KIND_SORT_ORDER[b.kind] ?? 99;
  if (ka !== kb) return ka - kb;
  return a.title.localeCompare(b.title);
}

export function buildOntologyTree(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
): OntologyTreeBuildResult {
  const warnings: string[] = [];

  // 1. document 제외.
  const treeNodes = nodes.filter((n) => n.kind !== "document");
  const nodeById = new Map(treeNodes.map((n) => [n.id, n] as const));

  // 2. parent 맵 — contains 엣지의 from = parent, to = child.
  //    belongs_to 도 역방향으로 동일하게 (child belongs_to parent).
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    let parentId: string | undefined;
    let childId: string | undefined;
    if (edge.type === "contains") {
      parentId = edge.from;
      childId = edge.to;
    } else if (edge.type === "belongs_to") {
      parentId = edge.to;
      childId = edge.from;
    } else {
      continue;
    }
    if (!nodeById.has(parentId) || !nodeById.has(childId)) continue;
    if (parentId === childId) {
      warnings.push(`self-parent edge ignored (${edge.type} ${parentId} → ${childId})`);
      continue;
    }
    if (parentOf.has(childId)) {
      warnings.push(
        `node "${childId}" has multiple parents — keeping first (${parentOf.get(
          childId,
        )}), ignoring (${parentId})`,
      );
      continue;
    }
    parentOf.set(childId, parentId);
  }

  // 3. cycle 감지 — 자식이 자기 조상이 되는 경우.
  function ancestorChainHasCycle(startId: string): boolean {
    const visited = new Set<string>();
    let curr: string | undefined = startId;
    while (curr) {
      if (visited.has(curr)) return true;
      visited.add(curr);
      curr = parentOf.get(curr);
    }
    return false;
  }

  for (const childId of [...parentOf.keys()]) {
    if (ancestorChainHasCycle(childId)) {
      warnings.push(`cycle detected at "${childId}" — promoted to root`);
      parentOf.delete(childId);
    }
  }

  // 4. childrenOf 인덱스 만들기.
  const childrenOf = new Map<string, string[]>();
  for (const [childId, parentId] of parentOf) {
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId)!.push(childId);
  }

  // 5. 재귀 빌드.
  const visited = new Set<string>();
  function buildSubtree(nodeId: string, depth: number): OntologyTreeNode | null {
    if (visited.has(nodeId)) {
      warnings.push(`node "${nodeId}" reached twice in tree — second occurrence skipped`);
      return null;
    }
    visited.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) return null;
    const childIds = (childrenOf.get(nodeId) ?? []).slice();
    const children: OntologyTreeNode[] = [];
    for (const childId of childIds) {
      const child = buildSubtree(childId, depth + 1);
      if (child) children.push(child);
    }
    children.sort((a, b) => compareNodes(a.node, b.node));
    return { node, depth, children };
  }

  // 6. root 후보 = parentOf 에 없는 노드. project kind 우선.
  const rootIds = treeNodes
    .filter((n) => !parentOf.has(n.id))
    .map((n) => n.id);

  const roots: OntologyTreeNode[] = [];
  for (const rid of rootIds) {
    const tree = buildSubtree(rid, 0);
    if (tree) roots.push(tree);
  }
  roots.sort((a, b) => compareNodes(a.node, b.node));

  // 7. orphans = 트리에 없는 non-document 노드 (visited 안 된 나머지 — 보통 0).
  const orphans = treeNodes.filter((n) => !visited.has(n.id));

  return { roots, orphans, warnings };
}

/** 트리 안의 총 노드 수 (재귀 카운트). 미니맵 / 통계용. */
export function countTreeNodes(roots: OntologyTreeNode[]): number {
  let count = 0;
  function visit(node: OntologyTreeNode) {
    count++;
    for (const child of node.children) visit(child);
  }
  for (const root of roots) visit(root);
  return count;
}

/** flat list 로 전개 — depth 가 들여쓰기에 사용됨. expand/collapse UI 직전 단계. */
export function flattenTree(roots: OntologyTreeNode[]): OntologyTreeNode[] {
  const out: OntologyTreeNode[] = [];
  function visit(node: OntologyTreeNode) {
    out.push(node);
    for (const child of node.children) visit(child);
  }
  for (const root of roots) visit(root);
  return out;
}
