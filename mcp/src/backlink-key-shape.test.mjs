// A rename carries the relation's rationale map along, and the gate must accept
// that: widened to a flat string map, not loosened (nesting is still rejected).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isBacklinkKeyValue } from './backlink-key-shape.mjs';

test('accepts a string and a string array as they are', () => {
  assert.equal(isBacklinkKeyValue('domains/auth'), true);
  assert.equal(isBacklinkKeyValue(['a', 'b']), true);
});

test('accepts a relation reason map in its observed shape', () => {
  assert.equal(
    isBacklinkKeyValue({ 'capabilities/mcp-server': 'ACP 세션은 이 서버를 주입받는다' }),
    true,
  );
});

test('rejects an empty collection: a backlink change row has no value to hold', () => {
  assert.equal(isBacklinkKeyValue([]), false);
  assert.equal(isBacklinkKeyValue({}), false);
});

test('still rejects nesting: the check widens, it does not loosen', () => {
  assert.equal(isBacklinkKeyValue({ a: { b: 'c' } }), false);
  assert.equal(isBacklinkKeyValue({ a: ['b'] }), false);
  assert.equal(isBacklinkKeyValue([['a']]), false);
});

test('rejects a messy string, the property the original check guarded', () => {
  assert.equal(isBacklinkKeyValue(' 앞뒤 공백 '), false);
  assert.equal(isBacklinkKeyValue(''), false);
  assert.equal(isBacklinkKeyValue('널\u0000문자'), false);
  assert.equal(isBacklinkKeyValue({ a: ' 공백 ' }), false);
});

test('rejects a value that is neither an array nor a map', () => {
  assert.equal(isBacklinkKeyValue(7), false);
  assert.equal(isBacklinkKeyValue(null), false);
  assert.equal(isBacklinkKeyValue(undefined), false);
  assert.equal(isBacklinkKeyValue(true), false);
});
