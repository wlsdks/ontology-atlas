// 이름을 바꿀 때 **관계의 이유도 따라간다** — 그리고 게이트가 그걸 결함으로
// 보지 않아야 한다.
//
// ## 왜 (2026-08-17 실측)
//
// 이 저장소의 가장 넓은 도그푸드 게이트(`pnpm dogfood:verify`)가 빨간불이었다:
//
//   ✗ rename_concept dry-run response backlinkUpdates.updates[0].beforeKeys[1] before drift
//
// 재현해 보니 **동작은 맞았다**. `capabilities/mcp-server` 를 바꿀 때
// `capabilities/acp-runtime` 의 이유가 이렇게 따라간다:
//
//   before: { "capabilities/mcp-server":   "ACP 세션은 …" }
//   after : { "capabilities/mcp-server-x": "ACP 세션은 …" }
//
// 틀린 것은 **게이트의 계약**이었다: `before`/`after` 가 문자열이거나 문자열
// 배열이어야 한다고 못박아 두었는데, `relation_notes` 는 **맵**이다. 그래서
// 맞는 동작에 빨간불이 켜졌다.
//
// > **맞는 동작에 켜지는 게이트는, 꺼지는 게이트다.** 「못 잡는 게이트」와
// > 방향만 반대이고 결과는 같다 — 아무도 안 본다.
//
// 그래서 계약을 넓히되 **느슨하게는 안 한다**: 문자열 · 문자열 배열 ·
// **납작한 문자열 맵**까지다. 중첩된 것은 여전히 거절한다.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isBacklinkKeyValue } from './backlink-key-shape.mjs';

test('문자열과 문자열 배열은 그대로 받는다', () => {
  assert.equal(isBacklinkKeyValue('domains/auth'), true);
  assert.equal(isBacklinkKeyValue(['a', 'b']), true);
});

test('관계 이유 맵을 받는다 — 실측 모양 그대로', () => {
  assert.equal(
    isBacklinkKeyValue({ 'capabilities/mcp-server': 'ACP 세션은 이 서버를 주입받는다' }),
    true,
  );
});

test('빈 맵도 받는다 — 이유를 다 지운 상태가 있을 수 있다', () => {
  assert.equal(isBacklinkKeyValue({}), true);
});

test('중첩된 것은 여전히 거절한다 — 넓히는 것이지 푸는 것이 아니다', () => {
  assert.equal(isBacklinkKeyValue({ a: { b: 'c' } }), false);
  assert.equal(isBacklinkKeyValue({ a: ['b'] }), false);
  assert.equal(isBacklinkKeyValue([['a']]), false);
});

test('지저분한 문자열은 거절한다 — 원래 검사가 지키던 성질이다', () => {
  assert.equal(isBacklinkKeyValue(' 앞뒤 공백 '), false);
  assert.equal(isBacklinkKeyValue(''), false);
  assert.equal(isBacklinkKeyValue('널\u0000문자'), false);
  assert.equal(isBacklinkKeyValue({ a: ' 공백 ' }), false);
});

test('배열도 아니고 맵도 아닌 것은 거절한다', () => {
  assert.equal(isBacklinkKeyValue(7), false);
  assert.equal(isBacklinkKeyValue(null), false);
  assert.equal(isBacklinkKeyValue(undefined), false);
  assert.equal(isBacklinkKeyValue(true), false);
});
