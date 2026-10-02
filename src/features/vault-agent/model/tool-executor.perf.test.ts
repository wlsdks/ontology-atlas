import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';

import { createToolExecutor } from './tool-executor';
import type { VaultReadPort } from './vault-read-port';

function pathFixture(shape: 'hub' | 'chain', edgeCount: number) {
  const nodes: KnowledgeGraphNode[] = Array.from({ length: edgeCount + 2 }, (_, index) => ({
    id: `capability:${index}`,
    title: `node-${index}`,
    kind: 'capability',
    agentSlug: `capabilities/node-${index}`,
    hasOwnDocument: true,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: 'fixture',
  }));
  const edges: KnowledgeGraphEdge[] = Array.from({ length: edgeCount }, (_, index) => ({
    id: `edge-${index}`,
    from: nodes[shape === 'hub' ? 0 : index].id,
    to: nodes[index + 1].id,
    type: 'depends_on',
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: 'fixture',
  }));
  const port: VaultReadPort = { nodes, edges, docs: [], readDocText: async () => null };
  const degrees = new Map<string, number>();
  let maxDegree = 0;
  for (const edge of edges) {
    for (const id of [edge.from, edge.to]) {
      const degree = (degrees.get(id) ?? 0) + 1;
      degrees.set(id, degree);
      maxDegree = Math.max(maxDegree, degree);
    }
  }
  return {
    execute: createToolExecutor(port),
    call: {
      id: 'path-perf',
      name: 'find_path',
      args: { from: nodes[1].agentSlug, to: nodes[edgeCount + 1].agentSlug, maxHops: 3 },
      argsInvalid: false,
    },
    nodeCount: nodes.length,
    edgeCount: edges.length,
    maxDegree,
  };
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe('vault agent path-query cost', () => {
  it('keeps equal-sized hub and chain queries within a fivefold ratio', async () => {
    const hub = pathFixture('hub', 20_000);
    const chain = pathFixture('chain', 20_000);
    expect(hub.maxDegree).toBe(hub.edgeCount);
    expect(chain.maxDegree).toBe(2);
    for (const fixture of [hub, chain]) {
      expect(fixture.nodeCount).toBe(20_002);
      expect(fixture.edgeCount).toBe(20_000);
      const result = await fixture.execute(fixture.call);
      expect(result.outcome).toBe('ok');
      expect(JSON.parse(result.content).found).toBe(false);
    }

    const hubTimes: number[] = [];
    const chainTimes: number[] = [];
    for (let round = 0; round < 7; round += 1) {
      const order = round % 2 === 0 ? [hub, chain] : [chain, hub];
      for (const fixture of order) {
        const start = performance.now();
        await fixture.execute(fixture.call);
        (fixture === hub ? hubTimes : chainTimes).push(performance.now() - start);
      }
    }
    const hubMs = median(hubTimes);
    const chainMs = median(chainTimes);
    console.log(JSON.stringify({ nodes: hub.nodeCount, edges: hub.edgeCount, hubMs, chainMs, ratio: hubMs / chainMs }));
    expect(chainMs).toBeGreaterThan(0);
    expect(hubMs / chainMs).toBeLessThan(5);
  });
});
