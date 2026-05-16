import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertQueryOperation,
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
    assert.equal(pathResultExitCode({ found: true, hopCount: 2, hops: ['a', 'b'] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{}] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{ from: 'b', to: 'a', via: 'relates' }] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b' }] }), 1);

    assert.equal(healthResultExitCode({ status: 'healthy', checks: [] }), 0);
    assert.equal(healthResultExitCode({ status: 'pass', checks: [] }), 0);
    assert.equal(healthResultExitCode({ status: 'needs_attention' }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy' }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ status: 'fail' }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues' }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ status: 'pass' }] }), 1);

    assert.equal(
      workspaceBriefExitCode({ nextActions: [{ kind: 'cleanup', severity: 'warn' }], health: { checks: [] } }),
      0,
    );
    assert.equal(
      workspaceBriefExitCode({ nextActions: [{ kind: 'cleanup', severity: 'fail' }], health: { checks: [] } }),
      1,
    );
    assert.equal(workspaceBriefExitCode({ health: { checks: [{ id: 'compile_issues', status: 'fail' }] } }), 1);
    assert.equal(workspaceBriefExitCode({ nextActions: [] }), 1);
    assert.equal(workspaceBriefExitCode({ nextActions: [{ severity: 'warn' }], health: { checks: [] } }), 1);
    assert.equal(workspaceBriefExitCode({ nextActions: [{ kind: 'cleanup' }], health: { checks: [] } }), 1);
    assert.equal(
      workspaceBriefExitCode({ nextActions: [], health: { checks: [{ id: 'compile_issues' }] } }),
      1,
    );
  });
});
