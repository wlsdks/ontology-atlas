import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ok, okResponseBytes } from './server/rpc.mjs';

test('okResponseBytes equals the UTF-8 length of the serialized ok() response', () => {
  const results = [
    {},
    { text: 'quote " backslash \\ newline \n tab \t end', nested: [{ a: 1 }, [], {}], unicode: '한국어 ✓ 𝄞' },
    { paths: ['C:\\repo\\file.ts', 'src/a b/c.ts'], empty: '', number: -1.5e-7, flag: true, none: null },
    { lone: '\ud800', control: '\u0001\u001f', spaced: '  "  :  ,  ' },
  ];
  for (const result of results) {
    assert.equal(okResponseBytes(result), Buffer.byteLength(JSON.stringify(ok(result)), 'utf8'));
  }
});
