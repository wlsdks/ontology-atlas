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

/** Type guard — 임의 string 이 합법 edge type 인지 확인. */
export function isKnowledgeEdgeType(value: unknown): value is KnowledgeEdgeType {
  return typeof value === 'string'
    && (KNOWLEDGE_EDGE_TYPES as readonly string[]).includes(value);
}

/**
 * 빌더 (`/ontology/edit`) 가 손으로 만들 수 있는 ontology 노드 kind. document
 * 는 캔버스에서 직접 만들지 않지만 (frontmatter 진실원에서 derive), Exclude
 * 로 narrow 해 쓰는 곳이 있어 union 에 포함.
 */
export type ManualNodeKind = 'project' | 'domain' | 'capability' | 'element' | 'document';

/**
 * 노드/엣지의 출처.
 *
 * - `manual` — mission v2 의 표준 값. vault frontmatter 자체 + 빌더 추가 +
 *   MCP write 모두 사람/AI agent 의 *직접 작성* 이라 동일 출처로 분류.
 * - `extraction` — v1 cloud LLM 추출 워커의 결과 표식. mission v2 에서
 *   추출 큐 (\`enqueueExtractionJob\` 등) 가 폐기되어 신규 할당은 일어나지
 *   않으나, Firestore legacy 데이터에 남은 값을 호환 위해 enum 에 보존.
 *
 * 옵션 필드 — legacy 데이터는 \`undefined\`, UI 가 \`extraction\` 기본값으로 처리.
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

/**
 * V1.1 (Wikidata 영감) — statement qualifier value union. legacy edge / 노드 변환
 * 시에는 항상 undefined. 새 edge 가 명시적으로 채울 때만 존재.
 *
 * 자세한 spec: docs/ONTOLOGY-MODEL-V2-DRAFT.md §2.
 */
export type QualifierValue =
  | { kind: 'string'; raw: string }
  | { kind: 'time'; iso: string; precision: 'year' | 'month' | 'day' }
  | { kind: 'quantity'; value: number; unit?: string }
  | { kind: 'nodeRef'; nodeId: string };

export interface EdgeQualifier {
  /** 한정자 property id — `OntologyRelation.id` 또는 새 ontology
   *  qualifier property id 재사용. legacy 호환을 위해 string 으로 둔다. */
  propertyId: string;
  value: QualifierValue;
}

/**
 * V1.1 (Wikidata 영감) — statement rank. 같은 (from, to, type) 의 다중 statement
 * 중 우선순위. legacy edge 는 undefined → 코드는 `rank ?? 'normal'` 폴백.
 */
export type EdgeRank = 'preferred' | 'normal' | 'deprecated';

export interface KnowledgeGraphEdge {
  id: string;
  accountId?: string;
  from: string;
  to: string;
  type: string;
  label?: string;
  projectIds: string[];
  evidenceIds: string[];
  /** evidenceIds.length 로 derived. 클라이언트가 edge 두께 가중에 쓴다.
   *  approved/public 양쪽에서 사용 가능. */
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
  /** V1.1 — Wikidata-style statement qualifier 배열 (옵션, additive). legacy
   *  edge 는 undefined. UI / publish projection 모두 그대로 통과. */
  qualifiers?: EdgeQualifier[];
  /** V1.1 — Wikidata-style statement rank (옵션, additive). legacy 는 undefined
   *  → 'normal' 로 해석. */
  rank?: EdgeRank;
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

