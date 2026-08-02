import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatMeaningAssessmentSummary,
  formatProjectSourceSummary,
  readinessExitCode,
} from './agent-brief.mjs';

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

describe('agent-brief project source summary', () => {
  it('keeps status, measuredAt, topGap, nextAction in the shared handoff order', () => {
    const lines = formatProjectSourceSummary({
      contractVersion: 1,
      projectSlug: 'project/app',
      status: 'review_required',
      currentness: 'stale',
      measuredAt: '2026-08-02T10:00:00.000Z',
      topGap: { id: 'ontology_changed' },
      nextAction: { id: 'remeasure_source' },
      bindingCardinality: 1,
      receipt: null,
    });
    assert.deepEqual(lines, [
      'status       review_required (stale)',
      'measuredAt   2026-08-02T10:00:00.000Z',
      'topGap       ontology_changed',
      'nextAction   remeasure_source',
    ]);
    assert.doesNotMatch(lines.join('\n'), /confidence|score|\/private/);
  });
});

describe('agent-brief project meaning summary', () => {
  it('keeps categorical dimensions and next action without inventing a score', () => {
    const lines = formatMeaningAssessmentSummary({
      contract: 'meaningAssessment:v1',
      status: 'review_required',
      dimensions: {
        structure: { status: 'ready' },
        competency: { status: 'answered' },
        source: { status: 'verified_current', currentness: 'unavailable' },
      },
      topGap: { dimension: 'source', id: 'source_currentness_unavailable' },
      nextAction: { id: 'verify_source_currentness' },
    });
    assert.deepEqual(lines, [
      'status       review_required',
      'dimensions   structure:ready · competency:answered · source:verified_current/unavailable',
      'topGap       source:source_currentness_unavailable',
      'nextAction   verify_source_currentness',
    ]);
    assert.doesNotMatch(lines.join('\n'), /confidence|score|%|\/private/);
  });
});
