import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertBacklinksShape,
  assertNodeProfileShape,
  assertOrphansShape,
  assertQueryConceptsShape,
  assertSimilarNodesShape,
} from './node-lookups.mjs';

describe('node-lookups', () => {
  it('rejects malformed find_backlinks and find_orphans payloads before CLI output', () => {
    const backlinks = {
      target: 'capabilities/foo',
      total: 1,
      matches: [
        {
          slug: 'domains/auth',
          kind: 'domain',
          title: 'Auth',
          mtime: 1,
          matchedKeys: ['capabilities'],
        },
      ],
    };
    const orphans = {
      total: 1,
      orphans: [
        {
          slug: 'capabilities/foo',
          kind: 'capability',
          title: 'Foo',
          mtime: 1,
        },
      ],
    };

    assert.equal(assertBacklinksShape(backlinks), backlinks);
    assert.equal(assertBacklinksShape({ target: 'capabilities/foo', matches: [] }).total, undefined);

    /**
     * A row matched by a body link alone, the second shape the server emits (`mcp/src/vault.mjs`: `matchedKeys`
     * undefined, `matchedInBody: true`); it appears in the starter vault right after `init`.
     */
    const bodyOnly = {
      target: 'domains/auth',
      total: 1,
      matches: [
        {
          slug: 'domains/example-domain',
          kind: 'domain',
          title: 'Example domain',
          mtime: 1,
          matchedInBody: true,
        },
      ],
    };
    assert.equal(assertBacklinksShape(bodyOnly), bodyOnly);

    // A row with no evidence at all is still rejected — a backlink that cannot say
    // why it matched is not a backlink (authority: `mcp/scripts/verify.mjs`).
    assert.throws(
      () =>
        assertBacklinksShape({
          target: 'domains/auth',
          matches: [{ slug: 'domains/x', kind: 'domain', title: 'X', mtime: 1 }],
        }),
      /find_backlinks matches\[0\] has an invalid backlink shape/,
    );
    assert.throws(
      () =>
        assertBacklinksShape({
          target: 'domains/auth',
          matches: [
            { slug: 'domains/x', kind: 'domain', title: 'X', mtime: 1, matchedKeys: [], matchedInBody: false },
          ],
        }),
      /find_backlinks matches\[0\] has an invalid backlink shape/,
    );
    assert.equal(assertOrphansShape(orphans), orphans);
    assert.equal(assertOrphansShape({ orphans: [] }).total, undefined);
    assert.throws(
      () => assertBacklinksShape({ target: '', total: 0, matches: [] }),
      /find_backlinks target must be a non-empty string/,
    );
    assert.throws(
      () => assertBacklinksShape({ target: 'capabilities/foo', total: -1, matches: [] }),
      /find_backlinks total must be a non-negative integer/,
    );
    assert.throws(
      () => assertBacklinksShape({ target: 'capabilities/foo', matches: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth', matchedKeys: [''] }] }),
      /find_backlinks matches\[0\] has an invalid backlink shape/,
    );
    assert.throws(
      () => assertOrphansShape({ total: -1, orphans: [] }),
      /find_orphans total must be a non-negative integer/,
    );
    assert.throws(
      () => assertOrphansShape({ orphans: [{ slug: 'capabilities/foo', kind: 'capability' }] }),
      /find_orphans orphans\[0\] has an invalid orphan shape/,
    );
  });

  it('accepts a backlink from a file with no kind, in wiki/ or elsewhere, and rejects an empty kind or title', () => {
    const kindless = {
      target: 'capabilities/foo',
      total: 2,
      matches: [
        { slug: 'wiki/notes', title: 'Notes', mtime: 1, matchedInBody: true },
        { slug: 'notes/loose', title: 'Loose', mtime: 1, matchedInBody: true },
      ],
    };
    assert.equal(assertBacklinksShape(kindless), kindless);
    for (const row of [
      { slug: 'wiki/notes', kind: '', title: 'Notes', mtime: 1, matchedInBody: true },
      { slug: 'notes/loose', kind: null, title: 'Loose', mtime: 1, matchedInBody: true },
      { slug: 'wiki/notes', mtime: 1, matchedInBody: true },
    ]) {
      assert.throws(
        () => assertBacklinksShape({ target: 'capabilities/foo', matches: [row] }),
        /find_backlinks matches\[0\] has an invalid backlink shape/,
      );
    }
  });

  it('rejects malformed query_concepts payloads before CLI output', () => {
    const result = {
      filter: 'kind=capability',
      parsedAs: 'kind = capability',
      total: 1,
      limited: false,
      matches: [
        {
          slug: 'capabilities/foo',
          kind: 'capability',
          title: 'Foo',
          domain: 'auth',
          mtime: 1,
        },
      ],
    };

    assert.equal(assertQueryConceptsShape(result), result);
    assert.equal(assertQueryConceptsShape({ filter: 'kind=capability', matches: [] }).total, undefined);
    assert.throws(
      () => assertQueryConceptsShape({ filter: '', total: 0, matches: [] }),
      /query_concepts filter must be a non-empty string/,
    );
    assert.throws(
      () => assertQueryConceptsShape({ filter: 'kind=capability', parsedAs: '', total: 0, matches: [] }),
      /query_concepts parsedAs must be a non-empty string when present/,
    );
    assert.throws(
      () => assertQueryConceptsShape({ filter: 'kind=capability', total: -1, matches: [] }),
      /query_concepts total must be a non-negative integer/,
    );
    assert.throws(
      () => assertQueryConceptsShape({ filter: 'kind=capability', limited: 'no', matches: [] }),
      /query_concepts limited must be a boolean when present/,
    );
    assert.throws(
      () => assertQueryConceptsShape({ filter: 'kind=capability', matches: [{ slug: 'capabilities/foo', kind: 'capability' }] }),
      /query_concepts matches\[0\] has an invalid query-result shape/,
    );
  });

  it('rejects malformed node_profile and similar_nodes payloads before CLI output', () => {
    const nodeProfile = {
      operation: 'node_profile',
      center: 'capabilities/foo',
      node: { slug: 'capabilities/foo', kind: 'capability', title: 'Foo', inDegree: 1, outDegree: 1 },
      aliases: ['capabilities/foo', 'foo'],
      degree: { in: 1, out: 1, total: 2 },
      edges: {
        incoming: {
          total: 1,
          byRelation: { relates: 1 },
          limited: false,
          edges: [
            {
              from: 'capabilities/bar',
              to: 'capabilities/foo',
              via: 'relates',
              resolved: true,
              external: false,
              otherKind: 'capability',
              otherNode: { slug: 'capabilities/bar', kind: 'capability', title: 'Bar' },
            },
          ],
        },
        outgoing: { total: 0, byRelation: {}, limited: false, edges: [] },
      },
      lineage: {
        ancestors: {
          total: 1,
          limited: false,
          nodes: [{ slug: 'domains/auth', distance: 1, via: 'domain', node: { slug: 'domains/auth', kind: 'domain', title: 'Auth' } }],
        },
        descendants: { total: 0, limited: false, nodes: [] },
      },
    };
    const similarNodes = {
      operation: 'similar_nodes',
      totalMatches: 1,
      limited: false,
      matches: [
        {
          node: { slug: 'capabilities/foo', kind: 'capability', title: 'Foo' },
          score: 0.4,
          signals: { slug: 0.2, title: 0.2 },
          sharedNeighbors: ['domains/auth'],
        },
      ],
    };

    assert.equal(assertNodeProfileShape(nodeProfile), nodeProfile);
    assert.equal(assertSimilarNodesShape(similarNodes), similarNodes);
    assert.equal(assertSimilarNodesShape({ operation: 'similar_nodes', matches: [] }).totalMatches, undefined);
    assert.throws(
      () => assertNodeProfileShape({ ...nodeProfile, degree: { in: 1, out: 1 } }),
      /node_profile degree must contain non-negative in\/out\/total counts/,
    );
    assert.throws(
      () => assertNodeProfileShape({ ...nodeProfile, edges: { ...nodeProfile.edges, incoming: { total: 1, byRelation: {}, limited: false, edges: [{}] } } }),
      /node_profile edges\.incoming must be a valid edge group/,
    );
    assert.throws(
      () => assertNodeProfileShape({ ...nodeProfile, lineage: { ancestors: { total: 1, limited: false, nodes: [{ slug: 'domains/auth', distance: -1, node: { slug: 'domains/auth', kind: 'domain', title: 'Auth' } }] } } }),
      /node_profile lineage must contain valid ancestor\/descendant pages when present/,
    );
    assert.throws(
      () => assertSimilarNodesShape({ operation: 'similar_nodes', totalMatches: -1, matches: [] }),
      /similar_nodes totalMatches must be a non-negative integer/,
    );
    assert.throws(
      () => assertSimilarNodesShape({ operation: 'similar_nodes', matches: [{ node: { slug: 'capabilities/foo', kind: 'capability' }, score: 0.4, signals: {} }] }),
      /similar_nodes matches\[0\] has an invalid similar-node shape/,
    );
    assert.throws(
      () => assertSimilarNodesShape({ operation: 'similar_nodes', matches: [{ node: { slug: 'capabilities/foo', kind: 'capability', title: 'Foo' }, score: -1, signals: {} }] }),
      /similar_nodes matches\[0\] has an invalid similar-node shape/,
    );
  });
});
