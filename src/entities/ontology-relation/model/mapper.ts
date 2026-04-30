import { Timestamp, type DocumentData } from 'firebase/firestore';
import type {
  OntologyRelation,
  OntologyRelationCategory,
  OntologyRelationInput,
} from './types';

const CATEGORIES: OntologyRelationCategory[] = ['structure', 'behavior', 'evidence', 'weak'];

function toCategory(value: unknown): OntologyRelationCategory {
  if (typeof value === 'string' && CATEGORIES.includes(value as OntologyRelationCategory)) {
    return value as OntologyRelationCategory;
  }
  return 'weak';
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}

function toOptionalDate(value: unknown): Date | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
}

export function fromFirestore(id: string, data: DocumentData): OntologyRelation {
  return {
    id,
    name: String(data.name ?? id),
    inverseName: data.inverseName ? String(data.inverseName) : undefined,
    description: data.description ? String(data.description) : undefined,
    sourceClassIds: toStringArray(data.sourceClassIds),
    targetClassIds: toStringArray(data.targetClassIds),
    category: toCategory(data.category),
    symmetric: Boolean(data.symmetric),
    transitive: Boolean(data.transitive),
    version: typeof data.version === 'number' ? data.version : 1,
    createdAt: toDate(data.createdAt),
    createdBy: String(data.createdBy ?? 'system'),
    updatedAt: toOptionalDate(data.updatedAt),
  };
}

export function toFirestore(input: OntologyRelationInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: input.name,
    sourceClassIds: input.sourceClassIds,
    targetClassIds: input.targetClassIds,
    category: input.category,
    symmetric: input.symmetric,
    transitive: input.transitive,
    version: input.version,
    createdBy: input.createdBy,
  };
  if (input.inverseName !== undefined) payload.inverseName = input.inverseName;
  if (input.description !== undefined) payload.description = input.description;
  return payload;
}
