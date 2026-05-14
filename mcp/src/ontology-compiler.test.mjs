import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { compileOntology } from './ontology-compiler.mjs';

function doc(slug, frontmatter = {}) {
  return {
    slug,
    frontmatter,
    body: '',
    mtime: 1,
  };
}

function timedDoc(slug, frontmatter = {}, mtime = 1) {
  return {
    slug,
    frontmatter,
    body: '',
    mtime,
  };
}

describe('compileOntology', () => {
  it('compiles nodes, canonical edges, aliases, and adjacency indexes', () => {
    const result = compileOntology(
      [
        doc('domains/auth', { slug: 'auth-domain', kind: 'domain', title: 'Auth' }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          depends_on: ['auth-domain'],
          relates: ['missing'],
        }),
      ],
      { includeIndexes: true },
    );

    assert.equal(result.version, 1);
    assert.match(result.graphHash, /^[a-f0-9]{64}$/);
    assert.equal(result.maxMtime, 1);
    assert.equal(result.nodeCount, 2);
    assert.equal(result.edgeCount, 2);
    assert.equal(result.resolvedEdgeCount, 1);
    assert.equal(result.externalEdgeCount, 0);
    assert.equal(result.unresolvedEdgeCount, 1);
    assert.deepEqual(
      result.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        via: edge.via,
        ref: edge.ref,
        resolved: edge.resolved,
        external: edge.external,
      })),
      [
        {
          from: 'capabilities/login',
          to: 'domains/auth',
          via: 'dependencies',
          ref: 'auth-domain',
          resolved: true,
          external: false,
        },
        {
          from: 'capabilities/login',
          to: 'missing',
          via: 'relates',
          ref: 'missing',
          resolved: false,
          external: false,
        },
      ],
    );
    assert.deepEqual(result.indexes.in['domains/auth'], [
      'capabilities/login->domains/auth:dependencies:auth-domain',
    ]);
    assert.deepEqual(result.indexes.byKind, {
      capability: ['capabilities/login'],
      domain: ['domains/auth'],
    });
    assert.deepEqual(result.indexes.byDomain, {});
    assert.equal(
      result.indexes.edgeById['capabilities/login->domains/auth:dependencies:auth-domain'].to,
      'domains/auth',
    );
    assert.equal(result.indexes.aliasToSlug['auth-domain'], 'domains/auth');
    assert.deepEqual(result.nodes.find((node) => node.slug === 'capabilities/login'), {
      slug: 'capabilities/login',
      kind: 'capability',
      title: 'Login',
      domain: undefined,
      mtime: 1,
      outDegree: 2,
      inDegree: 0,
    });
    assert.ok(result.aliases.some((alias) => alias.alias === 'auth-domain' && alias.slug === 'domains/auth'));
    assert.ok(result.issues.some((issue) => issue.code === 'dangling-graph-reference'));
  });

  it('reports ambiguous aliases without resolving them', () => {
    const result = compileOntology([
      doc('domains/auth', { kind: 'domain' }),
      doc('capabilities/auth', { kind: 'capability' }),
      doc('project', { kind: 'project', domains: ['auth'] }),
    ]);

    assert.deepEqual(result.ambiguousAliases, [
      { alias: 'auth', slugs: ['capabilities/auth', 'domains/auth'] },
    ]);
    assert.deepEqual(result.edges, [
      {
        id: 'project->auth:domains:auth',
        from: 'project',
        to: 'auth',
        via: 'domains',
        ref: 'auth',
        resolved: false,
        external: false,
      },
    ]);
    assert.ok(result.issues.some((issue) => issue.code === 'ambiguous-alias'));
  });

  it('classifies path-like element refs as external edges, not dangling issues', () => {
    const result = compileOntology([
      doc('capabilities/mcp-server', {
        kind: 'capability',
        elements: ['mcp/src/ontology-compiler.mjs'],
      }),
    ]);

    assert.equal(result.externalEdgeCount, 1);
    assert.equal(result.unresolvedEdgeCount, 0);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.edges, [
      {
        id: 'capabilities/mcp-server->mcp/src/ontology-compiler.mjs:elements:mcp/src/ontology-compiler.mjs',
        from: 'capabilities/mcp-server',
        to: 'mcp/src/ontology-compiler.mjs',
        via: 'elements',
        ref: 'mcp/src/ontology-compiler.mjs',
        resolved: false,
        external: true,
      },
    ]);
  });

  it('keeps graphHash stable across mtime-only changes', () => {
    const first = compileOntology([
      timedDoc('domains/auth', { kind: 'domain', title: 'Auth' }, 10),
      timedDoc('capabilities/login', { kind: 'capability', domain: 'auth' }, 20),
    ]);
    const second = compileOntology([
      timedDoc('domains/auth', { kind: 'domain', title: 'Auth' }, 100),
      timedDoc('capabilities/login', { kind: 'capability', domain: 'auth' }, 200),
    ]);

    assert.equal(first.graphHash, second.graphHash);
    assert.equal(first.maxMtime, 20);
    assert.equal(second.maxMtime, 200);
  });

  it('reports graph array canonicalization actions outside graphHash', () => {
    const dirty = compileOntology([
      doc('project', {
        kind: 'project',
        capabilities: ['capabilities/z', 'capabilities/a', 'capabilities/z'],
      }),
      doc('capabilities/a', { kind: 'capability' }),
      doc('capabilities/z', { kind: 'capability' }),
    ]);
    const clean = compileOntology([
      doc('project', {
        kind: 'project',
        capabilities: ['capabilities/a', 'capabilities/z'],
      }),
      doc('capabilities/a', { kind: 'capability' }),
      doc('capabilities/z', { kind: 'capability' }),
    ]);

    assert.deepEqual(dirty.canonicalizationActions, [
      {
        slug: 'project',
        keys: ['capabilities'],
        frontmatter: {
          capabilities: ['capabilities/a', 'capabilities/z'],
        },
        expected_mtime: 1,
      },
    ]);
    assert.deepEqual(clean.canonicalizationActions, []);
    assert.equal(dirty.graphHash, clean.graphHash);
  });

  it('summary: true returns counts + aggregates but no array bulk', () => {
    const result = compileOntology(
      [
        doc('project', { kind: 'project', capabilities: ['login', 'logout'] }),
        doc('capabilities/login', { kind: 'capability', domain: 'auth' }),
        doc('capabilities/logout', { kind: 'capability', domain: 'auth' }),
        doc('elements/jwt', { kind: 'element', domain: 'auth' }),
      ],
      { summary: true },
    );
    assert.equal(result.nodeCount, 4);
    assert.equal(typeof result.graphHash, 'string');
    // 각 노드가 slug + tail alias → 4 node 중 3 개가 path-style (tail 분리) →
    // 1 + 2*3 = 7
    assert.equal(result.aliasCount, 7);
    assert.deepEqual(result.byKind, {
      capability: 2,
      element: 1,
      project: 1,
    });
    assert.deepEqual(result.byDomain, { auth: 3 });
    // arrays should NOT be present
    assert.equal(result.nodes, undefined);
    assert.equal(result.edges, undefined);
    assert.equal(result.aliases, undefined);
    assert.equal(result.indexes, undefined);
  });

  it('summary hash matches full compile hash (same graph)', () => {
    const docs = [
      doc('project', { kind: 'project', domains: ['auth'] }),
      doc('domains/auth', { kind: 'domain', capabilities: ['login'] }),
      doc('capabilities/login', { kind: 'capability', domain: 'auth' }),
    ];
    const full = compileOntology(docs);
    const summary = compileOntology(docs, { summary: true });
    assert.equal(summary.graphHash, full.graphHash);
    assert.equal(summary.nodeCount, full.nodeCount);
    assert.equal(summary.edgeCount, full.edgeCount);
  });

  it('nodesLimit / nodesOffset slice nodes with pagination meta', () => {
    const docs = ['a', 'b', 'c', 'd', 'e'].map((s) =>
      doc(`capabilities/${s}`, { kind: 'capability' }),
    );
    const page1 = compileOntology(docs, { nodesLimit: 2, nodesOffset: 0 });
    assert.equal(page1.nodes.length, 2);
    assert.equal(page1.nodes[0].slug, 'capabilities/a');
    assert.deepEqual(page1.nodesPagination, {
      offset: 0,
      limit: 2,
      total: 5,
      returned: 2,
      hasMore: true,
      nextOffset: 2,
    });

    const page2 = compileOntology(docs, { nodesLimit: 2, nodesOffset: 2 });
    assert.equal(page2.nodes[0].slug, 'capabilities/c');
    assert.equal(page2.nodesPagination.hasMore, true);

    const page3 = compileOntology(docs, { nodesLimit: 2, nodesOffset: 4 });
    assert.equal(page3.nodes.length, 1);
    assert.equal(page3.nodesPagination.hasMore, false);
    assert.equal(page3.nodesPagination.nextOffset, null);
  });

  it('edgesLimit / edgesOffset slice edges independently of nodes', () => {
    const docs = [
      doc('project', {
        kind: 'project',
        capabilities: ['login', 'logout', 'signup', 'reset'],
      }),
      doc('capabilities/login', { kind: 'capability' }),
      doc('capabilities/logout', { kind: 'capability' }),
      doc('capabilities/signup', { kind: 'capability' }),
      doc('capabilities/reset', { kind: 'capability' }),
    ];
    const result = compileOntology(docs, { edgesLimit: 2, edgesOffset: 1 });
    assert.equal(result.edges.length, 2);
    assert.equal(result.edgesPagination.total, 4);
    assert.equal(result.edgesPagination.offset, 1);
    assert.equal(result.edgesPagination.hasMore, true);
    assert.equal(result.edgesPagination.nextOffset, 3);
    // nodes 그대로 (별도 pagination 안 적용)
    assert.equal(result.nodes.length, 5);
    assert.equal(result.nodesPagination, undefined);
  });

  it('no pagination meta when limits omitted (backward compat)', () => {
    const result = compileOntology([
      doc('a', { kind: 'capability' }),
      doc('b', { kind: 'capability' }),
    ]);
    assert.equal(result.nodes.length, 2);
    assert.equal(result.nodesPagination, undefined);
    assert.equal(result.edgesPagination, undefined);
  });
});
