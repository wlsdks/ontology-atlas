/**
 * Ontology TBox — 관계 타입 정의.
 *
 * `knowledgeApprovedEdges.type` 의 합법 값 + 제약. 각 관계는 source/target
 * class 제약, 카테고리, symmetric / transitive 속성을 가진다 (OWL TBox 의
 * 핵심 — schema-guided 추출 prompt 에 들어가는 명세).
 */

/** 관계의 의미 카테고리. */
export type OntologyRelationCategory =
  /** 구조 관계 — contains, belongs_to. 트리 형성. */
  | 'structure'
  /** 동작 관계 — depends_on, implements, uses. 시스템 행동. */
  | 'behavior'
  /** 근거 관계 — describes. document → 개념. */
  | 'evidence'
  /** 약 연관 — related_to. 충분한 근거 누적 시 더 구체적 타입으로 승격 후보. */
  | 'weak';

export interface OntologyRelation {
  /** kebab-case ID. 예: 'depends_on'. */
  id: string;
  /** display name (한글 OK). */
  name: string;
  /** 역방향 표시명 (예: 'depended-on-by'). 옵셔널 — UI 표시에 사용. */
  inverseName?: string;
  /** 관계의 의미. */
  description?: string;
  /**
   * source 로 허용되는 class ID 목록. 빈 배열 = 모든 클래스 허용.
   * 추출 시 schema-guided validation 에 사용.
   */
  sourceClassIds: string[];
  /** target 으로 허용되는 class ID 목록. */
  targetClassIds: string[];
  category: OntologyRelationCategory;
  /** A→B 가 B→A 와 동치인가 (예: related_to true, depends_on false). */
  symmetric: boolean;
  /** A→B + B→C ⇒ A→C 가 성립 (예: contains true, uses false). */
  transitive: boolean;
  /** TBox 버전. */
  version: number;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
}

export type OntologyRelationInput = Omit<OntologyRelation, 'createdAt' | 'updatedAt'>;
