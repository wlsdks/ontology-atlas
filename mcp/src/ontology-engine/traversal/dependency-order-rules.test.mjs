import assert from 'node:assert/strict';
import test from 'node:test';

import { findDependencyCycles, layerByPrerequisites } from './dependency-order-rules.mjs';

const edge = (from, to, via = 'dependencies', resolved = true) => ({ from, to, via, resolved });
const nodesOf = (...slugs) => slugs.map((slug) => ({ slug }));
const outgoingOf = (edges) => {
  const map = new Map();
  for (const row of edges) map.set(row.from, [...(map.get(row.from) ?? []), row]);
  return map;
};
const dependencies = new Set(['dependencies']);

function cyclesOf(edges, slugs, options = {}) {
  return findDependencyCycles({
    nodes: nodesOf(...slugs),
    outgoing: outgoingOf(edges),
    typeSet: dependencies,
    maxDepth: 8,
    limit: 20,
    searchBudget: 10_000,
    ...options,
  });
}

test('a cycle is found once, starting at its smallest slug, whichever node the search enters from', () => {
  const found = cyclesOf([edge('c', 'a'), edge('a', 'b'), edge('b', 'c')], ['a', 'b', 'c']);
  assert.equal(found.totalCycles, 1);
  assert.deepEqual(found.shortest.map((cycle) => cycle.nodes), [['a', 'b', 'c', 'a']]);
  assert.equal(found.truncatedByBudget, false);
});

test('a graph without a loop reports zero cycles and a self reference counts as a cycle of one', () => {
  assert.equal(cyclesOf([edge('a', 'b'), edge('b', 'c')], ['a', 'b', 'c']).totalCycles, 0);
  const selfLoop = cyclesOf([edge('a', 'a')], ['a']);
  assert.equal(selfLoop.totalCycles, 1);
  assert.deepEqual(selfLoop.shortest[0].nodes, ['a', 'a']);
});

test('only resolved edges of the requested relation types form a cycle', () => {
  const loop = [edge('a', 'b'), edge('b', 'a')];
  assert.equal(cyclesOf([edge('a', 'b'), edge('b', 'a', 'dependencies', false)], ['a', 'b']).totalCycles, 0);
  assert.equal(cyclesOf([edge('a', 'b'), edge('b', 'a', 'capabilities')], ['a', 'b']).totalCycles, 0);
  assert.equal(cyclesOf(loop, ['a', 'b']).totalCycles, 1);
  assert.equal(cyclesOf(loop, ['a'], { nodes: nodesOf('a') }).totalCycles, 0, 'an edge to a slug that is not a node is not followed');
});

test('a cycle longer than maxDepth hops is not reported', () => {
  const triangle = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];
  assert.equal(cyclesOf(triangle, ['a', 'b', 'c'], { maxDepth: 2 }).totalCycles, 0);
  assert.equal(cyclesOf(triangle, ['a', 'b', 'c'], { maxDepth: 3 }).totalCycles, 1);
  assert.equal(cyclesOf(triangle, ['a', 'b', 'c'], { maxDepth: 0 }).totalCycles, 0);
  assert.equal(cyclesOf([edge('a', 'a')], ['a'], { maxDepth: 0 }).totalCycles, 0, 'zero hops searches nothing, not even a self reference');
});

test('the shortest cycles are kept up to limit, while totalCycles still counts every one found', () => {
  const edges = [edge('a', 'b'), edge('b', 'a'), edge('b', 'c'), edge('c', 'a')];
  const all = cyclesOf(edges, ['a', 'b', 'c']);
  assert.equal(all.totalCycles, 2);
  assert.deepEqual(all.shortest.map((cycle) => cycle.nodes.length - 1), [2, 3]);
  const limited = cyclesOf(edges, ['a', 'b', 'c'], { limit: 1 });
  assert.equal(limited.totalCycles, 2);
  assert.deepEqual(limited.shortest.map((cycle) => cycle.key), ['a->b']);
});

test('a shorter cycle wins a place over a longer one even when the longer one sorts first by name', () => {
  const edges = [edge('a', 'c'), edge('c', 'a'), edge('a', 'b'), edge('b', 'd'), edge('d', 'a')];
  const found = cyclesOf(edges, ['a', 'b', 'c', 'd'], { limit: 1 });
  assert.equal(found.totalCycles, 2);
  assert.deepEqual(found.shortest.map((cycle) => cycle.key), ['a->c']);
});

test('a cycle as short as the longest one kept still competes for the place by name', () => {
  const edges = ['d', 'c', 'b'].map((to) => edge('a', to)).concat(['d', 'c', 'b'].map((from) => edge(from, 'a')));
  const found = cyclesOf(edges, ['a', 'b', 'c', 'd'], { limit: 1 });
  assert.equal(found.totalCycles, 3);
  assert.deepEqual(found.shortest.map((cycle) => cycle.key), ['a->b']);
});

test('a search that runs out of budget says so and stops expanding states', () => {
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];
  const found = cyclesOf(edges, ['a', 'b', 'c'], { searchBudget: 1 });
  assert.equal(found.truncatedByBudget, true);
  assert.equal(found.expandedStates, 1);
  assert.equal(found.totalCycles, 0);
});

test('prerequisites come before the nodes that depend on them, layer by layer', () => {
  // a depends on b and c; b depends on d.
  const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd')];
  const order = layerByPrerequisites({ edges, typeSet: dependencies });
  assert.deepEqual(order.layers, [
    { rank: 0, slugs: ['c', 'd'] },
    { rank: 1, slugs: ['b'] },
    { rank: 2, slugs: ['a'] },
  ]);
  assert.deepEqual(order.ordered, [
    { rank: 0, slug: 'c' }, { rank: 0, slug: 'd' }, { rank: 1, slug: 'b' }, { rank: 2, slug: 'a' },
  ]);
  assert.deepEqual(order.blocked, []);
  assert.equal(order.selectedEdges.length, 3);
  assert.equal(order.slugCount, 4);
});

test('each layer is listed in slug order, not in the order its members became ready', () => {
  const edges = [edge('z', 'x'), edge('b', 'y')];
  const order = layerByPrerequisites({ edges, typeSet: dependencies });
  assert.deepEqual(order.layers.map((layer) => layer.slugs), [['x', 'y'], ['b', 'z']]);
});

test('a duplicated edge does not add a second prerequisite', () => {
  const edges = [edge('a', 'b'), edge('a', 'b')];
  const order = layerByPrerequisites({ edges, typeSet: dependencies });
  assert.deepEqual(order.layers.map((layer) => layer.slugs), [['b'], ['a']]);
  assert.deepEqual(order.blocked, []);
});

test('nodes in a cycle, and nodes that wait on one, stay blocked with how many prerequisites remain', () => {
  const edges = [edge('a', 'b'), edge('b', 'a'), edge('c', 'a'), edge('d', 'e')];
  const order = layerByPrerequisites({ edges, typeSet: dependencies });
  assert.deepEqual(order.layers.map((layer) => layer.slugs), [['e'], ['d']]);
  assert.deepEqual(order.blocked, [
    { slug: 'a', remainingInDegree: 1 },
    { slug: 'b', remainingInDegree: 1 },
    { slug: 'c', remainingInDegree: 1 },
  ]);
});

test('unresolved and other-typed edges are not selected, and unconnected nodes never join a layer', () => {
  const edges = [edge('a', 'b'), edge('a', 'z', 'dependencies', false), edge('b', 'c', 'capabilities')];
  const order = layerByPrerequisites({ edges, typeSet: dependencies });
  assert.deepEqual(order.layers.map((layer) => layer.slugs), [['b'], ['a']]);
  assert.equal(order.selectedEdges.length, 1);
  assert.equal(order.slugCount, 2);
});
