import type { OntologyTreeNode } from "@/shared/lib/ontology-tree";

/**
 * 트리 root 정렬 우선순위 (UX-12).
 *
 * 운영 토폴로지 진입 시 큰 그림 (project / domain) 부터 시각적으로
 * 떠오르게 — 시드 순서 그대로 두면 위계 의도와 어긋남 (project 19 가
 * element 454 사이에 묻힘).
 *
 * 정책:
 *   project < domain < capability < element < document < 알 수 없음
 * 같은 kind 안에서는 title 가나다 (locale 한국어 친화).
 */
const KIND_ORDER: Record<string, number> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
  document: 4,
};

const UNKNOWN_RANK = 99;

function rank(kind: string): number {
  return KIND_ORDER[kind] ?? UNKNOWN_RANK;
}

/**
 * 사용자가 OntologyTreeView 헤더에서 선택 가능한 root 정렬 mode (Fire 2).
 *
 * - `kind-title` (기본) — 원래 위계 우선 정책 (UX-12).
 * - `evidence-desc` — 근거 (evidenceIds 수) 가 많은 노드부터. "내 ontology
 *   에서 어떤 노드가 가장 자료가 많은지" 발견용.
 * - `title` — kind 무시, 가나다순. 알파벳 직접 lookup 시.
 */
export type OntologyRootSortKey = "kind-title" | "evidence-desc" | "title";

/** UI label — 정렬 dropdown 표시 텍스트. */
export const ONTOLOGY_ROOT_SORT_LABEL: Record<OntologyRootSortKey, string> = {
  "kind-title": "Kind 우선",
  "evidence-desc": "근거 많은 순",
  title: "가나다",
};

function compareEvidenceDesc(a: OntologyTreeNode, b: OntologyTreeNode): number {
  const ea = a.node.evidenceCount ?? a.node.evidenceIds.length;
  const eb = b.node.evidenceCount ?? b.node.evidenceIds.length;
  if (ea !== eb) return eb - ea;
  return a.node.title.localeCompare(b.node.title, "ko");
}

function compareTitleKo(a: OntologyTreeNode, b: OntologyTreeNode): number {
  return a.node.title.localeCompare(b.node.title, "ko");
}

function compareKindThenTitle(
  a: OntologyTreeNode,
  b: OntologyTreeNode,
): number {
  const ra = rank(a.node.kind);
  const rb = rank(b.node.kind);
  if (ra !== rb) return ra - rb;
  return a.node.title.localeCompare(b.node.title, "ko");
}

/**
 * 사용자 선택 정렬 mode 적용. 호출자는 `OntologyRootSortKey` 를 전달.
 * 원본은 변형 안 함 (immutable).
 */
export function sortRoots(
  roots: ReadonlyArray<OntologyTreeNode>,
  key: OntologyRootSortKey = "kind-title",
): OntologyTreeNode[] {
  switch (key) {
    case "evidence-desc":
      return [...roots].sort(compareEvidenceDesc);
    case "title":
      return [...roots].sort(compareTitleKo);
    case "kind-title":
    default:
      return [...roots].sort(compareKindThenTitle);
  }
}

/**
 * roots 를 kind 우선 + title 가나다 순으로 정렬해 새 배열 반환.
 * `sortRoots(roots, 'kind-title')` 의 alias — 기존 호출자 호환용.
 */
export function sortRootsByKindAndTitle(
  roots: ReadonlyArray<OntologyTreeNode>,
): OntologyTreeNode[] {
  return sortRoots(roots, "kind-title");
}
