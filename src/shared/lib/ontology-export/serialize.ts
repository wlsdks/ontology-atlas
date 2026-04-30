/**
 * Ontology export 직렬화 — 도메인 객체 → JSON-호환 payload.
 *
 * 순수 함수. Firestore IO 없음 — 호출자가 미리 fetch 해 넘긴 데이터를 그대로
 * v1 형식으로 변환. Test 는 IO 의존 없이 단순.
 */

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import type { OntologyClass } from '@/entities/ontology-class';
import type { OntologyRelation } from '@/entities/ontology-relation';
import {
  ONTOLOGY_EXPORT_VERSION,
  type OntologyExportInput,
  type OntologyExportPayloadV1,
  type SerializedKnowledgeGraphEdge,
  type SerializedKnowledgeGraphNode,
  type SerializedOntologyClass,
  type SerializedOntologyRelation,
} from './types';

function dateToIso(value: Date | undefined): string | undefined {
  if (!value) return undefined;
  if (Number.isNaN(value.getTime())) return undefined;
  return value.toISOString();
}

function serializeNode(node: KnowledgeGraphNode): SerializedKnowledgeGraphNode {
  return {
    ...node,
    lastApprovedAt: node.lastApprovedAt.toISOString(),
    publishedAt: dateToIso(node.publishedAt),
  };
}

function serializeEdge(edge: KnowledgeGraphEdge): SerializedKnowledgeGraphEdge {
  return {
    ...edge,
    lastApprovedAt: edge.lastApprovedAt.toISOString(),
    publishedAt: dateToIso(edge.publishedAt),
  };
}

function serializeClass(cls: OntologyClass): SerializedOntologyClass {
  return {
    ...cls,
    createdAt: cls.createdAt.toISOString(),
    updatedAt: dateToIso(cls.updatedAt),
  };
}

function serializeRelation(rel: OntologyRelation): SerializedOntologyRelation {
  return {
    ...rel,
    createdAt: rel.createdAt.toISOString(),
    updatedAt: dateToIso(rel.updatedAt),
  };
}

/**
 * 입력 도메인 객체 묶음을 v1 payload 로 변환.
 *
 * - `exportedAt` 은 호출 시점 timestamp (ISO).
 * - `tboxVersionId` 미지정 시 `legacy-v0`.
 * - 클래스/관계 미지정 시 빈 배열 (사용자가 명시 export 에서 제외).
 *
 * Date 직렬화: 모든 Date 는 ISO string. NaN/invalid Date 는 undefined.
 *
 * 정렬: nodes/edges/classes/relations 모두 id ASC 으로 정렬해 결정적 출력
 * (round-trip diff 노이즈 0).
 */
export function serializeOntologyExportV1(
  input: OntologyExportInput,
  now: Date = new Date(),
): OntologyExportPayloadV1 {
  const sortById = <T extends { id: string }>(items: readonly T[]): T[] =>
    [...items].sort((a, b) => a.id.localeCompare(b.id));

  const classes = sortById(input.options?.classes ?? []).map(serializeClass);
  const relations = sortById(input.options?.relations ?? []).map(serializeRelation);
  const nodes = sortById(input.nodes).map(serializeNode);
  const edges = sortById(input.edges).map(serializeEdge);

  const payload: OntologyExportPayloadV1 = {
    version: ONTOLOGY_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    exportedBy: input.exportedBy,
    accountId: input.accountId,
    tboxVersionId: input.tboxVersionId ?? 'legacy-v0',
    tbox: { classes, relations },
    nodes,
    edges,
  };
  if (input.options?.note !== undefined) {
    payload.note = input.options.note;
  }
  return payload;
}

/**
 * Payload → JSON string (browser download 용). pretty print 옵션.
 */
export function exportPayloadToJson(
  payload: OntologyExportPayloadV1,
  options: { pretty?: boolean } = {},
): string {
  return options.pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
}

/**
 * Payload → suggested filename. 사용자 OS 의 download 디렉토리에 저장.
 *
 * 예: `ontology-export-acc1-2026-04-28.json`
 */
export function suggestExportFilename(payload: OntologyExportPayloadV1): string {
  const date = payload.exportedAt.slice(0, 10); // YYYY-MM-DD
  const safeAccount = payload.accountId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `ontology-export-${safeAccount}-${date}.json`;
}
