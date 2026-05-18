import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertCyclesShape,
  assertHealthShape,
  assertMaintenancePlanShape,
  assertPathShape,
  assertQueryOperation,
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
        hasMore: true,
      },
      byPhase: { repair: 1 },
      bySeverity: { warn: 1 },
      byKind: { canonicalize_graph_arrays: 1 },
      nextExecutableAction: { id: 'maint_1' },
      nextReviewAction: null,
      actions: [
        {
          id: 'maint_1',
          phase: 'repair',
          kind: 'canonicalize_graph_arrays',
          severity: 'warn',
          executable: true,
          score: 100,
        },
      ],
    };

    assert.equal(assertMaintenancePlanShape(valid), valid);
    assert.equal(
      assertMaintenancePlanShape({
        ...valid,
        cursor: {
          afterActionId: null,
          found: true,
          reason: null,
          nextAfterActionId: null,
          hasMore: false,
        },
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
      () => assertMaintenancePlanShape({ ...valid, cursor: { ...valid.cursor, hasMore: 'no' } }),
      /cursor\.hasMore must be a boolean/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, actions: [{ ...valid.actions[0], score: '100' }] }),
      /actions\[0\] has an invalid action shape/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, byPhase: { repair: -1 } }),
      /byPhase must be an object of non-negative integer counts/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, nextExecutableAction: {} }),
      /nextExecutableAction must be null or an action pointer with an id/,
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
