import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { fromFirestore, toFirestore } from './mapper';

describe('status mapper', () => {
  it('maps firestore data into Status', () => {
    const now = new Date('2026-04-12T12:00:00Z');
    const ts = Timestamp.fromDate(now);

    const result = fromFirestore('live', {
      label: '운영중',
      labelEn: 'Live',
      order: 3,
      dotColor: 'success',
      createdAt: ts,
      updatedAt: ts,
    });

    expect(result.id).toBe('live');
    expect(result.dotColor).toBe('success');
    expect(result.updatedAt).toEqual(now);
  });

  it('omits undefined optional fields when serializing', () => {
    expect(
      toFirestore({
        id: 'paused',
        label: '일시중단',
        order: 4,
        dotColor: 'paused',
      }),
    ).toEqual({
      label: '일시중단',
      order: 4,
      dotColor: 'paused',
    });
  });
});
