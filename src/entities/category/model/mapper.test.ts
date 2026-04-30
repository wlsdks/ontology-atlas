import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { fromFirestore, toFirestore } from './mapper';

describe('category mapper', () => {
  it('maps firestore data into Category', () => {
    const now = new Date('2026-04-12T12:00:00Z');
    const ts = Timestamp.fromDate(now);

    const result = fromFirestore('in-progress', {
      label: '작업중',
      labelEn: 'In Progress',
      order: 1,
      position: { x: 10, y: 20 },
      size: { width: 100, height: 200 },
      radius: 300,
      borderStyle: 'underline',
      sideLabelText: 'IP',
      createdAt: ts,
      updatedAt: ts,
    });

    expect(result.id).toBe('in-progress');
    expect(result.position).toEqual({ x: 10, y: 20 });
    expect(result.size).toEqual({ width: 100, height: 200 });
    expect(result.createdAt).toEqual(now);
  });

  it('omits undefined optional fields when serializing', () => {
    expect(
      toFirestore({
        id: 'consulting',
        label: '컨설팅',
        order: 2,
        position: { x: 1, y: 2 },
        size: { width: 3, height: 4 },
        radius: 5,
        borderStyle: 'sideLabel',
      }),
    ).toEqual({
      label: '컨설팅',
      order: 2,
      position: { x: 1, y: 2 },
      size: { width: 3, height: 4 },
      radius: 5,
      borderStyle: 'sideLabel',
    });
  });
});
