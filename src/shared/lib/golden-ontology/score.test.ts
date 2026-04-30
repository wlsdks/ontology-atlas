import { describe, expect, it } from 'vitest';
import { scoreOntology } from './score';
import type {
  ActualOntology,
  GoldenOntologyExpected,
} from './types';

const fixture: GoldenOntologyExpected = {
  id: 'design-system-sample',
  description: 'mini DESIGN-SYSTEM spec',
  nodes: [
    { title: 'Design System', kind: 'project' },
    { title: 'Color', kind: 'domain' },
    { title: 'Indigo Brand', kind: 'element' },
    { title: 'Typography', kind: 'domain' },
  ],
  edges: [
    { from: 'Color', to: 'Design System', type: 'belongs_to' },
    { from: 'Indigo Brand', to: 'Color', type: 'belongs_to' },
    { from: 'Typography', to: 'Design System', type: 'belongs_to' },
  ],
};

function actualPerfect(): ActualOntology {
  return {
    nodes: [
      { tempId: 'n1', title: 'Design System', kind: 'project' },
      { tempId: 'n2', title: 'Color', kind: 'domain' },
      { tempId: 'n3', title: 'Indigo Brand', kind: 'element' },
      { tempId: 'n4', title: 'Typography', kind: 'domain' },
    ],
    edges: [
      { fromTempId: 'n2', toTempId: 'n1', type: 'belongs_to' },
      { fromTempId: 'n3', toTempId: 'n2', type: 'belongs_to' },
      { fromTempId: 'n4', toTempId: 'n1', type: 'belongs_to' },
    ],
  };
}

describe('scoreOntology — base', () => {
  it('returns fixtureId in result', () => {
    const result = scoreOntology(fixture, actualPerfect());
    expect(result.fixtureId).toBe('design-system-sample');
  });

  it('perfect match — precision/recall/f1 all 1', () => {
    const result = scoreOntology(fixture, actualPerfect());
    expect(result.nodes.precision).toBe(1);
    expect(result.nodes.recall).toBe(1);
    expect(result.nodes.f1).toBe(1);
    expect(result.edges.precision).toBe(1);
    expect(result.edges.recall).toBe(1);
    expect(result.edges.f1).toBe(1);
    expect(result.overallF1).toBe(1);
  });

  it('perfect match — diff arrays all empty except matched', () => {
    const result = scoreOntology(fixture, actualPerfect());
    expect(result.nodes.matched).toHaveLength(4);
    expect(result.nodes.onlyInActual).toHaveLength(0);
    expect(result.nodes.onlyInExpected).toHaveLength(0);
    expect(result.edges.matched).toHaveLength(3);
    expect(result.edges.onlyInActual).toHaveLength(0);
    expect(result.edges.onlyInExpected).toHaveLength(0);
  });
});

describe('scoreOntology — node diff', () => {
  it('detects extracted-only node as false positive', () => {
    const actual = actualPerfect();
    actual.nodes.push({ tempId: 'n5', title: 'Spacing', kind: 'domain' });
    const result = scoreOntology(fixture, actual);
    expect(result.nodes.onlyInActual).toEqual([
      { title: 'Spacing', kind: 'domain' },
    ]);
    expect(result.nodes.precision).toBeCloseTo(4 / 5);
    expect(result.nodes.recall).toBe(1);
  });

  it('detects expected-only node as false negative', () => {
    const actual = actualPerfect();
    // remove typography from extraction
    actual.nodes = actual.nodes.filter((n) => n.title !== 'Typography');
    actual.edges = actual.edges.filter((e) => e.fromTempId !== 'n4');
    const result = scoreOntology(fixture, actual);
    expect(result.nodes.onlyInExpected).toEqual([
      { title: 'Typography', kind: 'domain' },
    ]);
    expect(result.nodes.recall).toBeCloseTo(3 / 4);
  });

  it('case-insensitive title match', () => {
    const actual = actualPerfect();
    actual.nodes[0]!.title = 'design system'; // lowercase
    const result = scoreOntology(fixture, actual);
    expect(result.nodes.matched).toHaveLength(4);
    expect(result.nodes.onlyInActual).toHaveLength(0);
  });

  it('different kind for same title — counted as separate node (mismatch)', () => {
    const actual = actualPerfect();
    actual.nodes[1]!.kind = 'capability'; // Color was 'domain'
    const result = scoreOntology(fixture, actual);
    // Color/domain in expected → onlyInExpected
    // Color/capability in actual → onlyInActual
    expect(result.nodes.onlyInExpected).toContainEqual({
      title: 'Color',
      kind: 'domain',
    });
    expect(result.nodes.onlyInActual).toContainEqual({
      title: 'Color',
      kind: 'capability',
    });
  });
});

describe('scoreOntology — edge diff', () => {
  it('detects edge with wrong type as both onlyInExpected and onlyInActual', () => {
    const actual = actualPerfect();
    actual.edges[0] = { fromTempId: 'n2', toTempId: 'n1', type: 'related_to' };
    const result = scoreOntology(fixture, actual);
    expect(result.edges.onlyInExpected).toContainEqual({
      from: 'Color',
      to: 'Design System',
      type: 'belongs_to',
    });
    expect(result.edges.onlyInActual).toContainEqual({
      from: 'Color',
      to: 'Design System',
      type: 'related_to',
    });
  });

  it('dangling edge (tempId not in nodes) → false positive in onlyInActual', () => {
    const actual = actualPerfect();
    actual.edges.push({ fromTempId: 'ghost', toTempId: 'n1', type: 'uses' });
    const result = scoreOntology(fixture, actual);
    expect(result.edges.onlyInActual).toContainEqual({
      from: 'ghost',
      to: 'n1',
      type: 'uses',
    });
    // matched 3 (perfect base) + 1 dangling false positive
    expect(result.edges.precision).toBeCloseTo(3 / 4);
    expect(result.edges.recall).toBe(1);
  });

  it('missing edge → false negative', () => {
    const actual = actualPerfect();
    actual.edges = actual.edges.slice(0, 2); // drop last edge
    const result = scoreOntology(fixture, actual);
    expect(result.edges.onlyInExpected).toEqual([
      { from: 'Typography', to: 'Design System', type: 'belongs_to' },
    ]);
    expect(result.edges.recall).toBeCloseTo(2 / 3);
    expect(result.edges.precision).toBe(1);
  });
});

describe('scoreOntology — empty / degenerate', () => {
  it('empty actual → 0 precision/recall/f1', () => {
    const result = scoreOntology(fixture, { nodes: [], edges: [] });
    expect(result.nodes.precision).toBe(0);
    expect(result.nodes.recall).toBe(0);
    expect(result.nodes.f1).toBe(0);
    expect(result.edges.precision).toBe(0);
    expect(result.edges.recall).toBe(0);
    expect(result.overallF1).toBe(0);
  });

  it('empty expected → all extracted are false positive (precision 0, recall undefined → 0)', () => {
    const emptyFixture: GoldenOntologyExpected = {
      id: 'empty',
      nodes: [],
      edges: [],
    };
    const result = scoreOntology(emptyFixture, actualPerfect());
    expect(result.nodes.precision).toBe(0);
    // tp=0, fn=0 → recall returns 0 by guard
    expect(result.nodes.recall).toBe(0);
  });

  it('overallF1 averages node and edge f1', () => {
    const actual = actualPerfect();
    // drop one edge: edges f1 becomes 2*1*(2/3)/(1+2/3) = 0.8
    actual.edges = actual.edges.slice(0, 2);
    const result = scoreOntology(fixture, actual);
    expect(result.nodes.f1).toBe(1);
    expect(result.edges.f1).toBeCloseTo(0.8);
    expect(result.overallF1).toBeCloseTo(0.9);
  });
});
