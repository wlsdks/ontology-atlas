// A brief must state the same number it carries: an agent trusts the headline count without counting.
// Pin nothing; assert the two values agree, so it does not rot as the vault changes.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertBriefCountsAgree } from './query-result-contract/agent-brief.mjs';

/** The minimum shape that passes the contract check — only the fields a real response needs. */
function briefWith(healthChecks, checks) {
  return {
    readiness: { healthChecks },
    health: { status: 'needs_attention', checks },
  };
}

test('catches a stated count that differs from the listed checks', () => {
  const brief = briefWith(7, [{ id: 'a' }, { id: 'b' }]);
  assert.throws(
    () => assertBriefCountsAgree(brief),
    /health-check counts disagree/,
    'a self-contradicting brief must be rejected',
  );
});

test('passes when the counts agree', () => {
  assertBriefCountsAgree(briefWith(2, [{ id: 'a' }, { id: 'b' }]));
});

test('does not judge when either count is missing', () => {
  assertBriefCountsAgree({ health: { checks: [{ id: 'a' }] } });
  assertBriefCountsAgree({ readiness: { healthChecks: 3 } });
  assertBriefCountsAgree({});
});
