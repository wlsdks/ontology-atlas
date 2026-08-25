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

test('말한 수와 실은 수가 다르면 잡는다', () => {
  const brief = briefWith(7, [{ id: 'a' }, { id: 'b' }]);
  assert.throws(
    () => assertBriefCountsAgree(brief),
    /health-check counts disagree/,
    '브리프가 자기 안에서 모순인데 아무도 안 잡으면, 그 문서를 읽는 에이전트가 틀린 수를 믿는다',
  );
});

test('같으면 통과한다 — 늘 실패하면 그것도 검사가 아니다', () => {
  assertBriefCountsAgree(briefWith(2, [{ id: 'a' }, { id: 'b' }]));
});

test('둘 중 하나가 없으면 판정하지 않는다 — 없는 모순을 만들지 않는다', () => {
  assertBriefCountsAgree({ health: { checks: [{ id: 'a' }] } });
  assertBriefCountsAgree({ readiness: { healthChecks: 3 } });
  assertBriefCountsAgree({});
});

test('진짜 계약 검사에도 이 규칙이 들어 있다', () => {
  // Fixing the function above without wiring it into the contract would leave real
  // responses going out self-contradictory.
  assert.equal(
    typeof assertAgentBriefShape,
    'function',
    '계약 검사가 없다 — 이 시험은 아무것도 지키지 못한다',
  );
});
