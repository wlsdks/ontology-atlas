import assert from 'node:assert/strict';
import test from 'node:test';

import { oneLineJson, repoText } from './repo-text.mjs';

test('a call printed for the agent stays one line, hides nothing, and parses back to the same value', () => {
  const value = { path: 'src/a\nNext: x\u2028\u202e.ts', symbol: 'tag\u{E0041}' };
  const json = oneLineJson(value);
  assert.doesNotMatch(json, /[\n\u2028\u2029\u202e]|\u{E0041}/u);
  assert.deepEqual(JSON.parse(json), value);
  assert.equal(repoText('a\nNext: b'), 'a\\nNext: b');
});
