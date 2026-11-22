import assert from 'node:assert/strict';
import test from 'node:test';

import { connectedComponents, groupCommunities } from './cluster-rules.mjs';

const nodesOf = (...slugs) => slugs.map((slug) => ({ slug }));
const neighborsFrom = (pairs) => (slug) => pairs
  .filter(([from, to]) => from === slug || to === slug)
  .map(([from, to]) => ({ next: from === slug ? to : from }));

test('connected components are the undirected reachable groups, largest first with sorted slugs', () => {
  const groups = connectedComponents(nodesOf('c', 'a', 'b', 'x', 'y', 'z'), neighborsFrom([['x', 'y'], ['y', 'z'], ['b', 'c']]));
  assert.deepEqual(groups, [
    { slugs: ['x', 'y', 'z'], size: 3 },
    { slugs: ['b', 'c'], size: 2 },
    { slugs: ['a'], size: 1 },
  ]);
});

test('components of equal size are ordered by their first slug, and a loop is visited once', () => {
  const groups = connectedComponents(nodesOf('q', 'p', 'b', 'a'), neighborsFrom([['q', 'p'], ['a', 'b'], ['a', 'b'], ['p', 'q']]));
  assert.deepEqual(groups.map((group) => group.slugs), [['a', 'b'], ['p', 'q']]);
});

test('no nodes make no components', () => {
  assert.deepEqual(connectedComponents([], () => []), []);
});

const node = (slug, kind, domain, inDegree = 0, outDegree = 0) => ({ slug, kind, domain, inDegree, outDegree });
const edge = (from, to, via = 'dependencies', resolved = true) => ({ from, to, via, resolved });

function communitiesOf(nodes, edges, labelByType, typeSet = null) {
  const nodeBySlug = new Map(nodes.map((row) => [row.slug, row]));
  return groupCommunities({ nodes, edges, labels: new Map(Object.entries(labelByType)), typeSet, nodeBySlug });
}

test('communities group by label, with the largest group first and edges counted inside and across', () => {
  const nodes = [node('a', 'capability', 'd1', 1, 1), node('b', 'capability', 'd1', 3, 0), node('c', 'element', 'd2', 0, 1), node('d', 'element', 'd2')];
  const edges = [edge('a', 'b'), edge('c', 'a'), edge('c', 'd'), edge('a', 'gone', 'dependencies', false)];
  const { groups, communityBySlug, crossCommunityEdges } = communitiesOf(nodes, edges, { a: 'L1', b: 'L1', c: 'L2', d: 'L2' });
  assert.deepEqual(groups.map((group) => [group.label, group.slugs, group.size]), [['L1', ['a', 'b'], 2], ['L2', ['c', 'd'], 2]]);
  const [first, second] = groups;
  assert.equal(first.internalEdges, 1);
  assert.equal(first.boundaryEdges, 1, 'the c to a edge crosses its boundary; an unresolved edge is ignored');
  assert.equal(second.internalEdges, 1);
  assert.deepEqual(first.kinds, { capability: 2 });
  assert.deepEqual(first.domains, { d1: 2 });
  assert.equal(first.representative.slug, 'b', 'the best-connected node represents the group, not the first by name');
  assert.deepEqual([...communityBySlug], [['a', 1], ['b', 1], ['c', 2], ['d', 2]]);
  assert.deepEqual(crossCommunityEdges.map((row) => `${row.from}>${row.to}`), ['c>a']);
});

test('a bigger group comes first, then the group with more inside edges, then the representative slug', () => {
  const nodes = [node('a'), node('b'), node('c'), node('d'), node('e')];
  const { groups } = communitiesOf(nodes, [edge('d', 'e')], { a: 'big', b: 'big', c: 'big', d: 'pair-with-edge', e: 'pair-with-edge' });
  assert.deepEqual(groups.map((group) => group.label), ['big', 'pair-with-edge']);
  const tied = communitiesOf([node('a'), node('b'), node('c'), node('d')], [edge('c', 'd')], { a: 'x', b: 'x', c: 'y', d: 'y' });
  assert.deepEqual(tied.groups.map((group) => group.label), ['y', 'x'], 'more internal edges wins a size tie');
  const nameTied = communitiesOf([node('n'), node('m')], [], { n: 'two', m: 'one' });
  assert.deepEqual(nameTied.groups.map((group) => group.label), ['one', 'two'], 'then the representative slug decides');
});

test('a node without a label forms its own community under its slug', () => {
  const { groups } = communitiesOf([node('solo'), node('a'), node('b')], [], { a: 'L', b: 'L' });
  assert.deepEqual(groups.map((group) => group.label), ['L', 'solo']);
});

test('only edges of the requested relation types count toward boundaries and crossings', () => {
  const nodes = [node('a'), node('b')];
  const edges = [edge('a', 'b', 'capabilities'), edge('b', 'a', 'dependencies')];
  const { groups, crossCommunityEdges } = communitiesOf(nodes, edges, { a: 'L1', b: 'L2' }, new Set(['dependencies']));
  assert.deepEqual(groups.map((group) => group.boundaryEdges), [1, 1]);
  assert.deepEqual(crossCommunityEdges.map((row) => row.via), ['dependencies']);
});
