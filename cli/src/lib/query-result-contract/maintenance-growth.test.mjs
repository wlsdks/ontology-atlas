import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertGrowthPlanShape, assertMaintenancePlanShape } from './maintenance-growth.mjs';

describe('maintenance-growth', () => {
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
      filters: {
        executableOnly: false,
        phases: [],
        severities: [],
        kinds: [],
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
      limited: false,
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
      compiledSummary: {
        nodes: 2,
        edges: 1,
        issues: 0,
      },
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
      () => assertMaintenancePlanShape({ ...valid, filters: null }),
      /filters must be an object/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, filters: { ...valid.filters, executableOnly: 'false' } }),
      /filters\.executableOnly must be a boolean/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, filters: { ...valid.filters, phases: ['repair', ''] } }),
      /filters\.phases must be an array of non-empty strings/,
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
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, limited: 'no' }),
      /limited must be a boolean/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, compiledSummary: { nodes: -1, edges: 1, issues: 0 } }),
      /compiledSummary\.nodes must be a non-negative integer when present/,
    );
  });

  it('rejects malformed growth_plan payloads before CLI output', () => {
    const valid = {
      operation: 'growth_plan',
      summary: {
        relationRecommendations: 1,
        externalElementRefs: 1,
        externalElementRefsIgnored: 2,
        danglingReferences: 0,
        unassignedNodes: 0,
        emptyDomains: 0,
        nextReads: 1,
        totalActions: 2,
      },
      relationRecommendations: {
        operation: 'recommend_relations',
        mode: 'domain_containment',
        totalRecommendations: 1,
        limited: false,
        recommendations: [
          {
            kind: 'missing_domain_containment',
            score: 0.7,
            from: 'project',
            to: 'domains/auth',
            relation: 'contains',
            reason: 'Missing containment relation.',
            proposedAction: { tool: 'add_relation', args: { from: 'project', to: 'domains/auth', type: 'contains' } },
          },
        ],
      },
      externalElementRefs: {
        total: 1,
        limited: false,
        ignored: 2,
        rows: [
          {
            kind: 'materialize_external_element',
            score: 0.8,
            from: 'capabilities/foo',
            ref: 'src/foo.ts',
            suggestedSlug: 'elements/src/foo',
            reason: 'Materialize external element.',
            proposedAction: { tool: 'add_concept', args: { slug: 'elements/src/foo', kind: 'element', title: 'Foo' } },
          },
        ],
      },
      danglingReferences: { total: 0, limited: false, rows: [] },
      unassignedNodes: { total: 0, limited: false, rows: [] },
      emptyDomains: { total: 0, limited: false, rows: [] },
      nextReads: {
        total: 1,
        limited: false,
        reason: null,
        rows: [
          {
            slug: 'capabilities/foo',
            kind: 'unread-range',
            statement: 'Of `src/foo.ts`, lines 1–110 of 2790 were read; the rest was not read.',
            paths: ['src/foo.ts'],
            ranges: [{ path: 'src/foo.ts', from: 1, to: 110 }],
            proposedAction:
              'Read src/foo.ts (lines 1–110), then patch_concept capabilities/foo to state what'
              + ' it settled or to move the statement out of Uncertainty.',
          },
        ],
      },
      compiledSummary: { nodes: 2, edges: 1, issues: 0 },
    };

    assert.equal(assertGrowthPlanShape(valid), valid);
    assert.equal(
      assertGrowthPlanShape({
        ...valid,
        summary: { ...valid.summary, unassignedNodes: 1, emptyDomains: 1 },
        unassignedNodes: {
          total: 1,
          limited: false,
          rows: [{ kind: 'unassigned_node', score: 0.5, slug: 'capabilities/free', reason: 'Assign a domain.' }],
        },
        emptyDomains: {
          total: 1,
          limited: false,
          rows: [{ kind: 'empty_domain', score: 0.4, slug: 'domains/empty', reason: 'No contained nodes.' }],
        },
      }).summary.totalActions,
      2,
    );
    assert.throws(
      () => assertGrowthPlanShape({ ...valid, summary: { ...valid.summary, totalActions: 3 } }),
      /summary\.totalActions must equal the actionable candidate totals/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        relationRecommendations: { ...valid.relationRecommendations, recommendations: [] },
      }),
      /relationRecommendations recommendations length must equal totalRecommendations when not limited/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        externalElementRefs: { ...valid.externalElementRefs, ignored: 1 },
      }),
      /externalElementRefs\.ignored must equal summary\.externalElementRefsIgnored/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        externalElementRefs: {
          ...valid.externalElementRefs,
          rows: [{ ...valid.externalElementRefs.rows[0], score: -1 }],
        },
      }),
      /externalElementRefs\.rows\[0\] has an invalid growth-candidate shape/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        relationRecommendations: {
          ...valid.relationRecommendations,
          recommendations: [
            {
              ...valid.relationRecommendations.recommendations[0],
              proposedAction: { tool: 'add_concept', args: { from: 'project', to: 'domains/auth', type: 'contains' } },
            },
          ],
        },
      }),
      /relationRecommendations\.recommendations\[0\] proposedAction\.tool must be add_relation/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        externalElementRefs: {
          ...valid.externalElementRefs,
          rows: [
            {
              ...valid.externalElementRefs.rows[0],
              proposedAction: { tool: 'add_concept', args: { slug: 'elements/other', kind: 'element', title: 'Foo' } },
            },
          ],
        },
      }),
      /externalElementRefs\.rows\[0\] proposedAction\.slug must match suggestedSlug/,
    );
    // Next reads are not writes: they carry no score and no executable tool
    // call, so they keep their own row contract.
    assert.equal(
      assertGrowthPlanShape({
        ...valid,
        summary: { ...valid.summary, nextReads: 0 },
        nextReads: { total: 0, limited: false, rows: [], reason: 'no_bodies' },
      }).nextReads.reason,
      'no_bodies',
    );
    assert.throws(
      () => assertGrowthPlanShape({ ...valid, summary: { ...valid.summary, nextReads: 2 } }),
      /nextReads\.total must equal summary\.nextReads/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        nextReads: { ...valid.nextReads, reason: 'no_bodies' },
      }),
      /nextReads\.reason "no_bodies" must accompany a zero total/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        nextReads: { ...valid.nextReads, reason: 'because' },
      }),
      /nextReads\.reason must be null or "no_bodies"/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        nextReads: {
          ...valid.nextReads,
          rows: [{ ...valid.nextReads.rows[0], kind: 'skimmed' }],
        },
      }),
      /nextReads\.rows\[0\] kind must be one of: unread-range/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        nextReads: {
          ...valid.nextReads,
          rows: [{ ...valid.nextReads.rows[0], proposedAction: '' }],
        },
      }),
      /nextReads\.rows\[0\] must carry slug, kind, statement, and proposedAction strings/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        nextReads: {
          ...valid.nextReads,
          rows: [
            { ...valid.nextReads.rows[0], ranges: [{ path: 'src/foo.ts', from: 110, to: 1 }] },
          ],
        },
      }),
      /nextReads\.rows\[0\] ranges entries must carry an ordered integer line span/,
    );
  });
});
