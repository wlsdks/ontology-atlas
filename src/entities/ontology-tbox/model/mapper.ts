import { Timestamp, type DocumentData } from 'firebase/firestore';
import {
  fromFirestore as fromClassDoc,
  toFirestore as toClassDoc,
  type OntologyClass,
} from '@/entities/ontology-class';
import {
  fromFirestore as fromRelationDoc,
  toFirestore as toRelationDoc,
  type OntologyRelation,
} from '@/entities/ontology-relation';
import type {
  OntologyTBoxActiveState,
  OntologyTBoxActiveStateInput,
  OntologyTBoxVersion,
  OntologyTBoxVersionInput,
} from './types';

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}

/**
 * Firestore document → OntologyTBoxVersion.
 *
 * `classes` / `relations` 는 doc 안에 inline 으로 박힌 immutable snapshot.
 * 각 항목이 ontology-class / ontology-relation entity 의 fromFirestore 와
 * 같은 schema 라 그쪽 mapper 를 재사용해 일관성 유지.
 */
export function versionFromFirestore(
  id: string,
  data: DocumentData,
): OntologyTBoxVersion {
  const rawClasses = Array.isArray(data.classes) ? data.classes : [];
  const rawRelations = Array.isArray(data.relations) ? data.relations : [];
  return {
    versionId: id,
    accountId: String(data.accountId ?? ''),
    createdAt: toDate(data.createdAt),
    createdBy: String(data.createdBy ?? 'system'),
    changeNote: data.changeNote ? String(data.changeNote) : undefined,
    classes: rawClasses
      .map((entry: DocumentData) =>
        fromClassDoc(String(entry.id ?? ''), entry as DocumentData),
      )
      .sort((a: OntologyClass, b: OntologyClass) => a.id.localeCompare(b.id)),
    relations: rawRelations
      .map((entry: DocumentData) =>
        fromRelationDoc(String(entry.id ?? ''), entry as DocumentData),
      )
      .sort((a: OntologyRelation, b: OntologyRelation) =>
        a.id.localeCompare(b.id),
      ),
  };
}

export function versionToFirestore(
  input: OntologyTBoxVersionInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    accountId: input.accountId,
    createdBy: input.createdBy,
    classes: input.classes.map((cls) => ({
      id: cls.id,
      ...toClassDoc(cls),
    })),
    relations: input.relations.map((rel) => ({
      id: rel.id,
      ...toRelationDoc(rel),
    })),
  };
  if (input.changeNote !== undefined) payload.changeNote = input.changeNote;
  return payload;
}

export function activeStateFromFirestore(
  id: string,
  data: DocumentData,
): OntologyTBoxActiveState {
  return {
    accountId: id,
    versionId: String(data.versionId ?? ''),
    activatedAt: toDate(data.activatedAt),
    activatedBy: String(data.activatedBy ?? 'system'),
  };
}

export function activeStateToFirestore(
  input: OntologyTBoxActiveStateInput,
): Record<string, unknown> {
  return {
    versionId: input.versionId,
    activatedBy: input.activatedBy,
  };
}
