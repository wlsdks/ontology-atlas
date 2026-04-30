import { describe, expect, it } from 'vitest';
import { isKnowledgeEdgeType, KNOWLEDGE_EDGE_TYPES } from './types';
import { DEFAULT_ONTOLOGY_RELATIONS } from '@/entities/ontology-relation';

describe('KNOWLEDGE_EDGE_TYPES', () => {
  it('contains exactly 7 edge types (TBox v1)', () => {
    expect(KNOWLEDGE_EDGE_TYPES).toHaveLength(7);
  });

  it('matches the ontologyRelations seed IDs (TBox / canonical edge enum 정합)', () => {
    const tboxIds = DEFAULT_ONTOLOGY_RELATIONS.map((r) => r.id).sort();
    const enumIds = [...KNOWLEDGE_EDGE_TYPES].sort();
    expect(enumIds).toEqual(tboxIds);
  });

  it('includes the structure relations added in T-2 (contains, belongs_to)', () => {
    expect(KNOWLEDGE_EDGE_TYPES).toContain('contains');
    expect(KNOWLEDGE_EDGE_TYPES).toContain('belongs_to');
  });
});

describe('isKnowledgeEdgeType', () => {
  it('returns true for each canonical edge type', () => {
    for (const value of KNOWLEDGE_EDGE_TYPES) {
      expect(isKnowledgeEdgeType(value)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isKnowledgeEdgeType('refers_to')).toBe(false);
    expect(isKnowledgeEdgeType('extends')).toBe(false);
    expect(isKnowledgeEdgeType('')).toBe(false);
  });

  it('returns false for non-strings', () => {
    expect(isKnowledgeEdgeType(null)).toBe(false);
    expect(isKnowledgeEdgeType(undefined)).toBe(false);
    expect(isKnowledgeEdgeType(123)).toBe(false);
    expect(isKnowledgeEdgeType({})).toBe(false);
  });
});
