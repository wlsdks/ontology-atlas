import { Timestamp, type DocumentData } from 'firebase/firestore';
import type { Category, CategoryInput } from './types';

/**
 * Firestore 문서 → Category.
 */
export function fromFirestore(id: string, data: DocumentData): Category {
  const position = (data.position as Category['position']) ?? { x: 0, y: 0 };
  const size = (data.size as Category['size']) ?? { width: 600, height: 600 };
  return {
    id,
    label: String(data.label ?? id),
    labelEn: data.labelEn ? String(data.labelEn) : undefined,
    order: typeof data.order === 'number' ? data.order : 0,
    position: { x: Number(position.x ?? 0), y: Number(position.y ?? 0) },
    size: {
      width: Number(size.width ?? 600),
      height: Number(size.height ?? 600),
    },
    radius: typeof data.radius === 'number' ? data.radius : 300,
    borderStyle: (data.borderStyle as Category['borderStyle']) ?? 'solid',
    sideLabelText: data.sideLabelText ? String(data.sideLabelText) : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * CategoryInput → Firestore 쓰기 페이로드. undefined 필드는 제거 (Firestore 호환).
 */
export function toFirestore(input: CategoryInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    label: input.label,
    order: input.order,
    position: input.position,
    size: input.size,
    radius: input.radius,
    borderStyle: input.borderStyle,
  };
  if (input.labelEn !== undefined) payload.labelEn = input.labelEn;
  if (input.sideLabelText !== undefined) payload.sideLabelText = input.sideLabelText;
  return payload;
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}
