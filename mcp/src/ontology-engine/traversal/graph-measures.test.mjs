import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pageRankScores,
  propagateCommunityLabels,
  roundScore,
  similarityScore,
  undirectedAdjacencyFrom,
} from './graph-measures.mjs';

const nodes = (...slugs) => slugs.map((slug) => ({ slug }));

test('page rank sums to one and a node everything points at outranks the nodes pointing at it', () => {
  const outgoing = new Map([
    ['a', [{ to: 'c' }]],
    ['b', [{ to: 'c' }, { to: 'c' }]],
    ['c', []],
  ]);
  const scores = pageRankScores(nodes('a', 'b', 'c'), outgoing, 20);
  const total = [...scores.values()].reduce((sum, score) => sum + score, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `total ${total}`);
  assert.ok(scores.get('c') > scores.get('a'));
  assert.equal(scores.get('a'), scores.get('b'));
});

test('an empty graph has no scores', () => {
  assert.equal(pageRankScores([], new Map(), 20).size, 0);
});

test('adjacency ignores unresolved edges and edges outside the allowed types, and runs both ways', () => {
  const edges = [
    { from: 'a', to: 'b', via: 'dependencies', resolved: true },
    { from: 'a', to: 'c', via: 'dependencies', resolved: false },
    { from: 'b', to: 'c', via: 'relates', resolved: true },
  ];
  const adjacency = undirectedAdjacencyFrom(nodes('a', 'b', 'c'), edges, new Set(['dependencies']));
  assert.deepEqual([...adjacency.get('a')], ['b']);
  assert.deepEqual([...adjacency.get('b')], ['a']);
  assert.deepEqual([...adjacency.get('c')], []);
});

test('connected nodes share a community label and separate components keep their own', () => {
  const adjacency = new Map([
    ['a', new Set(['b'])],
    ['b', new Set(['a'])],
    ['x', new Set(['y'])],
    ['y', new Set(['x'])],
    ['lone', new Set()],
  ]);
  const labels = propagateCommunityLabels(adjacency, 10);
  assert.equal(labels.get('a'), labels.get('b'));
  assert.equal(labels.get('x'), labels.get('y'));
  assert.notEqual(labels.get('a'), labels.get('x'));
  assert.equal(labels.get('lone'), 'lone');
});

test('similarity weighs slug, title, kind, domain and neighbours, and is one for twins', () => {
  const node = { slug: 'billing-export', title: 'Billing export', kind: 'capability', domain: 'billing' };
  const twin = similarityScore(node, node, new Set(['n']), new Set(['n']));
  assert.ok(Math.abs(twin.total - 1) < 1e-9, `total ${twin.total}`);
  const unrelated = similarityScore(node, { slug: 'zzz', title: 'Zzz', kind: 'element', domain: 'ops' }, new Set(), new Set());
  assert.equal(unrelated.total, 0);
});

test('scores are rounded to six places', () => {
  assert.equal(roundScore(0.123456789), 0.123457);
});
