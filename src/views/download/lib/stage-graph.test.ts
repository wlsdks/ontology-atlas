import { describe, expect, it } from 'vitest';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { buildStageGraph } from './stage-graph';

/** The hub invariants twin home's `buildOntologyMapGraph`: at most one hub. */
const node = (id: string, kind: KnowledgeGraphNode['kind']): KnowledgeGraphNode =>
  ({
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
  }) as unknown as KnowledgeGraphNode;

const edge = (from: string, to: string, type: string): KnowledgeGraphEdge =>
  ({ from, to, type, evidenceIds: [] }) as unknown as KnowledgeGraphEdge;

describe('buildStageGraph', () => {
  it('marks no hub when nothing is referenced', () => {
    const { nodes } = buildStageGraph(
      [node('a', 'domain'), node('b', 'domain'), node('c', 'domain')],
      [],
    );
    expect(nodes.every((n) => !n.isHub)).toBe(true);
  });

  it('marks exactly one hub: the most referenced, ties broken by ascending id', () => {
    const { nodes } = buildStageGraph(
      [node('p', 'project'), node('x', 'capability'), node('y', 'capability')],
      [edge('p', 'x', 'contains'), edge('y', 'x', 'depends_on'), edge('p', 'y', 'contains')],
    );
    expect(nodes.filter((n) => n.isHub)).toHaveLength(1);
    expect(nodes.find((n) => n.isHub)?.id).toBe('x');
  });

  it('drops self-referencing edges', () => {
    const { edges } = buildStageGraph(
      [node('a', 'domain'), node('b', 'capability')],
      [edge('a', 'a', 'related_to'), edge('a', 'b', 'contains')],
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'a', target: 'b', kind: 'contains' });
  });

  it('terminates on cyclic containment', () => {
    const { nodes } = buildStageGraph(
      [node('a', 'domain'), node('b', 'capability')],
      [edge('a', 'b', 'contains'), edge('b', 'a', 'contains')],
    );
    expect(nodes).toHaveLength(2);
    for (const n of nodes) expect(Number.isFinite(n.descendantCount)).toBe(true);
  });

  /** Path sums once made the hub disagree with the caption beside it. */
  it('counts a descendant once across multiple parents instead of summing paths', () => {
    const { nodes } = buildStageGraph(
      [
        node('p', 'project'),
        node('d1', 'domain'),
        node('d2', 'domain'),
        node('shared', 'capability'),
        node('leaf', 'element'),
      ],
      [
        edge('p', 'd1', 'contains'),
        edge('p', 'd2', 'contains'),
        edge('d1', 'shared', 'contains'),
        edge('d2', 'shared', 'contains'),
        edge('shared', 'leaf', 'contains'),
      ],
    );
    const countById = new Map(nodes.map((n) => [n.id, n.descendantCount]));
    // capability 1 + element 1 = 2. A path sum would give 4.
    expect(countById.get('p')).toBe(2);
    expect(countById.get('d1')).toBe(2);
    expect(countById.get('shared')).toBe(1);
    expect(countById.get('leaf')).toBe(0);
  });

  it('invents no fact the gateway has no evidence for', () => {
    const { nodes, edges } = buildStageGraph(
      [node('a', 'domain'), node('b', 'element')],
      [edge('a', 'b', 'contains')],
    );
    expect(nodes.every((n) => n.recentlyUpdated === false && n.stale === false)).toBe(true);
    expect(nodes.every((n) => n.ownerKey === null)).toBe(true);
    expect(edges.every((e) => e.relationQuality === null)).toBe(true);
  });
});
