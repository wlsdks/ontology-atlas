import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertExplainRelationShape, assertReachabilityShape } from './graph-traversal.mjs';

describe('graph-traversal', () => {
  it('validates explain_relation evidence payloads', () => {
    const valid = {
      operation: 'explain_relation',
      from: 'capabilities/login',
      to: 'capabilities/session',
      fromNode: { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
      toNode: { slug: 'capabilities/session', kind: 'capability', title: 'Session' },
      verdict: 'direct',
      domains: { from: 'domains/auth', to: 'domains/auth', sameDomain: true },
      direct: {
        total: 1,
        edges: [
          {
            from: 'capabilities/login',
            to: 'capabilities/session',
            via: 'relates',
            direction: 'outgoing',
            fromNode: { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
            toNode: { slug: 'capabilities/session', kind: 'capability', title: 'Session' },
          },
        ],
      },
      shortestPath: {
        found: true,
        direction: 'undirected',
        maxHops: 5,
        hopCount: 1,
        hops: ['capabilities/login', 'capabilities/session'],
        nodes: [
          { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
          { slug: 'capabilities/session', kind: 'capability', title: 'Session' },
        ],
        edges: [
          { from: 'capabilities/login', to: 'capabilities/session', via: 'relates' },
        ],
      },
      commonNeighbors: {
        total: 1,
        limited: false,
        rows: [
          {
            slug: 'domains/auth',
            node: { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
            fromEdges: [{ from: 'capabilities/login', to: 'domains/auth', via: 'domain', direction: 'outgoing' }],
            toEdges: [{ from: 'capabilities/session', to: 'domains/auth', via: 'domain', direction: 'outgoing' }],
          },
        ],
      },
    };

    assert.equal(assertExplainRelationShape(valid), valid);
    assert.throws(
      () => assertExplainRelationShape({ ...valid, verdict: 'maybe' }),
      /explain_relation verdict must be one of/,
    );
    assert.throws(
      () => assertExplainRelationShape({
        ...valid,
        shortestPath: { ...valid.shortestPath, edges: [] },
      }),
      /explain_relation shortestPath has an invalid path shape/,
    );
    assert.throws(
      () => assertExplainRelationShape({
        ...valid,
        commonNeighbors: { ...valid.commonNeighbors, rows: [{ ...valid.commonNeighbors.rows[0], node: { slug: 'other', kind: 'domain', title: 'Other' } }] },
      }),
      /explain_relation commonNeighbors\.rows\[0\] has an invalid common-neighbor shape/,
    );
  });

  it('validates reachability payloads', () => {
    const edge = {
      from: 'capabilities/login',
      to: 'domains/auth',
      via: 'domain',
      traversedFrom: 'capabilities/login',
      traversedTo: 'domains/auth',
    };
    const valid = {
      operation: 'reachability',
      start: 'capabilities/login',
      node: { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
      direction: 'outgoing',
      depth: 3,
      summary: {
        reachableNodes: 1,
        traversedEdges: 1,
        layers: 1,
        terminalNodes: 1,
      },
      byKind: { domain: 1 },
      byRelation: { domain: 1 },
      layers: [
        {
          distance: 1,
          total: 1,
          nodes: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth' }],
        },
      ],
      paths: {
        total: 1,
        limited: false,
        rows: [
          {
            slug: 'domains/auth',
            distance: 1,
            path: ['capabilities/login', 'domains/auth'],
            edges: [edge],
            node: { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
          },
        ],
      },
      terminalNodes: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth' }],
      edges: { total: 1, limited: false, rows: [edge] },
    };

    assert.equal(assertReachabilityShape(valid), valid);
    assert.throws(
      () => assertReachabilityShape({ ...valid, direction: 'sideways' }),
      /reachability direction must be one of: incoming, outgoing, both/,
    );
    assert.throws(
      () => assertReachabilityShape({ ...valid, summary: { ...valid.summary, reachableNodes: '1' } }),
      /reachability summary\.reachableNodes must be a non-negative integer/,
    );
    assert.throws(
      () => assertReachabilityShape({ ...valid, paths: { total: 1, limited: false, rows: [{ ...valid.paths.rows[0], path: ['domains/auth'] }] } }),
      /reachability paths must be a page with valid path rows/,
    );
  });
});
