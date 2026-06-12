import { describe, expect, it } from 'vitest';
import Graph from 'graphology';
import {
  collectSigmaDragCluster,
  snapshotSigmaDragClusterOffsets,
} from './drag-cluster';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from './graph-build';

function node(
  label: string,
  x: number,
  y: number,
  ontologyTopKind: SigmaNodeAttrs['ontologyTopKind'],
): SigmaNodeAttrs {
  return {
    x,
    y,
    size: 8,
    label,
    color: 'rgba(255,255,255,0.8)',
    borderColor: 'transparent',
    outerBorderColor: 'transparent',
    projectSlug: label,
    categoryId: 'test',
    isHub: false,
    ownerKey: 'test',
    ontologyTopKind,
    isOntology: true,
  };
}

describe('drag-cluster', () => {
  it('collects the dragged ontology node with its closest connected meaning neighbors', () => {
    const graph = new Graph<SigmaNodeAttrs, SigmaEdgeAttrs>();
    graph.addNode('domain:views', node('Views', 10, 20, 'domain'));
    graph.addNode('capability:map', node('Map', 24, 28, 'capability'));
    graph.addNode('capability:drawer', node('Drawer', 28, 40, 'capability'));
    graph.addNode('element:small', node('Small', 120, 80, 'element'));
    graph.addNode('domain:vault', node('Vault', -40, 8, 'domain'));
    graph.addEdgeWithKey('views-map', 'domain:views', 'capability:map', {
      size: 1,
      color: 'rgba(255,255,255,0.2)',
      kind: 'contains',
      relationType: 'contains',
    });
    graph.addEdgeWithKey('views-drawer', 'domain:views', 'capability:drawer', {
      size: 1,
      color: 'rgba(255,255,255,0.2)',
      kind: 'contains',
      relationType: 'contains',
    });
    graph.addEdgeWithKey('views-small', 'domain:views', 'element:small', {
      size: 1,
      color: 'rgba(255,255,255,0.2)',
      kind: 'depends-on',
      relationType: 'depends_on',
    });
    graph.addEdgeWithKey('views-vault', 'domain:views', 'domain:vault', {
      size: 1,
      color: 'rgba(255,255,255,0.2)',
      kind: 'depends-on',
      relationType: 'depends_on',
    });

    expect([...collectSigmaDragCluster(graph, 'domain:views', 3)]).toEqual([
      'domain:views',
      'capability:drawer',
      'capability:map',
    ]);

    expect(
      snapshotSigmaDragClusterOffsets(
        graph,
        'domain:views',
        new Set(['domain:views', 'capability:map']),
      ),
    ).toEqual(
      new Map([
        ['domain:views', { dx: 0, dy: 0 }],
        ['capability:map', { dx: 14, dy: 8 }],
      ]),
    );
  });
});
