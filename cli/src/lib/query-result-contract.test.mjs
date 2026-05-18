import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertBacklinksShape,
  assertBlastRadiusShape,
  assertCentralityShape,
  assertCyclesShape,
  assertHealthShape,
  assertMaintenancePlanShape,
  assertNodeProfileShape,
  assertOrphansShape,
  assertOverviewShape,
  assertPathShape,
  assertQueryConceptsShape,
  assertQueryOperation,
  assertSimilarNodesShape,
  assertWorkspaceBriefShape,
  compileBlockingCounts,
  compileResultExitCode,
  cyclesResultExitCode,
  healthResultExitCode,
  pathResultExitCode,
  workspaceBriefExitCode,
} from './query-result-contract.mjs';

describe('query-result-contract', () => {
  it('returns the result when the operation matches', () => {
    const result = { operation: 'health', status: 'healthy' };

    assert.equal(assertQueryOperation(result, 'health'), result);
  });

  it('rejects non-object responses', () => {
    assert.throws(
      () => assertQueryOperation(null, 'health'),
      /health query returned a non-object response/,
    );
    assert.throws(
      () => assertQueryOperation([], 'health'),
      /health query returned a non-object response/,
    );
  });

  it('rejects unexpected operations', () => {
    assert.throws(
      () => assertQueryOperation({ operation: 'workspace_brief' }, 'health'),
      /health query returned unexpected operation: workspace_brief/,
    );
  });

  it('rejects malformed maintenance_plan payloads before CLI output', () => {
    const valid = {
      operation: 'maintenance_plan',
      summary: {
        totalActions: 1,
        filteredActions: 1,
        remainingActions: 1,
        executableActions: 1,
        reviewActions: 0,
      },
      cursor: {
        afterActionId: null,
        found: true,
        reason: null,
        startIndex: 0,
        nextAfterActionId: 'maint_1',
        hasMore: false,
      },
      byPhase: { repair: 1 },
      bySeverity: { warn: 1 },
      byKind: { canonicalize_graph_arrays: 1 },
      nextExecutableAction: {
        id: 'maint_1',
        phase: 'repair',
        kind: 'canonicalize_graph_arrays',
        severity: 'warn',
        executable: true,
      },
      nextReviewAction: null,
      actions: [
        {
          id: 'maint_1',
          phase: 'repair',
          kind: 'canonicalize_graph_arrays',
          severity: 'warn',
          executable: true,
          score: 100,
          reason: 'Canonicalize graph arrays.',
          node: { slug: 'capabilities/foo' },
          proposedAction: {
            tool: 'patch_concept',
            args: { slug: 'capabilities/foo', frontmatter: { dependencies: [] } },
          },
        },
      ],
    };
    const withReview = {
      ...valid,
      summary: {
        totalActions: 2,
        filteredActions: 2,
        remainingActions: 2,
        executableActions: 1,
        reviewActions: 1,
      },
      cursor: { ...valid.cursor, nextAfterActionId: 'maint_review' },
      byPhase: { repair: 1, review: 1 },
      bySeverity: { warn: 1, info: 1 },
      byKind: { canonicalize_graph_arrays: 1, unassigned_node: 1 },
      nextReviewAction: {
        id: 'maint_review',
        phase: 'review',
        kind: 'unassigned_node',
        severity: 'info',
        executable: false,
      },
      actions: [
        valid.actions[0],
        {
          id: 'maint_review',
          phase: 'review',
          kind: 'unassigned_node',
          severity: 'info',
          executable: false,
          score: 10,
          reason: 'Review unassigned node.',
        },
      ],
    };

    assert.equal(assertMaintenancePlanShape(valid), valid);
    assert.equal(assertMaintenancePlanShape(withReview), withReview);
    assert.equal(
      assertMaintenancePlanShape({
        ...valid,
        summary: { ...valid.summary, totalActions: 0, filteredActions: 0, remainingActions: 0, executableActions: 0 },
        cursor: {
          afterActionId: null,
          found: true,
          reason: null,
          nextAfterActionId: null,
          hasMore: false,
        },
        byPhase: {},
        bySeverity: {},
        byKind: {},
        nextExecutableAction: null,
        actions: [],
      }).cursor.startIndex,
      undefined,
    );
    assert.equal(
      assertMaintenancePlanShape({
        ...valid,
        cursor: {
          ...valid.cursor,
          startIndex: null,
        },
      }).cursor.startIndex,
      null,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, summary: { ...valid.summary, remainingActions: -1 } }),
      /summary\.remainingActions must be a non-negative integer/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, summary: { ...valid.summary, executableActions: 0 } }),
      /summary executableActions \+ reviewActions must equal totalActions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, summary: { ...valid.summary, filteredActions: 2 } }),
      /summary\.filteredActions must not exceed totalActions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, summary: { ...valid.summary, remainingActions: 2 } }),
      /summary\.remainingActions must not exceed filteredActions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, cursor: { ...valid.cursor, hasMore: 'no' } }),
      /cursor\.hasMore must be a boolean/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, cursor: { ...valid.cursor, nextAfterActionId: 'maint_other' } }),
      /cursor\.nextAfterActionId must match the last returned action id/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, cursor: { ...valid.cursor, hasMore: true } }),
      /cursor\.hasMore must match remaining actions after the current page/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, actions: [{ ...valid.actions[0], score: '100' }] }),
      /actions\[0\]\.score must be a non-negative number/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, actions: [{ ...valid.actions[0], score: -1 }] }),
      /actions\[0\]\.score must be a non-negative number/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, actions: [{ ...valid.actions[0], reason: '' }] }),
      /actions\[0\]\.reason must be a non-empty string/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, actions: [{ ...valid.actions[0], proposedAction: null }] }),
      /executable action maint_1 must include proposedAction/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        actions: [{ ...valid.actions[0], proposedAction: { args: {} } }],
      }),
      /action maint_1 proposedAction\.tool must be a non-empty string/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        actions: [{ ...valid.actions[0], proposedAction: { tool: 'patch_concept' } }],
      }),
      /action maint_1 proposedAction\.args must be an object/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        actions: [{ ...valid.actions[0], proposedAction: { tool: 'add_relation', args: valid.actions[0].proposedAction.args } }],
      }),
      /action maint_1 proposedAction\.tool must be patch_concept/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        actions: [{
          ...valid.actions[0],
          proposedAction: { ...valid.actions[0].proposedAction, args: { slug: 'capabilities/bar' } },
        }],
      }),
      /action maint_1 proposedAction\.slug must match node summary/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        byKind: { add_missing_relation: 1 },
        actions: [{
          ...valid.actions[0],
          kind: 'add_missing_relation',
          node: undefined,
          nodes: { from: { slug: 'domains/auth' }, to: { slug: 'capabilities/login' } },
          proposedAction: { tool: 'patch_concept', args: { from: 'domains/auth', to: 'capabilities/login', type: 'capabilities' } },
        }],
        nextExecutableAction: { ...valid.nextExecutableAction, kind: 'add_missing_relation' },
      }),
      /action maint_1 proposedAction\.tool must be add_relation/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        byKind: { add_missing_relation: 1 },
        actions: [{
          ...valid.actions[0],
          kind: 'add_missing_relation',
          node: undefined,
          nodes: { from: { slug: 'domains/auth' }, to: { slug: 'capabilities/login' } },
          proposedAction: { tool: 'add_relation', args: { from: 'domains/auth', to: 'capabilities/other', type: 'capabilities' } },
        }],
        nextExecutableAction: { ...valid.nextExecutableAction, kind: 'add_missing_relation' },
      }),
      /action maint_1 proposedAction endpoints must match node summaries/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        byKind: { materialize_external_element: 1 },
        actions: [{
          ...valid.actions[0],
          kind: 'materialize_external_element',
          node: undefined,
          proposedAction: { tool: 'add_concept', args: { slug: 'elements/src/foo', kind: 'capability' } },
        }],
        nextExecutableAction: { ...valid.nextExecutableAction, kind: 'materialize_external_element' },
      }),
      /action maint_1 proposedAction\.kind must be element/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, summary: { ...valid.summary, remainingActions: 0 } }),
      /actions length must not exceed summary\.remainingActions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, byPhase: { repair: -1 } }),
      /byPhase must be an object of non-negative integer counts/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, byPhase: { repair: 2 } }),
      /byPhase total must equal summary\.remainingActions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, nextExecutableAction: {} }),
      /nextExecutableAction must be null or an action pointer with id, executable, phase, kind, and severity/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, nextExecutableAction: { id: 'maint_1' } }),
      /nextExecutableAction must be null or an action pointer with id, executable, phase, kind, and severity/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextExecutableAction: { ...valid.nextExecutableAction, id: 'maint_other' },
      }),
      /nextExecutableAction must match the first executable action on the page/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextExecutableAction: { ...valid.nextExecutableAction, phase: 'link' },
      }),
      /nextExecutableAction\.phase must match the first page action/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextExecutableAction: { ...valid.nextExecutableAction, kind: 'add_missing_relation' },
      }),
      /nextExecutableAction\.kind must match the first page action/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextExecutableAction: { ...valid.nextExecutableAction, severity: 'info' },
      }),
      /nextExecutableAction\.severity must match the first page action/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextExecutableAction: { ...valid.nextExecutableAction, executable: false },
      }),
      /nextExecutableAction\.executable must match the first page action/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextReviewAction: {
          id: 'maint_review',
          phase: 'review',
          kind: 'unassigned_node',
          severity: 'info',
          executable: false,
        },
      }),
      /nextReviewAction must be null when the page has no review actions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...withReview,
        nextReviewAction: { ...withReview.nextReviewAction, kind: 'empty_domain' },
      }),
      /nextReviewAction\.kind must match the first page action/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...withReview,
        nextReviewAction: { ...withReview.nextReviewAction, executable: true },
      }),
      /nextReviewAction\.executable must match the first page action/,
    );
  });

  it('rejects malformed health and workspace_brief payloads before CLI output', () => {
    const health = {
      operation: 'health',
      status: 'healthy',
      summary: { nodes: 1, edges: 0 },
      checks: [{ id: 'compile_issues', status: 'pass', count: 0 }],
    };
    const workspaceBrief = {
      operation: 'workspace_brief',
      status: 'healthy',
      summary: { nodes: 1, edges: 0 },
      nextActions: [],
      health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      growth: { totalActions: 0 },
    };

    assert.equal(assertHealthShape(health), health);
    assert.equal(assertWorkspaceBriefShape(workspaceBrief), workspaceBrief);
    assert.throws(
      () => assertHealthShape({ ...health, checks: [{ id: 'compile_issues', status: 'pass' }] }),
      /health checks\[0\] has an invalid health-check shape/,
    );
    assert.throws(
      () => assertHealthShape({ ...health, summary: null }),
      /health summary must be an object/,
    );
    assert.throws(
      () => assertWorkspaceBriefShape({ ...workspaceBrief, nextActions: [{ kind: 'cleanup', severity: 'fatal' }] }),
      /workspace_brief nextActions\[0\] has an invalid next-action shape/,
    );
    assert.throws(
      () => assertWorkspaceBriefShape({ ...workspaceBrief, health: { checks: [] } }),
      /workspace_brief health\.checks must be a non-empty array/,
    );
    assert.throws(
      () => assertWorkspaceBriefShape({ ...workspaceBrief, growth: [] }),
      /workspace_brief growth must be an object when present/,
    );
  });

  it('rejects malformed cycles and find_path payloads before CLI output', () => {
    const cycles = {
      operation: 'cycles',
      totalCycles: 1,
      cycles: [{ id: 'a>b>a', length: 2, nodes: ['a', 'b', 'a'], edges: [{ id: 'a->b' }, { id: 'b->a' }] }],
    };
    const path = {
      found: true,
      hopCount: 1,
      hops: ['a', 'b'],
      edges: [{ from: 'a', to: 'b', via: 'relates' }],
    };

    assert.equal(assertCyclesShape(cycles), cycles);
    assert.equal(
      assertCyclesShape({
        operation: 'cycles',
        cycles: [
          {
            nodes: ['a', 'b', 'a'],
            nodeSummaries: [
              { slug: 'a', kind: 'capability', title: 'A' },
              { slug: 'b', kind: 'capability', title: 'B' },
              { slug: 'a', kind: 'capability', title: 'A' },
            ],
          },
        ],
      }).cycles[0].nodeSummaries.length,
      3,
    );
    assert.equal(assertCyclesShape({ operation: 'cycles', cycles: [] }).totalCycles, undefined);
    assert.equal(assertCyclesShape({ operation: 'cycles', cycles: [{ slugs: ['a', 'b', 'a'] }] }).cycles[0].slugs.length, 3);
    assert.equal(assertPathShape(path), path);
    assert.deepEqual(assertPathShape({ found: false }), { found: false });
    assert.throws(
      () => assertCyclesShape({ operation: 'cycles', totalCycles: -1, cycles: [] }),
      /cycles query totalCycles must be a non-negative integer/,
    );
    assert.throws(
      () => assertCyclesShape({ operation: 'cycles', totalCycles: 1, cycles: [{ slugs: ['a'] }] }),
      /cycles query cycles\[0\] has an invalid cycle shape/,
    );
    assert.throws(
      () => assertCyclesShape({
        operation: 'cycles',
        cycles: [{ nodes: ['a', 'b', 'a'], nodeSummaries: [{ slug: 'a', kind: 'capability', title: 'A' }] }],
      }),
      /cycles query cycles\[0\] has an invalid cycle shape/,
    );
    assert.throws(
      () => assertCyclesShape({
        operation: 'cycles',
        cycles: [
          {
            nodes: ['a', 'b', 'a'],
            nodeSummaries: [
              { slug: 'a', kind: 'capability', title: 'A' },
              { slug: 'x', kind: 'capability', title: 'B' },
              { slug: 'a', kind: 'capability', title: 'A' },
            ],
          },
        ],
      }),
      /cycles query cycles\[0\] has an invalid cycle shape/,
    );
    assert.throws(
      () => assertPathShape({ found: true, hops: ['a', 'b'], edges: [] }),
      /find_path response edges length must match hops length/,
    );
    assert.throws(
      () => assertPathShape({ found: true, hopCount: 2, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b', via: 'relates' }] }),
      /find_path response hopCount must match hops length/,
    );
    assert.throws(
      () => assertPathShape({ found: true, hops: ['a', 'b'], edges: [{ from: 'b', to: 'a', via: 'relates' }] }),
      /find_path response edges\[0\] has an invalid path-edge shape/,
    );
  });

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

  it('rejects malformed overview, centrality, and blast_radius payloads before CLI output', () => {
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
    const blastRadius = {
      operation: 'blast_radius',
      center: 'domains/auth',
      risk: 'low',
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

    assert.equal(assertOverviewShape(overview), overview);
    assert.equal(assertCentralityShape(centrality), centrality);
    assert.equal(assertBlastRadiusShape(blastRadius), blastRadius);
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
    assert.throws(
      () => assertBlastRadiusShape({ ...blastRadius, risk: 'unknown' }),
      /blast_radius risk must be one of: low, medium, high/,
    );
    assert.throws(
      () => assertBlastRadiusShape({ ...blastRadius, nodes: { total: 1, limited: false, rows: [{}] } }),
      /blast_radius nodes must be a page with valid node rows/,
    );
  });

  it('blocks compile results with graph issues or unresolved edges', () => {
    assert.deepEqual(compileBlockingCounts({ summary: { issues: 0, unresolvedEdges: 0 } }), {
      issues: 0,
      unresolvedEdges: 0,
    });
    assert.equal(compileResultExitCode({ summary: { issues: 0, unresolvedEdges: 0 } }), 0);
    assert.equal(compileResultExitCode({ summary: { issues: 1, unresolvedEdges: 0 } }), 1);
    assert.equal(compileResultExitCode({ summary: { issues: 0, unresolvedEdges: 1 } }), 1);
    assert.equal(compileResultExitCode({ issueCount: 1, unresolvedEdgeCount: 1 }), 1);
    assert.equal(compileResultExitCode({}), 1);
    assert.equal(compileResultExitCode({ summary: { issues: 0 } }), 1);
    assert.equal(compileResultExitCode({ summary: { issues: -1, unresolvedEdges: 0 } }), 1);
    assert.equal(Number.isNaN(compileBlockingCounts({}).issues), true);
  });

  it('blocks graph query results that represent broken gates', () => {
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [] }), 0);
    assert.equal(cyclesResultExitCode({ cycles: [] }), 0);
    assert.equal(cyclesResultExitCode({ cycles: [{ nodes: ['a', 'b', 'a'], edges: [{}, {}] }] }), 1);
    assert.equal(cyclesResultExitCode({ cycles: [{ slugs: ['a', 'b', 'a'] }] }), 1);
    assert.equal(cyclesResultExitCode({}), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: -1, cycles: [] }), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [null] }), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [{ slugs: ['a'] }] }), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [{ slugs: ['a', ''] }] }), 1);

    assert.equal(pathResultExitCode({ found: true, hopCount: 1, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b', via: 'relates' }] }), 0);
    assert.equal(pathResultExitCode({ found: false }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: [] }), 1);
    assert.equal(pathResultExitCode({ found: true }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: [null] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', '  '], edges: [{ from: 'a', to: '  ', via: 'relates' }] }), 1);
    assert.equal(pathResultExitCode({ found: true, hopCount: 2, hops: ['a', 'b'] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{}] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{ from: 'b', to: 'a', via: 'relates' }] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b' }] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b', via: '  ' }] }), 1);

    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] }), 0);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [] }), 1);
    assert.equal(healthResultExitCode({ status: 'pass', checks: [] }), 1);
    assert.equal(healthResultExitCode({ status: 'needs_attention' }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy' }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'fail', count: 1 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues' }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'pass' }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'pass', count: -1 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ status: 'pass', count: 0 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: '  ', status: 'pass', count: 0 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'fial', count: 0 }] }), 1);

    assert.equal(
      workspaceBriefExitCode({
        status: 'needs_attention',
        nextActions: [{ kind: 'cleanup', severity: 'warn' }],
        health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      }),
      0,
    );
    assert.equal(
      workspaceBriefExitCode({ status: 'ok', nextActions: [], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }),
      1,
    );
    assert.equal(
      workspaceBriefExitCode({
        status: 'healthy',
        nextActions: [{ kind: 'cleanup', severity: 'fail' }],
        health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      }),
      1,
    );
    assert.equal(workspaceBriefExitCode({ health: { checks: [{ id: 'compile_issues', status: 'fail', count: 1 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ nextActions: [] }), 1);
    assert.equal(
      workspaceBriefExitCode({
        nextActions: [{ kind: 'cleanup', severity: 'fatal' }],
        health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      }),
      1,
    );
    assert.equal(workspaceBriefExitCode({ nextActions: [{ severity: 'warn' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ nextActions: [{ kind: 'cleanup' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ status: 'healthy', nextActions: [{ kind: '  ', severity: 'warn' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ status: 'healthy', nextActions: [], health: { checks: [] } }), 1);
    assert.equal(
      workspaceBriefExitCode({ nextActions: [], health: { checks: [{ id: 'compile_issues' }] } }),
      1,
    );
    assert.equal(
      workspaceBriefExitCode({ nextActions: [], health: { checks: [{ id: 'compile_issues', status: 'warning' }] } }),
      1,
    );
  });
});
