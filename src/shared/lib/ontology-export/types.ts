/**
 * Ontology export 형식 v1 — JSON.
 *
 * 사용자가 자기 ontology graph 를 시스템 밖으로 가져갈 수 있도록 하는 표준
 * 직렬화 포맷. round-trip (export → import) 에서 의미 보존을 목표.
 *
 * 도입 동기: docs/superpowers/specs/2026-04-28-ontology-export-import.md
 *
 * 호환성:
 * - `version` 으로 future schema 변경 식별. import 시 호환 가능 버전 검증.
 * - 미래 `ontology-export-v2` 추가 시 import 가 v1 도 지원하도록.
 */

import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from '@/entities/knowledge-graph';
import type { OntologyClass } from '@/entities/ontology-class';
import type { OntologyRelation } from '@/entities/ontology-relation';

export const ONTOLOGY_EXPORT_VERSION = 'ontology-export-v1' as const;

export type OntologyExportVersion = typeof ONTOLOGY_EXPORT_VERSION;

/**
 * Export 의 옵션 — 호출자가 무엇을 포함할지 결정.
 */
export interface OntologyExportOptions {
  /** 활성 TBox 클래스/관계 — 미제공 시 export 에서 제외 (best-effort). */
  classes?: readonly OntologyClass[];
  relations?: readonly OntologyRelation[];
  /** Public projection 포함 여부 — false 가 default (private canonical 만). */
  includePublicProjection?: boolean;
  /** 사람이 읽는 메모 (예: "백업 2026-04-28"). */
  note?: string;
}

/**
 * 직렬화된 export payload. Date 는 ISO string 으로 박힘 (JSON 호환).
 *
 * 모든 필드는 사용자 데이터의 충실 복제 — Firestore 의 source-of-truth 와
 * 1:1. 미래 import 가 같은 schema 를 기대.
 */
export interface OntologyExportPayloadV1 {
  version: OntologyExportVersion;
  exportedAt: string; // ISO
  exportedBy: string; // uid
  accountId: string;
  /** 활성 TBox version ID — fact 노드의 tboxVersionId 와 정합. legacy 는 'legacy-v0'. */
  tboxVersionId: string;
  /** 사람이 읽는 export 메모 (옵션). */
  note?: string;
  tbox: {
    classes: SerializedOntologyClass[];
    relations: SerializedOntologyRelation[];
  };
  nodes: SerializedKnowledgeGraphNode[];
  edges: SerializedKnowledgeGraphEdge[];
}

/**
 * Date → ISO string 변환된 형태. 호출자가 import 시 다시 Date 로 복원.
 */
export interface SerializedKnowledgeGraphNode
  extends Omit<KnowledgeGraphNode, 'lastApprovedAt' | 'publishedAt'> {
  lastApprovedAt: string; // ISO
  publishedAt?: string; // ISO
}

export interface SerializedKnowledgeGraphEdge
  extends Omit<KnowledgeGraphEdge, 'lastApprovedAt' | 'publishedAt'> {
  lastApprovedAt: string;
  publishedAt?: string;
}

export interface SerializedOntologyClass
  extends Omit<OntologyClass, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt?: string;
}

export interface SerializedOntologyRelation
  extends Omit<OntologyRelation, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt?: string;
}

/**
 * 직렬화 함수의 입력. 호출자가 Firestore 에서 모은 raw 도메인 객체를 그대로 넘김.
 */
export interface OntologyExportInput {
  exportedBy: string;
  accountId: string;
  tboxVersionId?: string;
  nodes: readonly KnowledgeGraphNode[];
  edges: readonly KnowledgeGraphEdge[];
  options?: OntologyExportOptions;
}
