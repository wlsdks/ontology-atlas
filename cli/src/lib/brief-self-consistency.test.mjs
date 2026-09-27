// A brief must state **the same number it is carrying**.
//
// **Why** (measured 2026-08-17): within one `agent-brief` response —
//
//   readiness.healthChecks : 7
//   health.checks          : 8   ← vault_present … meaning_assessment
//
// The headline says "7 health checks" while the same payload carries eight. The
// reader here is an agent, and an agent can trust the headline number without
// counting the rest.
//
// This repository already has the same discipline — the check that makes the
// gateway caption state the same number as the graph it draws
// (`DownloadPage.test.tsx`). **Pin nothing; assert the two values agree**, so it
// does not rot as the vault changes.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertAgentBriefShape, assertBriefCountsAgree } from './query-result-contract.mjs';

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

test('the agent-brief contract check exists', () => {
  // Fixing the function above without wiring it into the contract would leave real
  // responses going out self-contradictory.
  assert.equal(
    typeof assertAgentBriefShape,
    'function',
    'the contract check is missing',
  );
});
