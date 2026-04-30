/**
 * Conflict detection — payload 의 id 들을 활성 graph + TBox 와 비교.
 *
 * 순수 함수. UI 가 사용자 결정 (skip / overwrite / merge) 전 보여줌.
 */

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import type { OntologyClass } from '@/entities/ontology-class';
import type { OntologyRelation } from '@/entities/ontology-relation';
import type { ImportPreview, OntologyExportPayloadV1 } from './types';

export interface DetectConflictsInput {
  payload: OntologyExportPayloadV1;
  currentNodes: readonly KnowledgeGraphNode[];
  currentEdges: readonly KnowledgeGraphEdge[];
  currentClasses: readonly OntologyClass[];
  currentRelations: readonly OntologyRelation[];
}

export function detectImportConflicts(input: DetectConflictsInput): ImportPreview {
  const nodeIds = new Set(input.currentNodes.map((n) => n.id));
  const edgeIds = new Set(input.currentEdges.map((e) => e.id));
  const classIds = new Set(input.currentClasses.map((c) => c.id));
  const relationIds = new Set(input.currentRelations.map((r) => r.id));

  return {
    payload: input.payload,
    conflictNodeIds: input.payload.nodes
      .filter((n) => nodeIds.has(n.id))
      .map((n) => n.id),
    conflictEdgeIds: input.payload.edges
      .filter((e) => edgeIds.has(e.id))
      .map((e) => e.id),
    conflictClassIds: input.payload.tbox.classes
      .filter((c) => classIds.has(c.id))
      .map((c) => c.id),
    conflictRelationIds: input.payload.tbox.relations
      .filter((r) => relationIds.has(r.id))
      .map((r) => r.id),
  };
}
