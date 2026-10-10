import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertBlastRadiusShape } from './blast-radius.mjs';

describe('blast-radius', () => {
  it('rejects malformed blast_radius payloads before CLI output', () => {
    const blastRadius = {
      operation: 'blast_radius',
      center: 'domains/auth',
      risk: 'unknown',
      qualification: {
        status: 'review_required',
        basis: 'declared_dependencies',
        completeness: 'unknown',
        sourceBacked: false,
        declaredEdges: 1,
        declaredWithRationaleEdges: 0,
        reviewRequiredEdges: 1,
        sourceBackedEdges: 0,
      },
      summary: {
        affectedNodes: 1,
        affectedEdges: 0,
        affectedKinds: 1,
        affectedDomains: 1,
        crossDomainEdges: 0,
      },
      byKind: { domain: 1 },
      byDomain: { auth: 1 },
      nodes: {
        total: 1,
        limited: false,
        rows: [{ slug: 'domains/auth', distance: 0, node: { slug: 'domains/auth', kind: 'domain', title: 'Auth', inDegree: 1, outDegree: 1 } }],
      },
      edges: { total: 0, limited: false, rows: [] },
    };

    assert.equal(assertBlastRadiusShape(blastRadius), blastRadius);
    assert.throws(
      () => assertBlastRadiusShape({ ...blastRadius, risk: 'certain' }),
      /blast_radius risk must be one of: unknown, low, medium, high/,
    );
    assert.throws(
      () => assertBlastRadiusShape({ ...blastRadius, nodes: { total: 1, limited: false, rows: [{}] } }),
      /blast_radius nodes must be a page with valid node rows/,
    );
  });
});
