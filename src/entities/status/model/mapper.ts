import { Timestamp, type DocumentData } from 'firebase/firestore';
import type { Status, StatusInput } from './types';

export function fromFirestore(id: string, data: DocumentData): Status {
  return {
    id,
    label: String(data.label ?? id),
    labelEn: data.labelEn ? String(data.labelEn) : undefined,
    order: typeof data.order === 'number' ? data.order : 0,
    dotColor: (data.dotColor as Status['dotColor']) ?? 'neutral',
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export function toFirestore(input: StatusInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    label: input.label,
    order: input.order,
    dotColor: input.dotColor,
  };
  if (input.labelEn !== undefined) payload.labelEn = input.labelEn;
  return payload;
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}
