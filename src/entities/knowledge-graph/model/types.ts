/**
 * Canonical edge type union — `knowledgeApprovedEdges.type` / `knowledgePublicEdges.type`
 * 의 합법 값. ontology TBox (`ontologyRelations` 컬렉션) 의 7 종 시드와 일치.
 *
 * 카테고리 (참고용):
 *   structure: `contains`, `belongs_to` (트리 구조)
 *   behavior:  `depends_on`, `implements`, `uses` (동작)
 *   evidence:  `describes` (document → 개념)
 *   weak:      `related_to` (약 연관)
 *
 * 추출 candidates 는 `string` 으로 들어올 수 있고 (LLM 이 잘못된 타입을 낼 가능성),
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

/** Type guard — 임의 string 이 합법 edge type 인지 확인. */
export function isKnowledgeEdgeType(value: unknown): value is KnowledgeEdgeType {
  return typeof value === 'string'
    && (KNOWLEDGE_EDGE_TYPES as readonly string[]).includes(value);
}

/**
 * 노드/엣지의 출처. v0 백본은 모두 추출-검수-승인 거친 결과 (`extraction`).
 * Manual editor v0 (B 라인) 부터 사용자가 직접 만든 `manual` 값이 추가된다.
 * 옵션 필드 — legacy 데이터는 `undefined`, UI 가 `extraction` 기본값으로 처리.
 */
export type KnowledgeGraphSource = 'manual' | 'extraction';

export const KNOWLEDGE_GRAPH_SOURCES: readonly KnowledgeGraphSource[] = [
  'manual',
  'extraction',
] as const;

export function isKnowledgeGraphSource(value: unknown): value is KnowledgeGraphSource {
  return typeof value === 'string'
    && (KNOWLEDGE_GRAPH_SOURCES as readonly string[]).includes(value);
}

export interface KnowledgeGraphNode {
  id: string;
  accountId?: string;
  title: string;
  kind: string;
  projectIds: string[];
  parentId?: string;
  summary?: string;
  evidenceIds: string[];
  evidenceCount?: number;
  currentRevisionId?: string;
  lastApprovedAt: Date;
  lastApprovedBy: string;
  publishId?: string;
  projectionVersion?: string;
  publishedAt?: Date;
  /** Manual editor v0 — `manual` 이면 사용자 직접 작성, `extraction` 이면 추출
   *  워커 산물. legacy 데이터는 `undefined` (UI 가 extraction 으로 간주). */
  source?: KnowledgeGraphSource;
  /** `source === 'manual'` 시 작성자 uid. Firestore rules 가 author 본인만
   *  update/delete 허용. */
  manualAuthor?: string;
  /** `source === 'manual'` 시 사용자가 남긴 자유 메모 (옵션). */
  manualNote?: string;
  /** P1 Phase 1 — 이 노드 생성/검수 시점의 활성 TBox version ID. fact 와
   *  schema 가 시간상 일치 추적용. legacy 데이터는 `undefined` 또는
   *  `'legacy-v0'`. spec: 2026-04-28-ontology-tbox-evolution.md */
  tboxVersionId?: string;
}

export interface KnowledgeGraphEdge {
  id: string;
  accountId?: string;
  from: string;
  to: string;
  type: string;
  label?: string;
  projectIds: string[];
  evidenceIds: string[];
  /** publishKnowledgeProjection 이 evidenceIds.length 로 derived 한 값. 클라이언트
   *  가 edge 두께 가중에 쓴다. approved/public 양쪽에서 사용 가능. */
  evidenceCount?: number;
  currentRevisionId?: string;
  lastApprovedAt: Date;
  lastApprovedBy: string;
  publishId?: string;
  projectionVersion?: string;
  publishedAt?: Date;
  /** Manual editor v0 — node 와 동일 의미. */
  source?: KnowledgeGraphSource;
  manualAuthor?: string;
  manualNote?: string;
  /** P1 Phase 1 — node 와 동일 의미. */
  tboxVersionId?: string;
}

export interface KnowledgePublicMeta {
  id: string;
  currentPublishId: string;
  projectionVersion: string;
  publishedAt: Date;
}

export interface KnowledgeProjectInsight {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  meta: KnowledgePublicMeta | null;
}

export interface ApproveKnowledgeOutputInput {
  accountId?: string | null;
  documentId: string;
  documentVersionId: string;
  outputId?: string;
  /**
   * Partial approve — output 의 nodes 중 이 tempId 만 승인. 미제공이면 전체
   * nodes 승인 (기존 동작). 빈 배열은 "노드는 아무것도 승인 안 함" — 그럴
   * 거면 reject_output 으로 명시 거절하는 게 자연스러움.
   */
  acceptedNodeTempIds?: string[];
  /**
   * Partial approve — output 의 edges 중 이 tempId 만 승인. 미제공이면 전체
   * edges 승인.
   */
  acceptedEdgeTempIds?: string[];
}

export interface ApproveKnowledgeOutputResult {
  reviewId: string;
  approvalEventId: string;
  outputId: string;
  approvedNodeCount: number;
  approvedEdgeCount: number;
}

/**
 * Output 의 일부 또는 전체 후보를 거절. T-11 정확도 측정의 분모(전체 후보 =
 * approve + reject) 보존이 목적. `knowledgeApprovedNodes/Edges` 는 변경하지
 * 않고 reviews/approvalEvents 에만 거절 사실을 남긴다.
 *
 * `rejectedNodeTempIds` / `rejectedEdgeTempIds` 가 비어있거나 미제공이면
 * "전체 거절" 로 간주한다 (output 의 모든 nodes/edges).
 */
export interface RejectKnowledgeOutputInput {
  accountId?: string | null;
  documentId: string;
  documentVersionId: string;
  outputId?: string;
  rejectedNodeTempIds?: string[];
  rejectedEdgeTempIds?: string[];
  reason?: string;
}

export interface RejectKnowledgeOutputResult {
  reviewId: string;
  approvalEventId: string;
  outputId: string;
  rejectedNodeCount: number;
  rejectedEdgeCount: number;
}

export interface PublishKnowledgeProjectionInput {
  accountId?: string | null;
}

export interface PublishKnowledgeProjectionResult {
  publishId: string;
  nodeCount: number;
  edgeCount: number;
  projectionVersion: string;
}
