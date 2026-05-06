import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";

/**
 * 검색 결과 항목 — ontology approved node source.
 */
export interface OntologySearchResult {
  node: KnowledgeGraphNode;
  /** 매치 점수 — 호출자가 정렬에 사용. 높을수록 우선. */
  score: number;
}

/**
 * matchOntologyNodes 의 선택적 필터.
 *
 * 두 set 모두 비어 있거나 (또는 미지정) 이면 필터 비활성 (모든 노드 후보).
 * 비어 있지 않으면 AND 조건 — kind 도 매치 + project 도 매치 해야 결과.
 *
 * 사용자 멘탈 모델:
 *   "capability 만 보고 싶다" → kinds = {capability}
 *   "이 project 의 노드만" → projectIds = {project-slug}
 *   "capability + 이 project" → 둘 다 set
 */
export interface MatchOntologyOptions {
  /**
   * 결과 노드의 kind 가 이 set 안에 있어야. 비어 있으면 모든 kind 허용.
   */
  kinds?: ReadonlySet<string>;
  /**
   * 결과 노드의 projectIds 중 적어도 하나가 이 set 안에 있어야. 비어 있으면
   * 모든 project 허용 (project 미연결 노드 포함).
   */
  projectIds?: ReadonlySet<string>;
}

/**
 * ontology 노드 검색.
 *
 * 점수 (낮을수록 약한 매치):
 *   4 — title prefix 매치
 *   3 — title substring 매치
 *   2 — summary substring 매치
 *   1 — id substring 매치 (kebab-case slug 직접 검색용)
 *   0 — 매치 없음 (결과 제외)
 *
 * 빈 query 는 전체 nodes 리턴 (limit 적용) — UI 가 "초기 추천" 으로 활용 가능.
 * 정렬: score desc, 같은 점수면 lastApprovedAt desc (최신 우선) — documents
 * 매처와 통일해 사용자 예상 가능한 순서.
 *
 * 한·영 혼합을 위해 raw lower-case substring 매칭. 한글은 정규화 부담이
 * 작아 그대로 유효 (`auth-login` 도 `로그인` 도 같은 함수 한 번에).
 *
 * options 의 kind / projectIds 필터는 score 계산 전에 적용 (필터 통과 노드만
 * 점수 평가). 빈 query + 필터 조합 시 "이 kind/project 의 최신 N 개" 가 됨.
 */
export function matchOntologyNodes(
  query: string,
  nodes: readonly KnowledgeGraphNode[],
  limit = 30,
  options?: MatchOntologyOptions,
): OntologySearchResult[] {
  const kinds = options?.kinds;
  const projectIds = options?.projectIds;
  const hasKindFilter = kinds && kinds.size > 0;
  const hasProjectFilter = projectIds && projectIds.size > 0;

  const passesFilter = (node: KnowledgeGraphNode): boolean => {
    if (hasKindFilter && !kinds!.has(node.kind)) return false;
    if (hasProjectFilter) {
      if (node.projectIds.length === 0) return false;
      const anyMatch = node.projectIds.some((pid) => projectIds!.has(pid));
      if (!anyMatch) return false;
    }
    return true;
  };

  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") {
    return nodes
      .filter(passesFilter)
      .slice()
      .sort((a, b) => b.lastApprovedAt.getTime() - a.lastApprovedAt.getTime())
      .slice(0, limit)
      .map((node) => ({ node, score: 0 }));
  }

  const matches: OntologySearchResult[] = [];
  for (const node of nodes) {
    if (!passesFilter(node)) continue;

    const title = node.title.toLowerCase();
    const summary = node.summary?.toLowerCase() ?? "";
    const id = node.id.toLowerCase();

    let score = 0;
    if (title.startsWith(trimmed)) score = 4;
    else if (title.includes(trimmed)) score = 3;
    else if (summary.includes(trimmed)) score = 2;
    else if (id.includes(trimmed)) score = 1;

    if (score > 0) matches.push({ node, score });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // 같은 점수 안에서 최신 (lastApprovedAt desc) 우선 — documents 매처와 통일.
    return b.node.lastApprovedAt.getTime() - a.node.lastApprovedAt.getTime();
  });

  return matches.slice(0, limit);
}

/**
 * 검색 결과 항목 — project source. S4 closure.
 */
export interface ProjectSearchResult {
  project: Project;
  /** 매치 점수 — 높을수록 우선. */
  score: number;
}

/**
 * project 검색.
 *
 * 점수:
 *   4 — name / nameEn prefix 매치
 *   3 — name / nameEn substring 매치
 *   2 — description / tags / category substring 매치
 *   1 — slug substring 매치 (kebab-case 직접 검색)
 *   0 — 매치 없음 (결과 제외)
 *
 * 빈 query 는 updatedAt desc 기준 limit. 정렬: score desc, 동률은 updatedAt desc
 * (다른 매처와 통일 — ontology 는 lastApprovedAt desc).
 *
 * 한·영 혼합 lower-case substring.
 */
export function matchProjects(
  query: string,
  projects: readonly Project[],
  limit = 30,
): ProjectSearchResult[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") {
    return projects
      .slice()
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit)
      .map((project) => ({ project, score: 0 }));
  }

  const matches: ProjectSearchResult[] = [];
  for (const project of projects) {
    const name = project.name.toLowerCase();
    const nameEn = project.nameEn?.toLowerCase() ?? "";
    const description = project.description?.toLowerCase() ?? "";
    const tags = project.tags.join(" ").toLowerCase();
    const category = (project.category ?? '').toLowerCase();
    const slug = project.slug.toLowerCase();

    let score = 0;
    if (name.startsWith(trimmed) || nameEn.startsWith(trimmed)) score = 4;
    else if (name.includes(trimmed) || nameEn.includes(trimmed)) score = 3;
    else if (
      description.includes(trimmed)
      || tags.includes(trimmed)
      || category.includes(trimmed)
    )
      score = 2;
    else if (slug.includes(trimmed)) score = 1;

    if (score > 0) matches.push({ project, score });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.project.updatedAt.getTime() - a.project.updatedAt.getTime();
  });

  return matches.slice(0, limit);
}
