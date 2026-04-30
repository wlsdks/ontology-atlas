/**
 * Ontology import 형식 — export v1 와 round-trip 호환.
 *
 * spec: docs/superpowers/specs/2026-04-28-ontology-export-import.md
 */

import type {
  OntologyExportPayloadV1,
  SerializedKnowledgeGraphEdge,
  SerializedKnowledgeGraphNode,
  SerializedOntologyClass,
  SerializedOntologyRelation,
} from '@/shared/lib/ontology-export';

/**
 * Conflict 정책 — 같은 ID 노드/엣지가 이미 있을 때 동작.
 *
 * - `skip` — 기존 유지, import 항목 무시 (부분 backup 복원)
 * - `overwrite` — import 항목으로 교체. evidenceIds 합집합 (마스터 → mirror)
 * - `merge-manual-wins` — 기존이 source=manual 이면 보존, 그 외 overwrite (default)
 */
export type ImportConflictPolicy = 'skip' | 'overwrite' | 'merge-manual-wins';

export interface ImportPreview {
  payload: OntologyExportPayloadV1;
  /** payload.nodes 중 활성 graph 에 같은 id 가 있는 것. */
  conflictNodeIds: string[];
  /** payload.edges 중 활성 graph 에 같은 id 가 있는 것. */
  conflictEdgeIds: string[];
  /** payload.tbox.classes 중 활성 TBox 에 같은 id 가 있는 것. */
  conflictClassIds: string[];
  /** payload.tbox.relations 중 활성 TBox 에 같은 id 가 있는 것. */
  conflictRelationIds: string[];
}

/**
 * 실행 input — UI 가 사용자 확인 후 호출.
 */
export interface ApplyImportInput {
  payload: OntologyExportPayloadV1;
  accountId: string;
  /** 저장 시 지표용 — Firestore rules 가 manual write 검증에 활용. */
  importedBy: string;
  /** 정책 — 동일 ID 처리. */
  conflictPolicy: ImportConflictPolicy;
  /**
   * TBox snapshot 도 import 할지 — true 면 새 TBox version 생성 + 활성화.
   * false 면 nodes/edges 만 (기본 — 작은 슬라이스 안전).
   */
  importTBox?: boolean;
  /** 진행 표시 callback. */
  onProgress?: (progress: { writtenNodes: number; writtenEdges: number }) => void;
}

export interface ApplyImportResult {
  importedNodeCount: number;
  importedEdgeCount: number;
  skippedNodeIds: string[];
  skippedEdgeIds: string[];
  /** TBox import 한 경우 새 version ID. */
  newTBoxVersionId?: string;
}

/** Re-export — UI 가 한 곳에서 받기. */
export type {
  OntologyExportPayloadV1,
  SerializedKnowledgeGraphEdge,
  SerializedKnowledgeGraphNode,
  SerializedOntologyClass,
  SerializedOntologyRelation,
};
