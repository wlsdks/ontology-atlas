import assert from 'node:assert/strict';
import test from 'node:test';

import { compareCentralityRows, compareNodeRows, degreeBucket, sortLineageRows, topHubs } from './node-ranking.mjs';

test('a degree falls in the bucket a reader would expect at each boundary', () => {
  const buckets = [0, 1, 2, 4, 5, 9, 10].map(degreeBucket);
  assert.deepEqual(buckets, ['0', '1', '2-4', '2-4', '5-9', '5-9', '10+']);
});

test('hubs are ranked by degree, then in-degree, then slug, and cut at the limit', () => {
  const hubs = topHubs([
    { slug: 'c', inDegree: 1, outDegree: 1 },
    { slug: 'a', inDegree: 0, outDegree: 2 },
    { slug: 'b', inDegree: 2, outDegree: 0 },
    { slug: 'd', inDegree: 3, outDegree: 3 },
  ], 3);
  assert.deepEqual(hubs.map((hub) => [hub.slug, hub.degree]), [['d', 6], ['b', 2], ['c', 2]]);
});

test('a node row sorted by in-degree falls back to degree and then slug', () => {
  const rows = [
    { slug: 'b', inDegree: 2, degree: 2 },
    { slug: 'a', inDegree: 2, degree: 5 },
    { slug: 'c', inDegree: 2, degree: 5 },
    { slug: 'z', inDegree: 9, degree: 9 },
  ];
  assert.deepEqual(rows.sort((l, r) => compareNodeRows(l, r, 'inDegree')).map((row) => row.slug), ['z', 'a', 'c', 'b']);
  assert.deepEqual(rows.sort((l, r) => compareNodeRows(l, r, 'slug')).map((row) => row.slug), ['a', 'b', 'c', 'z']);
});

test('lineage rows run nearest first, ties by slug', () => {
  const rows = [{ slug: 'b', distance: 2 }, { slug: 'z', distance: 1 }, { slug: 'a', distance: 2 }];
  assert.deepEqual(sortLineageRows(rows).map((row) => row.slug), ['z', 'a', 'b']);
  assert.equal(rows[0].slug, 'b');
});

test('centrality rows run by page rank, then degree, then slug', () => {
  const rows = [
    { slug: 'b', pageRank: 0.2, degree: 1 },
    { slug: 'a', pageRank: 0.2, degree: 1 },
    { slug: 'c', pageRank: 0.2, degree: 3 },
    { slug: 'd', pageRank: 0.5, degree: 0 },
  ];
  assert.deepEqual(rows.sort(compareCentralityRows).map((row) => row.slug), ['d', 'c', 'a', 'b']);
});
