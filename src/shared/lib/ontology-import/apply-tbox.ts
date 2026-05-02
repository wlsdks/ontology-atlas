/**
 * TBox import 실행 — 기존 helper 재사용.
 *
 * Phase 3 첫 슬라이스: TBox (classes + relations) 만 import. fact graph
 * (수만 노드) import 는 Phase 4 Cloud Function 도입 후 안전하게 처리.
 *
 * 흐름:
 *   1. 정책 적용 — payload TBox + 기존 활성 TBox 합치거나 교체
 *   2. createTBoxVersion + activateTBoxVersion (기존 helper)
 *   3. 새 versionId 반환
 */

// shared → entities helper (firestore write) 재사용. P3 Phase 4 cloud function 도입 시
// features/ 로 옮길 예정. 임시 boundaries 예외.
/* eslint-disable boundaries/dependencies */
import type { ActiveTBox } from '@/entities/ontology-tbox/api';
import {
  createTBoxVersion,
  activateTBoxVersion,
  generateTBoxVersionId,
} from '@/entities/ontology-tbox/api';
/* eslint-enable boundaries/dependencies */
import type { OntologyClass } from '@/entities/ontology-class';
import type { OntologyRelation } from '@/entities/ontology-relation';
import type {
  ImportConflictPolicy,
  OntologyExportPayloadV1,
  SerializedOntologyClass,
  SerializedOntologyRelation,
} from './types';

function deserializeClass(input: SerializedOntologyClass): OntologyClass {
  return {
    ...input,
    createdAt: new Date(input.createdAt),
    updatedAt: input.updatedAt ? new Date(input.updatedAt) : undefined,
  };
}

function deserializeRelation(input: SerializedOntologyRelation): OntologyRelation {
  return {
    ...input,
    createdAt: new Date(input.createdAt),
    updatedAt: input.updatedAt ? new Date(input.updatedAt) : undefined,
  };
}

export interface ApplyTBoxImportInput {
  payload: OntologyExportPayloadV1;
  accountId: string;
  current: ActiveTBox;
  importedBy: string;
  /**
   * 정책 — 같은 ID 클래스/관계 처리.
   *  - `skip`: 기존 유지, payload 항목 제외
   *  - `overwrite`: payload 항목으로 교체 (기존 manual edit 손실 가능)
   *  - `merge-manual-wins`: 기존 보존, payload 신규만 추가
   *
   * fact graph 와 다르게 TBox 항목은 source 필드 없음 → manual-wins 의 의미는
   * "기존 정의 보존" 으로 해석.
   */
  conflictPolicy: ImportConflictPolicy;
  /** changeNote 자동 생성 — 사용자 메모 추가 가능. */
  noteSuffix?: string;
  now?: Date;
}

export interface ApplyTBoxImportResult {
  versionId: string;
  importedClassIds: string[];
  importedRelationIds: string[];
  skippedClassIds: string[];
  skippedRelationIds: string[];
}

/**
 * 활성 TBox + payload TBox 를 정책에 따라 합쳐 새 version 으로 활성화.
 */
export async function applyTBoxImport(
  input: ApplyTBoxImportInput,
): Promise<ApplyTBoxImportResult> {
  const { payload, accountId, current, importedBy, conflictPolicy } = input;

  const incomingClasses = payload.tbox.classes.map(deserializeClass);
  const incomingRelations = payload.tbox.relations.map(deserializeRelation);
  const currentClassIds = new Set(current.classes.map((c) => c.id));
  const currentRelationIds = new Set(current.relations.map((r) => r.id));

  const importedClassIds: string[] = [];
  const importedRelationIds: string[] = [];
  const skippedClassIds: string[] = [];
  const skippedRelationIds: string[] = [];

  const mergedClasses: OntologyClass[] = [...current.classes];
  for (const incoming of incomingClasses) {
    if (!currentClassIds.has(incoming.id)) {
      // 신규 — 항상 추가.
      mergedClasses.push(incoming);
      importedClassIds.push(incoming.id);
      continue;
    }
    if (conflictPolicy === 'overwrite') {
      const idx = mergedClasses.findIndex((c) => c.id === incoming.id);
      if (idx >= 0) {
        mergedClasses[idx] = incoming;
        importedClassIds.push(incoming.id);
      }
    } else {
      // skip / merge-manual-wins — 기존 유지.
      skippedClassIds.push(incoming.id);
    }
  }

  const mergedRelations: OntologyRelation[] = [...current.relations];
  for (const incoming of incomingRelations) {
    if (!currentRelationIds.has(incoming.id)) {
      mergedRelations.push(incoming);
      importedRelationIds.push(incoming.id);
      continue;
    }
    if (conflictPolicy === 'overwrite') {
      const idx = mergedRelations.findIndex((r) => r.id === incoming.id);
      if (idx >= 0) {
        mergedRelations[idx] = incoming;
        importedRelationIds.push(incoming.id);
      }
    } else {
      skippedRelationIds.push(incoming.id);
    }
  }

  const sortedClasses = mergedClasses.sort((a, b) => a.id.localeCompare(b.id));
  const sortedRelations = mergedRelations.sort((a, b) => a.id.localeCompare(b.id));

  const now = input.now ?? new Date();
  const versionId = generateTBoxVersionId(now);

  const baseNote = `TBox import — 클래스 +${importedClassIds.length} / 관계 +${importedRelationIds.length} (정책: ${conflictPolicy})`;
  const changeNote = input.noteSuffix
    ? `${baseNote} — ${input.noteSuffix}`
    : baseNote;

  await createTBoxVersion({
    versionId,
    accountId,
    createdBy: importedBy,
    changeNote,
    classes: sortedClasses,
    relations: sortedRelations,
  });
  await activateTBoxVersion({
    accountId,
    versionId,
    activatedBy: importedBy,
  });

  return {
    versionId,
    importedClassIds,
    importedRelationIds,
    skippedClassIds,
    skippedRelationIds,
  };
}
