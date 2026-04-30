import { describe, expect, it } from 'vitest';
import {
  fromFirestoreKnowledgeGraphEdge,
  fromFirestoreKnowledgeGraphNode,
} from './mapper';
import {
  isKnowledgeGraphSource,
  KNOWLEDGE_GRAPH_SOURCES,
} from './types';

describe('KNOWLEDGE_GRAPH_SOURCES', () => {
  it('contains exactly the manual + extraction values', () => {
    expect(KNOWLEDGE_GRAPH_SOURCES).toHaveLength(2);
    expect(KNOWLEDGE_GRAPH_SOURCES).toContain('manual');
    expect(KNOWLEDGE_GRAPH_SOURCES).toContain('extraction');
  });
});

describe('isKnowledgeGraphSource', () => {
  it('accepts canonical values', () => {
    expect(isKnowledgeGraphSource('manual')).toBe(true);
    expect(isKnowledgeGraphSource('extraction')).toBe(true);
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isKnowledgeGraphSource('auto')).toBe(false);
    expect(isKnowledgeGraphSource('')).toBe(false);
    expect(isKnowledgeGraphSource(undefined)).toBe(false);
    expect(isKnowledgeGraphSource(null)).toBe(false);
    expect(isKnowledgeGraphSource(123)).toBe(false);
  });
});

describe('fromFirestoreKnowledgeGraphNode source fields', () => {
  it('reads source/manualAuthor/manualNote when present', () => {
    const node = fromFirestoreKnowledgeGraphNode('cap.x', {
      title: 'X',
      kind: 'capability',
      source: 'manual',
      manualAuthor: 'uid_jinan',
      manualNote: '직접 추가',
    });
    expect(node.source).toBe('manual');
    expect(node.manualAuthor).toBe('uid_jinan');
    expect(node.manualNote).toBe('직접 추가');
  });

  it('leaves new fields undefined for legacy data', () => {
    const node = fromFirestoreKnowledgeGraphNode('cap.legacy', {
      title: 'Legacy',
      kind: 'capability',
    });
    expect(node.source).toBeUndefined();
    expect(node.manualAuthor).toBeUndefined();
    expect(node.manualNote).toBeUndefined();
  });

  it('rejects invalid source values', () => {
    const node = fromFirestoreKnowledgeGraphNode('cap.x', {
      title: 'X',
      kind: 'capability',
      source: 'auto',
      manualAuthor: 123,
      manualNote: { a: 1 },
    });
    expect(node.source).toBeUndefined();
    expect(node.manualAuthor).toBeUndefined();
    expect(node.manualNote).toBeUndefined();
  });
});

describe('fromFirestoreKnowledgeGraphEdge source fields', () => {
  it('reads source/manualAuthor/manualNote when present', () => {
    const edge = fromFirestoreKnowledgeGraphEdge('e1', {
      from: 'a',
      to: 'b',
      type: 'related_to',
      source: 'manual',
      manualAuthor: 'uid_jinan',
      manualNote: '관계 직접 추가',
    });
    expect(edge.source).toBe('manual');
    expect(edge.manualAuthor).toBe('uid_jinan');
    expect(edge.manualNote).toBe('관계 직접 추가');
  });

  it('leaves new fields undefined for legacy data', () => {
    const edge = fromFirestoreKnowledgeGraphEdge('e2', {
      from: 'a',
      to: 'b',
      type: 'related_to',
    });
    expect(edge.source).toBeUndefined();
    expect(edge.manualAuthor).toBeUndefined();
    expect(edge.manualNote).toBeUndefined();
  });
});
