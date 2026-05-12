import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { compileOntology } from './ontology-compiler.mjs';
import { queryCompiledOntology } from './ontology-engine.mjs';

function doc(slug, frontmatter = {}) {
  return {
    slug,
    frontmatter,
    body: '',
    mtime: 1,
  };
}

function artifact() {
  return compileOntology(
    [
      doc('domains/auth', { slug: 'auth-domain', kind: 'domain', title: 'Auth' }),
      doc('capabilities/login', {
        kind: 'capability',
        title: 'Login',
        domain: 'auth',
        depends_on: ['auth-domain'],
        elements: ['src/auth/login.ts'],
      }),
      doc('capabilities/session', {
        kind: 'capability',
        title: 'Session',
        depends_on: ['capabilities/login'],
      }),
    ],
    { includeIndexes: true },
  );
}

describe('queryCompiledOntology', () => {
  it('returns deterministic neighbors with alias resolution', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'neighbors',
      slug: 'auth-domain',
      direction: 'incoming',
      types: ['dependencies'],
    });

    assert.equal(result.center, 'domains/auth');
    assert.deepEqual(result.nodes.map((node) => node.slug), ['capabilities/login']);
    assert.deepEqual(
      result.edges.map((edge) => ({
        direction: edge.direction,
        from: edge.from,
        to: edge.to,
        via: edge.via,
      })),
      [
        {
          direction: 'incoming',
          from: 'capabilities/login',
          to: 'domains/auth',
          via: 'dependencies',
        },
      ],
    );
  });

  it('finds graph paths over resolved compiled edges', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'path',
      from: 'capabilities/session',
      to: 'auth-domain',
      maxHops: 3,
    });

    assert.equal(result.found, true);
    assert.equal(result.hopCount, 2);
    assert.deepEqual(result.hops, [
      'capabilities/session',
      'capabilities/login',
      'domains/auth',
    ]);
    assert.deepEqual(result.edges.map((edge) => edge.via), ['dependencies', 'dependencies']);
  });

  it('returns incoming change impact by default', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'impact',
      slug: 'domains/auth',
      depth: 2,
    });

    assert.equal(result.center, 'domains/auth');
    assert.equal(result.direction, 'incoming');
    assert.deepEqual(
      result.nodes.map((row) => ({ slug: row.slug, distance: row.distance })),
      [
        { slug: 'capabilities/login', distance: 1 },
        { slug: 'capabilities/session', distance: 2 },
      ],
    );
  });

  it('returns a bounded resolved subgraph around a seed', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'subgraph',
      slug: 'auth-domain',
      depth: 2,
      direction: 'incoming',
    });

    assert.equal(result.seed, 'domains/auth');
    assert.equal(result.totalNodes, 3);
    assert.deepEqual(
      result.nodes.map((row) => ({ slug: row.slug, distance: row.distance })),
      [
        { slug: 'domains/auth', distance: 0 },
        { slug: 'capabilities/login', distance: 1 },
        { slug: 'capabilities/session', distance: 2 },
      ],
    );
    assert.deepEqual(result.edges.map((edge) => edge.via), [
      'dependencies',
      'domain',
      'dependencies',
    ]);

    const limited = queryCompiledOntology(artifact(), {
      operation: 'subgraph',
      slug: 'auth-domain',
      depth: 2,
      direction: 'incoming',
      limit: 2,
    });
    assert.equal(limited.totalNodes, 2);
    assert.equal(limited.limited, true);
  });

  it('returns graph overview aggregates for dashboard-style use', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'overview',
      limit: 2,
    });

    assert.equal(result.graph.nodes, 3);
    assert.equal(result.graph.resolvedEdges, 3);
    assert.equal(result.graph.externalEdges, 1);
    assert.match(result.graph.graphHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(result.byKind, { capability: 2, domain: 1 });
    assert.deepEqual(result.byDomain, { auth: 1 });
    assert.deepEqual(result.byRelation, {
      dependencies: 2,
      domain: 1,
      elements: 1,
    });
    assert.deepEqual(result.hubs.map((hub) => hub.slug), [
      'capabilities/login',
      'domains/auth',
    ]);
  });

  it('returns relation schema patterns by node kind', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'schema',
    });

    assert.equal(result.operation, 'schema');
    assert.equal(result.totalPatterns, 4);
    assert.deepEqual(
      result.patterns.map(({ fromKind, relation, toKind, count, resolved, external }) => ({
        fromKind,
        relation,
        toKind,
        count,
        resolved,
        external,
      })),
      [
        {
          fromKind: 'capability',
          relation: 'dependencies',
          toKind: 'capability',
          count: 1,
          resolved: 1,
          external: 0,
        },
        {
          fromKind: 'capability',
          relation: 'dependencies',
          toKind: 'domain',
          count: 1,
          resolved: 1,
          external: 0,
        },
        {
          fromKind: 'capability',
          relation: 'domain',
          toKind: 'domain',
          count: 1,
          resolved: 1,
          external: 0,
        },
        {
          fromKind: 'capability',
          relation: 'elements',
          toKind: 'external',
          count: 1,
          resolved: 0,
          external: 1,
        },
      ],
    );
  });
});
