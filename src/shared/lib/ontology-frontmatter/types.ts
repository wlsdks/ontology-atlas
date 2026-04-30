/**
 * Ontology md frontmatter v1 — `2026-04-27-ontology-frontmatter-contract.md` 의 TS 표현.
 */

export type OntologyKind = 'project' | 'domain' | 'capability' | 'element' | 'document';

export type OntologyDocumentStatus = 'draft' | 'active' | 'deprecated' | 'archived';

export type OntologyElementTypeId =
  | 'service'
  | 'api'
  | 'agent'
  | 'workflow'
  | 'schema'
  | 'data-store'
  | 'ui'
  | 'prompt'
  | 'integration';

export type OntologyEdgeType =
  | 'contains'
  | 'belongs_to'
  | 'depends_on'
  | 'implements'
  | 'uses'
  | 'describes'
  | 'related_to';

export interface OntologyFrontmatterRelation {
  type: OntologyEdgeType;
  target: string;
  note?: string;
}

export interface OntologyFrontmatter {
  /** 필수 — kebab-case ID. */
  id: string;
  /** 필수 — TBox 5 클래스. */
  kind: OntologyKind;
  /** 필수 — project 노드 ID. */
  project: string;
  /** 필수 — display title. */
  title: string;
  /** 필수 — schema 버전. 현재 1. */
  version: number;
  /** 권장 — 상위 domain ID. */
  domain?: string;
  /** 권장 — 문서 상태. */
  status?: OntologyDocumentStatus;
  /** 권장 — 노드 병합용 alias 목록. */
  aliases?: string[];
  /** 권장 — 자유 라벨. */
  tags?: string[];
  /** kind=element 인 경우 권장. */
  elementType?: OntologyElementTypeId;
  /** 명시 관계 — frontmatter-declared edges. */
  relates?: OntologyFrontmatterRelation[];
}

/**
 * 처리 등급 — frontmatter 완비도에 따른 신뢰도 상한 결정.
 *
 * A strict   — 필수 5 + 권장 4 모두     → confidence 상한 1.0 (자동 승인 가능)
 * B lenient  — 필수만, 권장 일부 누락    → confidence 상한 0.84
 * C freeform — 필수 누락 / frontmatter X → confidence 상한 0.59 (자동 반영 금지)
 */
export type OntologyDocumentGrade = 'A' | 'B' | 'C';

export interface ParsedOntologyDocument {
  /** 검증을 통과한 frontmatter. 필수 누락 시 partial 일 수 있음 (grade=C). */
  frontmatter: Partial<OntologyFrontmatter>;
  /** frontmatter 블록을 제외한 본문. */
  body: string;
  /** 처리 등급. */
  grade: OntologyDocumentGrade;
  /** 파싱·검증 경고 목록. extraction warnings 에 그대로 흘려보냄. */
  warnings: string[];
}
