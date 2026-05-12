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
});
