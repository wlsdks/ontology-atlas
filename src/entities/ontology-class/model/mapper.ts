import { Timestamp, type DocumentData } from 'firebase/firestore';
import type {
  OntologyClass,
  OntologyClassInput,
  OntologyElementType,
} from './types';

const ELEMENT_TYPES: OntologyElementType[] = [
  'service',
  'api',
  'agent',
  'workflow',
  'schema',
  'data-store',
  'ui',
  'prompt',
  'integration',
];

function toElementType(value: unknown): OntologyElementType | undefined {
  if (typeof value !== 'string') return undefined;
  return ELEMENT_TYPES.includes(value as OntologyElementType)
    ? (value as OntologyElementType)
    : undefined;
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

export function fromFirestore(id: string, data: DocumentData): OntologyClass {
  return {
    id,
    name: String(data.name ?? id),
    description: data.description ? String(data.description) : undefined,
    parentClassId: data.parentClassId ? String(data.parentClassId) : undefined,
    elementType: toElementType(data.elementType),
    version: typeof data.version === 'number' ? data.version : 1,
    createdAt: toDate(data.createdAt),
    createdBy: String(data.createdBy ?? 'system'),
    updatedAt: toOptionalDate(data.updatedAt),
  };
}

export function toFirestore(input: OntologyClassInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: input.name,
    version: input.version,
    createdBy: input.createdBy,
  };
  if (input.description !== undefined) payload.description = input.description;
  if (input.parentClassId !== undefined) payload.parentClassId = input.parentClassId;
  if (input.elementType !== undefined) payload.elementType = input.elementType;
  return payload;
}
