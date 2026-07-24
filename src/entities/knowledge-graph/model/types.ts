/**
 * Canonical edge type union — vault frontmatter array key (capabilities /
 * elements / dependencies / relates / contains / describes 등) 와 ontology
 * relation 의 7 종 표준값.
 *
 * 카테고리 (참고용):
 *   structure: `contains`, `belongs_to` (트리 구조)
 *   behavior:  `depends_on`, `implements`, `uses` (동작)
 *   evidence:  `describes` (document → 개념)
 *   weak:      `related_to` (약 연관)
 *   taxonomy:  `is_a` (상위 개념 — SKOS skos:broader, frontmatter `broader:`)
 *
 * `KnowledgeGraphEdge.type` 자체는 backwards-compat 으로 `string` 을 유지.
 * 타입드 writer / typed reader 가 필요한 경우 이 union 을 사용한다.
 */
export type KnowledgeEdgeType =
  | 'contains'
  | 'belongs_to'
  | 'depends_on'
  | 'implements'
  | 'uses'
  | 'describes'
  | 'related_to'
  | 'is_a';

/** Runtime 검증·iteration 용 — 위 union 과 1:1 일치. */
export const KNOWLEDGE_EDGE_TYPES: readonly KnowledgeEdgeType[] = [
  'contains',
  'belongs_to',
  'depends_on',
  'implements',
  'uses',
  'describes',
  'related_to',
  'is_a',
] as const;

/**
 * 나침 무대(`/ontology/studio` CREATE) 가 손으로 만들 수 있는 ontology 노드
 * kind. document kind 는 frontmatter 진실원에서 derive 되므로 사용자가 직접
 * 만드는 대상이 아니다 — 본 union 에 포함되지 않는다.
 */
export type ManualNodeKind = 'project' | 'domain' | 'capability' | 'element';

export interface KnowledgeGraphNode {
  id: string;
  title: string;
  /**
   * 표시용 짧은 제목 — 과제 ⑩ (표시 이름 레이어). `deriveDisplayTitle` 로
   * 파생 (frontmatter `display:` 필드 우선, 없으면 title 의 괄호 부연
   * 설명 컷). 토폴로지 라벨 / INDEX 행 / 팝오버 / 상세 헤더 렌더 표면은
   * `node.display ?? node.title` 로 읽는다. 검색/매칭(`matchOntologyNodes`
   * 등)은 여전히 `title` 전체로 수행 — 이 필드는 렌더 전용이라 매칭 범위를
   * 줄이지 않는다. optional 인 이유: `derivationToInsight` 를 거치지 않고
   * 직접 만든 노드(테스트 픽스처, 빌더 등)와의 하위 호환.
   */
  display?: string;
  kind: string;
  projectIds: string[];
  summary?: string;
  evidenceIds: string[];
  lastApprovedAt: Date;
  lastApprovedBy: string;
}

export interface KnowledgeGraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  label?: string;
  projectIds: string[];
  evidenceIds: string[];
  lastApprovedAt: Date;
  lastApprovedBy: string;
}

export interface KnowledgeProjectInsight {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  sourceConceptCount?: number;
  sourceKindCounts?: Record<string, number>;
}
