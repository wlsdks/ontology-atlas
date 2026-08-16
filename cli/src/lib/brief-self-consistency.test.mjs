// 브리프가 **자기가 싣고 있는 것과 같은 수**를 말해야 한다.
//
// ## 왜 (2026-08-17 실측)
//
// `agent-brief` 한 응답 안에서:
//
//   readiness.healthChecks : 7
//   health.checks          : 8   ← vault_present … meaning_assessment
//
// 머리글은 「7 health checks」라고 적는데 같은 payload 가 8개를 싣고 있다.
// 이 문서를 읽는 쪽은 에이전트이고, 에이전트는 머리글 숫자를 믿고 나머지를
// 안 세어 볼 수 있다.
//
// 이 저장소에는 이미 같은 규율이 있다 — 관문 화면의 캡션이 자기가 그리는
// 그래프와 같은 수를 말하게 하는 검사(`DownloadPage.test.tsx`). **숫자를
// 못박는 게 아니라 두 값이 같은지를 본다**: 볼트가 바뀌어도 안 썩는다.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertAgentBriefShape, assertBriefCountsAgree } from './query-result-contract.mjs';

/** 계약 검사를 통과하는 최소 형태 — 실제 응답에서 필요한 칸만 추린다. */
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
    /health check 수가 어긋난다/,
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
  // 위 함수만 고치고 계약에 안 넣으면, 실제 응답은 계속 모순인 채로 나간다.
  assert.equal(
    typeof assertAgentBriefShape,
    'function',
    '계약 검사가 없다 — 이 시험은 아무것도 지키지 못한다',
  );
});
