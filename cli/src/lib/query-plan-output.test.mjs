import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatQueryHint,
  formatQueryPlanLines,
  shouldBlockPlannedExecution,
} from './query-plan-output.mjs';

const COLORS = Object.freeze({
  green: '<green>',
  yellow: '<yellow>',
  dim: '<dim>',
  bold: '<bold>',
  reset: '<reset>',
});

function plan(overrides = {}) {
  return {
    execution: {
      shouldRun: true,
      nextStep: 'run',
      recommendation: 'Run suggestedQuery as planned.',
      suggestedQuery: { operation: 'blast_radius', slug: 'capabilities/foo' },
      ...overrides.execution,
    },
    estimate: {
      strategy: 'bounded_graph_expansion',
      costClass: 'low',
      resultUpperBound: 3,
      ...overrides.estimate,
    },
    warnings: overrides.warnings ?? [],
  };
}

test('shouldBlockPlannedExecution blocks false shouldRun and warning plans', () => {
  assert.equal(shouldBlockPlannedExecution(plan()), false);
  assert.equal(shouldBlockPlannedExecution(plan({ execution: { shouldRun: false } })), true);
  assert.equal(shouldBlockPlannedExecution(plan({ warnings: ['review before running'] })), true);
});

test('formatQueryPlanLines renders warning count, safer query, and warnings', () => {
  const lines = formatQueryPlanLines(
    plan({
      execution: {
        shouldRun: false,
        nextStep: 'review',
        recommendation: 'Review warnings before running suggestedQuery.',
        saferQuery: { operation: 'all_paths', maxHops: 2 },
      },
      estimate: { strategy: 'bounded_path_enumeration', costClass: 'medium' },
      warnings: ['all_paths may be truncated by limit.'],
    }),
    COLORS,
  );

  assert.match(lines[0], /query_plan/);
  assert.match(lines[0], /review/);
  assert.match(lines[0], /strategy=bounded_path_enumeration/);
  assert.match(lines[0], /cost=medium/);
  assert.match(lines[0], /warnings=1/);
  assert.match(lines.join('\n'), /safer/);
  assert.match(lines.join('\n'), /"maxHops":2/);
  assert.match(lines.join('\n'), /all_paths may be truncated by limit/);
});

test('formatQueryHint falls back for missing or non-object safer queries', () => {
  assert.equal(formatQueryHint(null, 'narrow bounds'), 'narrow bounds');
  assert.equal(formatQueryHint('bad', 'narrow bounds'), 'narrow bounds');
  assert.equal(formatQueryHint({ operation: 'blast_radius', depth: 1 }), '{"operation":"blast_radius","depth":1}');
});
