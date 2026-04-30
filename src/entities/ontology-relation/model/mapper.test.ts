import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { fromFirestore, toFirestore } from './mapper';
import type { OntologyRelationInput } from './types';

describe('ontology-relation mapper', () => {
  const inputContains: OntologyRelationInput = {
    id: 'contains',
    name: '포함',
    inverseName: 'belongs_to',
    description: '상위가 하위를 품음',
    sourceClassIds: ['project', 'domain'],
    targetClassIds: ['domain', 'capability'],
    category: 'structure',
    symmetric: false,
    transitive: true,
    version: 1,
    createdBy: 'system',
  };

  it('toFirestore drops undefined optional fields', () => {
    const minimal: OntologyRelationInput = {
      ...inputContains,
      inverseName: undefined,
      description: undefined,
    };
    const payload = toFirestore(minimal);
    expect(payload).not.toHaveProperty('inverseName');
    expect(payload).not.toHaveProperty('description');
    expect(payload).toMatchObject({
      name: '포함',
      sourceClassIds: ['project', 'domain'],
      targetClassIds: ['domain', 'capability'],
      category: 'structure',
      symmetric: false,
      transitive: true,
      version: 1,
      createdBy: 'system',
    });
  });

  it('fromFirestore reconstructs the relation with timestamps', () => {
    const payload = {
      ...toFirestore(inputContains),
      createdAt: Timestamp.fromDate(new Date('2026-04-27T10:00:00Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-04-27T11:00:00Z')),
    };
    const relation = fromFirestore('contains', payload);
    expect(relation.id).toBe('contains');
    expect(relation.name).toBe('포함');
    expect(relation.inverseName).toBe('belongs_to');
    expect(relation.sourceClassIds).toEqual(['project', 'domain']);
    expect(relation.symmetric).toBe(false);
    expect(relation.transitive).toBe(true);
    expect(relation.createdAt.toISOString()).toBe('2026-04-27T10:00:00.000Z');
    expect(relation.updatedAt?.toISOString()).toBe('2026-04-27T11:00:00.000Z');
  });

  it('fromFirestore falls back to weak category for unknown values', () => {
    const relation = fromFirestore('weird', {
      name: '???',
      sourceClassIds: [],
      targetClassIds: [],
      category: 'invalid-category',
      symmetric: false,
      transitive: false,
      version: 1,
      createdBy: 'system',
    });
    expect(relation.category).toBe('weak');
  });

  it('fromFirestore filters non-string entries from class ID arrays', () => {
    const relation = fromFirestore('mixed', {
      name: '혼합',
      sourceClassIds: ['project', 42, null, 'domain'],
      targetClassIds: 'not-an-array',
      category: 'behavior',
      symmetric: false,
      transitive: false,
      version: 1,
      createdBy: 'system',
    });
    expect(relation.sourceClassIds).toEqual(['project', 'domain']);
    expect(relation.targetClassIds).toEqual([]);
  });
});
