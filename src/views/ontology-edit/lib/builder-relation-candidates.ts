/**
 * 인스펙터 "관계" 탭의 비-드래그 "+ 관계 추가" 경로가 쓰는 후보 필터.
 *
 * 헌장 "drag-only discovery 금지" 해소 — 사용자가 손으로 핸들을 끌지 않아도
 * 대상 개념을 검색해 관계를 시작할 수 있어야 한다. 실제 쓰기는 기존
 * pendingRelation preflight/미리보기(RelationWriteConfirm) 경로를 그대로
 * 재사용하고, 이 함수는 그 진입점에 넣을 "고를 수 있는 대상 목록"만 고른다.
 *
 * 규칙:
 *  - 자기 자신(sourceSlug)은 제외 — 자기 참조 관계 불가.
 *  - 이미 관계가 있는 대상(existingTargets)은 제외 — 중복 회피(connectVaultEdge
 *    가 하던 dedup 을 검색 단계에서 미리 걷어내 사용자가 헛클릭하지 않게).
 *  - query 는 title / slug 의 대소문자 무시 부분일치. 빈 query 면 전체(제외 후).
 *  - 결과는 title 오름차순, 최대 limit(기본 8)개 — 팝오버가 길어지지 않게.
 */
export interface RelationCandidateNode {
  slug: string;
  title: string;
  kind: string;
}

export function buildRelationCandidates({
  sourceSlug,
  existingTargets,
  nodes,
  query,
  limit = 8,
}: {
  sourceSlug: string;
  existingTargets: string[];
  nodes: RelationCandidateNode[];
  query: string;
  limit?: number;
}): RelationCandidateNode[] {
  const excluded = new Set<string>([sourceSlug, ...existingTargets]);
  const q = query.trim().toLowerCase();
  return nodes
    .filter((node) => !excluded.has(node.slug))
    .filter(
      (node) =>
        q === "" ||
        node.title.toLowerCase().includes(q) ||
        node.slug.toLowerCase().includes(q),
    )
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, Math.max(0, limit));
}
