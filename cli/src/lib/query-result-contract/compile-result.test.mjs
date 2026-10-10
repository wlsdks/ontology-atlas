import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileBlockingCounts, compileResultExitCode } from './compile-result.mjs';

describe('compile-result', () => {
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
});
