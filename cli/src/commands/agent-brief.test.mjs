import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readinessExitCode } from './agent-brief.mjs';

// R+ (agent-persona-2026-07 QA friction #5) — agent-brief's exit code
// encodes graph readiness, not command success. --exit-zero lets scripting
// read status/readiness from JSON instead of misreading a "needs_attention"
// vault as a failed command.
describe('agent-brief readinessExitCode', () => {
  const baseReadiness = {
    score: 100,
    meaningfulNodes: 1,
    relationCount: 1,
    projects: 1,
    domains: 1,
    capabilities: 1,
    elements: 1,
    unresolvedEdges: 0,
    externalEdges: 0,
    growthActions: 0,
    healthChecks: 1,
  };
  const healthyResult = {
    status: 'healthy',
    readiness: { ...baseReadiness, status: 'ready' },
    health: { checks: [{ id: 'x', status: 'pass', count: 0, message: 'ok' }] },
    nextActions: [],
  };
  const needsAttentionResult = {
    status: 'needs_attention',
    readiness: { ...baseReadiness, status: 'needs_attention', score: 75 },
    health: { checks: [{ id: 'x', status: 'pass', count: 0, message: 'ok' }] },
    nextActions: [],
  };

  it('exits 0 for a healthy/ready result regardless of --exit-zero', () => {
    assert.equal(readinessExitCode(healthyResult, false), 0);
    assert.equal(readinessExitCode(healthyResult, true), 0);
  });

  it('exits 1 for a needs_attention result without --exit-zero', () => {
    assert.equal(readinessExitCode(needsAttentionResult, false), 1);
  });

  it('--exit-zero silences the needs_attention readiness signal', () => {
    assert.equal(readinessExitCode(needsAttentionResult, true), 0);
  });
});
