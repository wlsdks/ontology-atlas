import { describe, expect, it } from 'vitest';
import { buildEvidenceRailModel } from './evidence-rail';
import type { StageGraph } from './stage-graph';

const node = (id: string, kind: 'project' | 'domain' | 'capability' | 'element') => ({
  id,
  label: `L:${id}`,
  kind,
  size: 0,
  x: 0,
  y: 0,
  isHub: false,
  ownerKey: null,
  recentlyUpdated: false,
  stale: false,
  fullDegree: 0,
  descendantCount: 0,
});

const edge = (
  source: string,
  target: string,
  relationType: string,
  kind: 'contains' | 'depends',
) => ({
  source,
  target,
  relationType,
  relationQuality: null,
  evidenceCount: 0,
  kind,
  declaredBySlug: null,
});

const graph: StageGraph = {
  nodes: [
    node('p', 'project'),
    node('d1', 'domain'),
    node('c1', 'capability'),
    node('c2', 'capability'),
    node('e1', 'element'),
  ],
  edges: [
    edge('p', 'd1', 'contains', 'contains'),
    edge('d1', 'c1', 'contains', 'contains'),
    edge('d1', 'c2', 'contains', 'contains'),
    edge('c2', 'c1', 'depends_on', 'depends'),
    edge('e1', 'c1', 'depends_on', 'depends'),
    edge('c1', 'e1', 'uses', 'depends'),
  ],
};

describe('buildEvidenceRailModel', () => {
  it('counts kinds in charter order and skips absent kinds', () => {
    const { census } = buildEvidenceRailModel(graph);
    expect(census).toEqual([
      { kind: 'project', count: 1 },
      { kind: 'domain', count: 1 },
      { kind: 'capability', count: 2 },
      { kind: 'element', count: 1 },
    ]);
  });

  it('picks the most common relation types with a deterministic first edge', () => {
    const { relations } = buildEvidenceRailModel(graph);
    expect(relations[0]).toEqual({ source: 'L:d1', type: 'contains', target: 'L:c1' });
    expect(relations.map((line) => line.type)).toEqual(['contains', 'depends_on', 'uses']);
  });

  it('names the node the most depends-edges point at', () => {
    const { impact } = buildEvidenceRailModel(graph);
    expect(impact).toEqual({ name: 'L:c1', count: 2 });
  });

  it('returns no impact row when nothing depends on anything', () => {
    const { impact } = buildEvidenceRailModel({
      nodes: graph.nodes,
      edges: graph.edges.filter((e) => e.kind === 'contains'),
    });
    expect(impact).toBeNull();
  });
});
