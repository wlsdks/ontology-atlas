import { describe, expect, it } from 'vitest';
import Graph from 'graphology';
import { startPhysics } from './physics';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from './graph-build';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeGraph(): Graph<SigmaNodeAttrs, SigmaEdgeAttrs> {
  const graph = new Graph<SigmaNodeAttrs, SigmaEdgeAttrs>();
  const base = {
    size: 5,
    color: '#888',
    borderColor: '#999',
    outerBorderColor: 'rgba(0,0,0,0)',
    projectSlug: '',
    categoryId: '',
    isHub: false,
    ownerKey: 'unassigned',
  };
  graph.addNode('a', { ...base, x: 0, y: 0, label: 'A' });
  graph.addNode('b', { ...base, x: 80, y: 0, label: 'B' });
  graph.addEdge('a', 'b', { size: 1, color: '#fff', kind: 'contains' });
  return graph;
}

describe('startPhysics', () => {
  it('commits grouped drag positions on release instead of reheating drift', async () => {
    const graph = makeGraph();
    const physics = startPhysics(graph, undefined, {
      autoStart: false,
      initialAlpha: 0.25,
    });
    try {
      const positions = new Map([
        ['a', { x: 140, y: 10 }],
        ['b', { x: 150, y: 10 }],
      ]);

      physics.pinGroup(positions);
      physics.dragGroup(positions);
      await wait(80);
      physics.releaseGroup(['a', 'b']);

      const releaseA = {
        x: graph.getNodeAttribute('a', 'x'),
        y: graph.getNodeAttribute('a', 'y'),
      };
      const releaseB = {
        x: graph.getNodeAttribute('b', 'x'),
        y: graph.getNodeAttribute('b', 'y'),
      };
      await wait(350);

      expect(graph.getNodeAttribute('a', 'x')).toBeCloseTo(releaseA.x, 3);
      expect(graph.getNodeAttribute('a', 'y')).toBeCloseTo(releaseA.y, 3);
      expect(graph.getNodeAttribute('b', 'x')).toBeCloseTo(releaseB.x, 3);
      expect(graph.getNodeAttribute('b', 'y')).toBeCloseTo(releaseB.y, 3);
    } finally {
      physics.stop();
    }
  });
});
