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
//   before: { "capabilities/mcp-server":   "ACP sessions are …" }
//   after : { "capabilities/mcp-server-x": "ACP sessions are …" }
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
