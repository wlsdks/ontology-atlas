import assert from 'node:assert/strict';
import test from 'node:test';

import { createDependencyOrderQueries } from './dependency-order-queries.mjs';

const edge = (from, to, via) => ({ from, to, via, resolved: true });
const edges = [edge('a', 'b', 'dependencies'), edge('b', 'a', 'capabilities'), edge('c', 'a', 'dependencies')];
const nodes = ['a', 'b', 'c'].map((slug) => ({ slug }));
const outgoing = new Map();
for (const row of edges) outgoing.set(row.from, [...(outgoing.get(row.from) ?? []), row]);

const { cycles, topologicalOrder } = createDependencyOrderQueries({
  nodes,
  edges,
  outgoing,
  nodeBySlug: new Map(nodes.map((node) => [node.slug, node])),
  pathNodes: (slugs) => slugs,
  formatCompiledEdge: (row) => row,
  limitLayers: (layers) => layers,
});

test('without types, cycles and topological order follow dependencies only', () => {
  const found = cycles();
  assert.deepEqual(found.relationTypes, ['dependencies']);
  assert.equal(found.totalCycles, 0);
  assert.deepEqual(topologicalOrder().relationTypes, ['dependencies']);
});

test('an empty types list means no relation filter, as it does for every other operation', () => {
  const found = cycles({ types: [] });
  assert.equal(found.relationTypes, null);
  assert.equal(found.totalCycles, 1, 'the a and b loop runs through a dependencies and a capabilities edge');
  const order = topologicalOrder({ types: [] });
  assert.equal(order.relationTypes, null);
  assert.equal(order.selectedEdges, 3);
  assert.equal(order.acyclic, false);
});

test('a truncated search with no type filter still offers a safer query without a types key', () => {
  const found = cycles({ types: [], searchBudget: 1 });
  assert.equal(found.truncatedByBudget, true);
  assert.equal(found.evidence.saferQuery.types, undefined);
  assert.equal(cycles({ searchBudget: 1 }).evidence.saferQuery.types[0], 'dependencies');
});
