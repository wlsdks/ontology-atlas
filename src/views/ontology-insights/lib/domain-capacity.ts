import type { OntologyTreeNode } from "@/shared/lib/ontology-tree";

/** 한 도메인의 용량 — containment 서브트리에서 유도한 역량/요소 수. */
export interface DomainCapacityRow {
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
}

function countDescendantsByKind(node: OntologyTreeNode): { capability: number; element: number } {
  let capability = 0;
  let element = 0;
  function visit(n: OntologyTreeNode) {
    for (const child of n.children) {
      if (child.node.kind === "capability") capability += 1;
      else if (child.node.kind === "element") element += 1;
      visit(child);
    }
  }
  visit(node);
  return { capability, element };
}

/**
 * `buildOntologyTree` 의 root 들 안에서 `kind: domain` 노드를 전부 찾아 각
 * 서브트리의 capability/element 후손 수를 센다 — insights 탭1 "도메인 용량"
 * 카드의 진실원. 트리는 이미 `contains`/`belongs_to` 엣지로 만들어져 있으므로
 * 별도 BFS 를 새로 짜지 않고 재사용한다 (`buildProjectOntologyCounts` 의
 * project 버전과 같은 원리, domain 레벨 버전).
 *
 * 결과는 total 내림차순 — 동률은 title 오름차순으로 결정론적.
 */
export function computeDomainCapacityRows(roots: readonly OntologyTreeNode[]): DomainCapacityRow[] {
  const rows: DomainCapacityRow[] = [];
  function visit(node: OntologyTreeNode) {
    if (node.node.kind === "domain") {
      const { capability, element } = countDescendantsByKind(node);
      rows.push({
        id: node.node.id,
        title: node.node.title,
        capabilityCount: capability,
        elementCount: element,
        total: capability + element,
      });
    }
    for (const child of node.children) visit(child);
  }
  for (const root of roots) visit(root);

  return rows.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
}
