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
  | 'related_to';

/** Runtime 검증·iteration 용 — 위 union 과 1:1 일치. */
export const KNOWLEDGE_EDGE_TYPES: readonly KnowledgeEdgeType[] = [
  'contains',
  'belongs_to',
  'depends_on',
  'implements',
  'uses',
  'describes',
  'related_to',
] as const;

/**
 * 빌더 (`/ontology/edit`) 가 손으로 만들 수 있는 ontology 노드 kind. document
 * 는 캔버스에서 직접 만들지 않지만 (frontmatter 진실원에서 derive), Exclude
 * 로 narrow 해 쓰는 곳이 있어 union 에 포함.
 */
export type ManualNodeKind = 'project' | 'domain' | 'capability' | 'element' | 'document';

export interface KnowledgeGraphNode {
  id: string;
  title: string;
  kind: string;
  projectIds: string[];
  summary?: string;
  evidenceIds: string[];
  lastApprovedAt: Date;
  lastApprovedBy: string;
  /** 사용자 / AI agent 가 남긴 자유 메모 (옵션) — NodeDetailPanel 의 \"메모\" 섹션. */
  manualNote?: string;
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
}

