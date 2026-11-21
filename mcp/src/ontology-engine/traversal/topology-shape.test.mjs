import assert from 'node:assert/strict';
import test from 'node:test';

import { limitLayers, normalizeCycle } from './topology-shape.mjs';

test('a cycle starts at its smallest node whichever node it was found from, with its edges rotated alike', () => {
  const fromB = normalizeCycle(['b', 'c', 'a'], ['bc', 'ca', 'ab']);
  const fromC = normalizeCycle(['c', 'a', 'b'], ['ca', 'ab', 'bc']);
  assert.deepEqual(fromB, { key: 'a->b->c', nodes: ['a', 'b', 'c', 'a'], edges: ['ab', 'bc', 'ca'] });
  assert.deepEqual(fromC, fromB);
});

test('layers are cut at the node limit and the layer that was cut says so', () => {
  const layers = [
    { rank: 0, nodes: ['a', 'b'] },
    { rank: 1, nodes: ['c', 'd', 'e'] },
    { rank: 2, nodes: ['f'] },
  ];
  assert.deepEqual(limitLayers(layers, 3), [
    { rank: 0, nodes: ['a', 'b'], limited: false },
    { rank: 1, nodes: ['c'], limited: true },
  ]);
  assert.deepEqual(limitLayers(layers, 6), layers.map((layer) => ({ ...layer, limited: false })));
  assert.deepEqual(limitLayers(layers, 0), []);
});
