// When a name changes, **the relation's rationale follows it** — and the gate must
// not treat that as a defect.
//
// Why (measured 2026-08-17): this repository's broadest dogfood gate
// (`pnpm dogfood:verify`) was red:
//
//   ✗ rename_concept dry-run response backlinkUpdates.updates[0].beforeKeys[1] before drift
//
// Reproducing it showed **the behaviour was correct**. Renaming
// `capabilities/mcp-server` carries `capabilities/acp-runtime`'s rationale along:
//
//   before: { "capabilities/mcp-server":   "ACP 세션은 …" }
//   after : { "capabilities/mcp-server-x": "ACP 세션은 …" }
//
// What was wrong was **the gate's contract**: it pinned `before`/`after` to a
// string or an array of strings, while `relation_notes` is a **map**. So correct
// behaviour lit up red.
//
// > **A gate that fires on correct behaviour is a gate that gets switched off.**
// > It is the mirror image of a gate that catches nothing, with the same outcome —
// > nobody looks at it.
//
// So the contract is widened but **not loosened**: string, array of strings, and a
// **flat string map**. Anything nested is still rejected.

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

test('빈 컬렉션은 거절한다 — 백링크 변경 행에 담을 값이 없다', () => {
  assert.equal(isBacklinkKeyValue([]), false);
  assert.equal(isBacklinkKeyValue({}), false);
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
