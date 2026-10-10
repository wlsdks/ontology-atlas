import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertBlastRadiusShape,
  assertCentralityShape,
  assertDomainMatrixShape,
  assertOverviewShape,
} from './overview-queries.mjs';

describe('overview-queries', () => {
  it('validates domain_matrix payloads', () => {
    const valid = {
      operation: 'domain_matrix',
      project: 'project',
      summary: {
        domains: 2,
        nodes: 4,
        assignedNodes: 4,
        unassignedNodes: 0,
        crossDomainEdges: 1,
        selfDomainEdges: 2,
        externalEdges: 1,
        unresolvedEdges: 0,
      },
      domains: [
        {
          slug: 'domains/auth',
          node: { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
          nodes: 2,
          outgoing: 1,
          incoming: 0,
          selfEdges: 1,
          externalEdges: 1,
          unresolvedEdges: 0,
        },
        {
          slug: 'domains/billing',
          node: { slug: 'domains/billing', kind: 'domain', title: 'Billing' },
          nodes: 2,
          outgoing: 0,
          incoming: 1,
          selfEdges: 1,
          externalEdges: 0,
          unresolvedEdges: 0,
        },
      ],
      connections: {
        total: 1,
        limited: false,
        rows: [
          {
            from: 'domains/auth',
            to: 'domains/billing',
            count: 1,
            byRelation: { depends_on: 1 },
            fromNode: { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
            toNode: { slug: 'domains/billing', kind: 'domain', title: 'Billing' },
            examples: [
              {
                from: 'capabilities/login',
                to: 'capabilities/invoice',
                via: 'depends_on',
                resolved: true,
                external: false,
              },
            ],
          },
        ],
      },
    };

    assert.equal(assertDomainMatrixShape(valid), valid);
    assert.throws(
      () => assertDomainMatrixShape({ ...valid, summary: { ...valid.summary, nodes: 5 } }),
      /domain_matrix assignedNodes \+ unassignedNodes must equal nodes/,
    );
    assert.throws(
      () => assertDomainMatrixShape({
        ...valid,
        domains: [{ ...valid.domains[0], node: { ...valid.domains[0].node, slug: 'domains/other' } }],
      }),
      /domain_matrix domains\[0\] has an invalid domain row shape/,
    );
    assert.throws(
      () => assertDomainMatrixShape({
        ...valid,
        connections: {
          ...valid.connections,
          rows: [{ ...valid.connections.rows[0], byRelation: { depends_on: 2 } }],
        },
      }),
      /domain_matrix connections must be a page with valid connection rows/,
    );
  });

  it('rejects malformed overview and centrality payloads before CLI output', () => {
    const overview = {
      operation: 'overview',
      graph: { nodes: 2, edges: 1, resolvedEdges: 1, externalEdges: 0, unresolvedEdges: 0, issues: 0 },
      byKind: { capability: 1, domain: 1 },
      byDomain: {},
      byRelation: { domain: 1 },
      hubs: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth', inDegree: 1, outDegree: 1, degree: 2 }],
    };
    const centrality = {
      operation: 'centrality',
      rankings: {
        pageRank: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth', inDegree: 1, outDegree: 1, degree: 2, pageRank: 0.5, bridgeScore: 1 }],
        bridges: [],
        authorities: [],
        hubs: [],
      },
    };

    assert.equal(assertOverviewShape(overview), overview);
    assert.equal(assertCentralityShape(centrality), centrality);
    assert.throws(
      () => assertOverviewShape({ ...overview, graph: { ...overview.graph, nodes: '2' } }),
      /overview graph\.nodes must be a non-negative integer/,
    );
    assert.throws(
      () => assertOverviewShape({ ...overview, hubs: [{ ...overview.hubs[0], degree: -1 }] }),
      /overview hubs\[0\] has an invalid hub shape/,
    );
    assert.throws(
      () => assertCentralityShape({ ...centrality, rankings: { ...centrality.rankings, pageRank: [{}] } }),
      /centrality rankings\.pageRank\[0\] has an invalid ranking shape/,
    );
  });

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
