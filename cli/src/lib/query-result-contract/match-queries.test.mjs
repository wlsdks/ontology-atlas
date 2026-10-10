import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertMatchEdgesShape, assertMatchNodesShape } from './match-queries.mjs';

describe('match-queries', () => {
  it('validates match_nodes payloads', () => {
    const valid = {
      operation: 'match_nodes',
      filters: {
        kind: 'capability',
        domain: null,
        slugContains: null,
        minDegree: 1,
        maxDegree: null,
        minInDegree: null,
        minOutDegree: null,
        hasIncoming: null,
        hasOutgoing: null,
        sort: 'degree',
      },
      totalMatches: 1,
      limited: false,
      followUp: {
        focusSlug: 'capabilities/login',
        reason: 'match_nodes is a scan; inspect this node before editing.',
        calls: [
          {
            id: 'profile_focus',
            label: 'Profile the first matched node before editing.',
            tool: 'query_ontology',
            arguments: {
              operation: 'node_profile',
              slug: 'capabilities/login',
              limit: 12,
            },
          },
        ],
        cliFallbackCommands: ['node /abs/cli/src/index.mjs node capabilities/login [vault] --limit 12'],
      },
      nodes: [
        {
          slug: 'capabilities/login',
          kind: 'capability',
          title: 'Login',
          domain: 'domains/auth',
          inDegree: 2,
          outDegree: 1,
          degree: 3,
        },
      ],
    };

    assert.equal(assertMatchNodesShape(valid), valid);
    assert.throws(
      () => assertMatchNodesShape({ ...valid, totalMatches: '1' }),
      /match_nodes totalMatches must be a non-negative integer/,
    );
    assert.throws(
      () => assertMatchNodesShape({
        ...valid,
        nodes: [{ ...valid.nodes[0], degree: -1 }],
      }),
      /match_nodes nodes\[0\] has an invalid node row shape/,
    );
    assert.throws(
      () => assertMatchNodesShape({
        ...valid,
        followUp: {
          ...valid.followUp,
          // The bare name is rejected because it cannot run.
          cliFallbackCommands: ['ontology-atlas node capabilities/login'],
        },
      }),
      /match_nodes followUp must contain/,
    );
  });

  it('validates match_edges payloads', () => {
    const valid = {
      operation: 'match_edges',
      filters: {
        from: null,
        to: null,
        fromKind: 'capability',
        toKind: 'external',
        types: ['depends_on'],
        includeExternal: true,
        includeUnresolved: false,
      },
      totalMatches: 1,
      limited: false,
      followUp: {
        focusEdge: {
          from: 'capabilities/login',
          to: 'capabilities/session',
          via: 'relates',
        },
        reason: 'match_edges is a scan; inspect this edge before editing.',
        calls: [
          {
            id: 'explain_relation',
            label: 'Explain why the first matched edge exists.',
            tool: 'query_ontology',
            arguments: {
              operation: 'explain_relation',
              from: 'capabilities/login',
              to: 'capabilities/session',
            },
          },
        ],
        cliFallbackCommands: [
          'node /abs/cli/src/index.mjs explain capabilities/login capabilities/session [vault]',
        ],
      },
      edges: [
        {
          id: 'capabilities/login|depends_on|src/auth.ts',
          from: 'capabilities/login',
          to: 'src/auth.ts',
          via: 'depends_on',
          ref: 'src/auth.ts',
          resolved: false,
          external: true,
          fromNode: {
            slug: 'capabilities/login',
            kind: 'capability',
            title: 'Login',
          },
          toNode: null,
          toKind: 'external',
        },
      ],
    };

    assert.equal(assertMatchEdgesShape(valid), valid);
    assert.throws(
      () => assertMatchEdgesShape({ ...valid, limited: 'false' }),
      /match_edges limited must be a boolean/,
    );
    assert.throws(
      () => assertMatchEdgesShape({
        ...valid,
        edges: [{ ...valid.edges[0], fromNode: { slug: 'capabilities/login', kind: 'capability' } }],
      }),
      /match_edges edges\[0\] has an invalid edge row shape/,
    );
    assert.throws(
      () => assertMatchEdgesShape({
        ...valid,
        followUp: {
          ...valid.followUp,
          focusEdge: { from: 'capabilities/login', via: 'relates' },
        },
      }),
      /match_edges followUp must contain/,
    );
  });
});
