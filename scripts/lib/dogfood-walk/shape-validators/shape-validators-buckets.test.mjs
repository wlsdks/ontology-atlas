import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  candidateGroupShapeFailure,
  scopeEdgeBucketFailure,
  summarizedNodeBucketFailure,
  summarizedRowBucketFailure,
} from './shape-validators-buckets.mjs';

const node = { slug: 'capabilities/a', kind: 'capability', title: 'A' };
const edge = { from: 'capabilities/a', to: 'domains/d', via: 'domain' };

describe('scopeEdgeBucketFailure', () => {
  const bucket = (overrides = {}) => ({ total: 1, limited: false, byRelation: { domain: 1 }, edges: [edge], ...overrides });

  it('accepts a complete bucket and a limited one that lists fewer edges than its total', () => {
    assert.equal(scopeEdgeBucketFailure('scope', bucket()), null);
    assert.equal(scopeEdgeBucketFailure('scope', bucket({ total: 5, limited: true })), null);
  });

  it('rejects an unlimited bucket whose edge list is short of its total', () => {
    assert.equal(
      scopeEdgeBucketFailure('scope', bucket({ total: 2 })),
      'scope edge count mismatch — edges 1, total 2',
    );
  });

  it('rejects more edges than the total and an edge without a relation', () => {
    assert.equal(
      scopeEdgeBucketFailure('scope', bucket({ total: 0, limited: true })),
      'scope edges exceed total — edges 1, total 0',
    );
    assert.equal(
      scopeEdgeBucketFailure('scope', bucket({ edges: [{ from: 'a', to: 'b' }] })),
      'scope missing edge relation at index 0',
    );
  });
});

describe('summarizedNodeBucketFailure', () => {
  it('requires the nodes array to match the total unless the bucket is limited', () => {
    assert.equal(
      summarizedNodeBucketFailure('map', { total: 1, limited: false, nodes: [node] }),
      null,
    );
    assert.equal(
      summarizedNodeBucketFailure('map', { total: 3, limited: false, nodes: [node] }),
      'map node count mismatch — nodes 1, total 3',
    );
    assert.equal(summarizedNodeBucketFailure('map', { total: 3, limited: true, nodes: [node] }), null);
  });

  it('rejects a bucket that is not an object', () => {
    assert.equal(summarizedNodeBucketFailure('map', []), 'map missing bucket');
  });
});

describe('summarizedRowBucketFailure', () => {
  const bucket = { total: 1, limited: false, rows: [node] };

  it('checks the total against the summary only when one is given', () => {
    assert.equal(summarizedRowBucketFailure('scope nodes', bucket), null);
    assert.equal(summarizedRowBucketFailure('scope nodes', bucket, 1), null);
    assert.equal(
      summarizedRowBucketFailure('scope nodes', bucket, 4),
      'scope nodes total mismatch — summary 4, bucket 1',
    );
  });
});

describe('candidateGroupShapeFailure', () => {
  it('requires the group total to equal the summary total', () => {
    assert.equal(
      candidateGroupShapeFailure('growth', { total: 2, limited: true, rows: [] }, 3),
      'growth total mismatch — summary 3, group 2',
    );
  });

  it('rejects a negative ignored count', () => {
    assert.equal(
      candidateGroupShapeFailure('growth', { total: 0, limited: false, rows: [], ignored: -1 }, 0),
      'growth malformed ignored count',
    );
  });

  it('accepts an empty complete group', () => {
    assert.equal(candidateGroupShapeFailure('growth', { total: 0, limited: false, rows: [] }, 0), null);
  });
});
