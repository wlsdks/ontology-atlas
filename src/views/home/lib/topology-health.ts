/**
 * 정리(health) 신호 품질 보정 — 기획자 감사 ⑦.
 *
 * project-deps 렌즈(detectOrphanProjects)는 ontology containment 를 보지
 * 못한다. vault 의 프로젝트 루트는 project.dependencies 가 비어 있어도
 * `contains` 엣지로 도메인/역량 전체를 거느리므로 "소속 미정" 이 아니다.
 * 오탐 1건이 정리 칩의 유일한 "수리 대상" 으로 뜨면 유지보수 진입점의
 * 신뢰가 첫 클릭에 무너진다 (alert fatigue).
 */

interface OntologyEdgeEndpoints {
  from: string;
  to: string;
}

/**
 * ontology 엣지에 어느 방향으로든 참여하는 프로젝트를 orphan 후보에서
 * 제외한다. ontology 쪽 표기는 bare slug(`ontology-atlas`)와
 * `project:` prefix(`project:ontology-atlas`) 두 가지가 공존하므로 둘 다
 * 매칭한다.
 */
export function filterOntologyConnectedOrphans<T extends { slug: string }>(
  orphans: readonly T[],
  ontologyEdges: readonly OntologyEdgeEndpoints[],
): T[] {
  if (orphans.length === 0 || ontologyEdges.length === 0) {
    return [...orphans];
  }
  const connected = new Set<string>();
  for (const edge of ontologyEdges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  return orphans.filter(
    (project) =>
      !connected.has(project.slug) && !connected.has(`project:${project.slug}`),
  );
}
