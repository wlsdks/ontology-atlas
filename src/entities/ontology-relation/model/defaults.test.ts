import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ONTOLOGY_RELATIONS,
  isOntologyRelationId,
  isRelationApplicable,
} from './defaults';
import type { OntologyRelation } from './types';

function toRelation(relation: (typeof DEFAULT_ONTOLOGY_RELATIONS)[number]): OntologyRelation {
  return {
    ...relation,
    createdAt: new Date('2026-04-27T00:00:00Z'),
  };
}

describe('DEFAULT_ONTOLOGY_RELATIONS', () => {
  it('contains the 7 v1 relation types', () => {
    expect(DEFAULT_ONTOLOGY_RELATIONS).toHaveLength(7);
    const ids = DEFAULT_ONTOLOGY_RELATIONS.map((r) => r.id).sort();
    expect(ids).toEqual([
      'belongs_to',
      'contains',
      'depends_on',
      'describes',
      'implements',
      'related_to',
      'uses',
    ]);
  });

  it('groups structure relations correctly', () => {
    const structure = DEFAULT_ONTOLOGY_RELATIONS.filter((r) => r.category === 'structure');
    expect(structure.map((r) => r.id).sort()).toEqual(['belongs_to', 'contains']);
  });

  it('describes is the only evidence relation and starts from document', () => {
    const evidence = DEFAULT_ONTOLOGY_RELATIONS.filter((r) => r.category === 'evidence');
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.id).toBe('describes');
    expect(evidence[0]!.sourceClassIds).toEqual(['document']);
  });

  it('related_to is symmetric and unconstrained', () => {
    const related = DEFAULT_ONTOLOGY_RELATIONS.find((r) => r.id === 'related_to');
    expect(related?.symmetric).toBe(true);
    expect(related?.sourceClassIds).toEqual([]);
    expect(related?.targetClassIds).toEqual([]);
  });

  it('contains and belongs_to are transitive', () => {
    const contains = DEFAULT_ONTOLOGY_RELATIONS.find((r) => r.id === 'contains');
    const belongsTo = DEFAULT_ONTOLOGY_RELATIONS.find((r) => r.id === 'belongs_to');
    expect(contains?.transitive).toBe(true);
    expect(belongsTo?.transitive).toBe(true);
  });

  it('depends_on / uses / implements are not transitive (not assumed by inference)', () => {
    const behavior = DEFAULT_ONTOLOGY_RELATIONS.filter((r) => r.category === 'behavior');
    for (const relation of behavior) {
      expect(relation.transitive).toBe(false);
    }
  });
});

describe('isOntologyRelationId', () => {
  const relations = DEFAULT_ONTOLOGY_RELATIONS.map(toRelation);

  it('returns true for known relation ID', () => {
    expect(isOntologyRelationId('depends_on', relations)).toBe(true);
  });

  it('returns false for unknown relation ID', () => {
    expect(isOntologyRelationId('eats', relations)).toBe(false);
  });
});

describe('isRelationApplicable', () => {
  const relations = DEFAULT_ONTOLOGY_RELATIONS.map(toRelation);

  it('allows constrained source/target match', () => {
    const implementsRel = relations.find((r) => r.id === 'implements')!;
    expect(isRelationApplicable(implementsRel, 'element', 'capability')).toBe(true);
  });

  it('rejects when source is not allowed', () => {
    const implementsRel = relations.find((r) => r.id === 'implements')!;
    expect(isRelationApplicable(implementsRel, 'project', 'capability')).toBe(false);
  });

  it('rejects when target is not allowed', () => {
    const implementsRel = relations.find((r) => r.id === 'implements')!;
    expect(isRelationApplicable(implementsRel, 'element', 'project')).toBe(false);
  });

  it('allows any class when sourceClassIds and targetClassIds are empty (related_to)', () => {
    const related = relations.find((r) => r.id === 'related_to')!;
    expect(isRelationApplicable(related, 'project', 'document')).toBe(true);
    expect(isRelationApplicable(related, 'element', 'element')).toBe(true);
  });

  it('rejects describes when source is not document', () => {
    const describes = relations.find((r) => r.id === 'describes')!;
    expect(isRelationApplicable(describes, 'project', 'capability')).toBe(false);
    expect(isRelationApplicable(describes, 'document', 'capability')).toBe(true);
  });
});
